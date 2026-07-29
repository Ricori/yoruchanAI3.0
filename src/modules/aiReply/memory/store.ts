import { printError } from '@/utils/print';
import { getMemoryDb, type MemoryDatabase } from './db';
import { segment } from './segment';
import { deleteEmbeddings } from './vector';

/**
 * 结构化记忆的存取。
 *
 * 取代原来「每人一个 JSON、6 条裸字符串 trait、每 30 句整体重生成」的做法：
 * 每条记忆是一行，带时间、来源、置信度和被印证次数，能单独更新、过期和软删。
 * 长期事实（在读研究生）和短期热点（最近在打黑神话）不再抢同一批格子。
 */

/** 软删的哨兵值。写真实 id 表示被某条新记忆取代，写 -1 表示直接失效 */
const DELETED = -1;

/** 每人保留多少条非 pinned 记忆，超出的按分数从低到高软删 */
const MAX_ITEMS_PER_USER = 12;

/** 档案行里最多列几条印象，避免每轮回复的 prompt 被记忆撑爆 */
const MAX_INJECT_TRAITS = 6;

/** 衰减时间常数，30 天前的记忆权重降到 1/e */
const DECAY_TAU_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MemoryKind = 'trait' | 'episode' | 'relation' | 'alias';

export interface MemoryItem {
  id: number;
  ownerId: number;
  groupId: number | null;
  kind: string;
  text: string;
  firstSeen: number;
  lastSeen: number;
  hits: number;
  confidence: number;
  pinned: boolean;
  source: string | null;
}

export interface MemoryOp {
  op: 'ADD' | 'UPDATE' | 'DELETE';
  id?: number;
  kind?: string;
  text?: string;
  confidence?: number;
}

/** 管理面板的找人结果 */
export interface UserHit {
  userId: number;
  nick: string | null;
  aliases: string[];
  count: number;
}

/** 管理面板的群清单，用聊天量判断哪些群值得写档案 */
export interface GroupHit {
  groupId: number;
  lines: number;
  lastDate: number;
}

/** 管理面板能改的字段，其余（hits、first_seen 等）由运行时自己维护 */
export interface MemoryPatch {
  kind?: MemoryKind;
  text?: string;
  confidence?: number;
  pinned?: boolean;
}

export interface ApplyResult {
  added: number[];
  updated: number[];
  deleted: number[];
  /** 被 pinned 保护挡下来的操作条数 */
  blocked: number;
}

interface MemoryRow {
  id: number;
  owner_id: number;
  group_id: number | null;
  kind: string;
  text: string;
  first_seen: number;
  last_seen: number;
  hits: number;
  confidence: number;
  pinned: number;
  source: string | null;
}

function toItem(r: MemoryRow): MemoryItem {
  return {
    id: r.id,
    ownerId: r.owner_id,
    groupId: r.group_id,
    kind: r.kind,
    text: r.text,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    hits: r.hits,
    confidence: r.confidence,
    pinned: r.pinned === 1,
    source: r.source,
  };
}

/**
 * 淘汰用的分数：置信度 × 时间衰减 × 印证次数。
 * 说过一次就再没提起的会自己沉下去，天天挂嘴边的留得住。
 *
 * 时间按天取整：衰减常数是 30 天，毫秒级的先后没有意义，
 * 留着反而会让同一批写入的条目因为相差几毫秒排出随机顺序，
 * 每次注入的档案行都在抖
 */
function memoryScore(item: MemoryItem, now = Date.now()): number {
  const days = Math.floor(Math.max(0, now - item.lastSeen) / DAY_MS);
  return item.confidence * Math.exp(-days / DECAY_TAU_DAYS) * Math.log(1 + item.hits);
}

class MemoryStore {
  /** 昵称基本不变，缓存住就不用每条消息都写库 */
  private nickCache = new Map<number, string>();

  private db(): MemoryDatabase {
    return getMemoryDb();
  }

  // ========== 昵称 ==========

  /** 记下群友当前昵称，只在变了的时候写库 */
  noteNickName(userId: number, nick: string, db = this.db()) {
    if (!nick || userId === 0 || this.nickCache.get(userId) === nick) return;
    this.nickCache.set(userId, nick);
    db.prepare(
      'INSERT INTO user_profile (user_id, nick, updated_at) VALUES (?, ?, ?)'
      + ' ON CONFLICT(user_id) DO UPDATE SET nick = excluded.nick, updated_at = excluded.updated_at',
    ).run(userId, nick, Date.now());
  }

  getNickName(userId: number, db = this.db()): string | null {
    const cached = this.nickCache.get(userId);
    if (cached) return cached;
    const row = db.prepare('SELECT nick FROM user_profile WHERE user_id = ?').get(userId) as { nick: string } | undefined;
    if (row) this.nickCache.set(userId, row.nick);
    return row?.nick ?? null;
  }

  // ========== 读取 ==========

  /** 某人当前有效的全部记忆，按分数降序 */
  listUserMemories(userId: number, db = this.db()): MemoryItem[] {
    // 按 id 取出 + 稳定排序：同分的条目保持写入顺序，
    // 否则刚迁进来的一批分数完全相同，每次读出来的顺序都不一样，注入的 prompt 也跟着抖
    const rows = db.prepare(
      "SELECT * FROM memory WHERE scope = 'user' AND owner_id = ? AND superseded_by IS NULL ORDER BY id",
    ).all(userId) as MemoryRow[];

    const now = Date.now();
    return rows.map(toItem).sort((a, b) => memoryScore(b, now) - memoryScore(a, now));
  }

  /** 这个人有没有可注入的档案内容。认人时用来筛掉「叫得出名字但没有任何记忆」的人 */
  hasMemory(userId: number, db = this.db()): boolean {
    return this.formatMemoryLine(userId, db) !== null;
  }

  /** 有过聊天记录的群，管理面板拿来列群档案的候选 */
  listGroups(db = this.db()): GroupHit[] {
    return db.prepare(
      'SELECT group_id AS groupId, count(*) AS lines, max(date_key) AS lastDate'
      + ' FROM chat_line GROUP BY group_id ORDER BY lastDate DESC, lines DESC',
    ).all() as GroupHit[];
  }

  /** 单条记忆，管理面板改之前要先确认它还在 */
  getMemory(id: number, db = this.db()): MemoryItem | null {
    const row = db.prepare('SELECT * FROM memory WHERE id = ? AND superseded_by IS NULL').get(id) as MemoryRow | undefined;
    return row ? toItem(row) : null;
  }

  /**
   * 管理面板找人：QQ 号精确匹配，其余按当前昵称和人工别名模糊匹配。
   * 查询为空时给最有档案的几个人，打开页面就有东西看
   */
  searchUsers(query: string, db = this.db(), limit = 30): UserHit[] {
    const q = query.trim();
    const ids: number[] = [];
    const push = (id: number) => { if (id && !ids.includes(id)) ids.push(id); };

    if (!q) {
      (db.prepare(
        "SELECT owner_id FROM memory WHERE scope = 'user' AND superseded_by IS NULL"
        + ' GROUP BY owner_id ORDER BY count(*) DESC LIMIT ?',
      ).all(limit) as { owner_id: number }[]).forEach((r) => push(r.owner_id));
    } else {
      if (/^\d+$/.test(q)) push(Number(q));

      // LIKE 的通配符要转义，否则昵称里的 _ 会变成「任意一个字」
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      (db.prepare("SELECT user_id FROM user_profile WHERE nick LIKE ? ESCAPE '\\' LIMIT ?")
        .all(like, limit) as { user_id: number }[]).forEach((r) => push(r.user_id));
      (db.prepare(
        "SELECT DISTINCT owner_id FROM memory WHERE scope = 'user' AND kind = 'alias'"
        + " AND superseded_by IS NULL AND text LIKE ? ESCAPE '\\' LIMIT ?",
      ).all(like, limit) as { owner_id: number }[]).forEach((r) => push(r.owner_id));
    }

    return ids.slice(0, limit).map((userId) => {
      const items = this.listUserMemories(userId, db);
      return {
        userId,
        nick: this.getNickName(userId, db),
        aliases: items.filter((i) => i.kind === 'alias').map((i) => i.text),
        count: items.length,
      };
    });
  }

  /**
   * 取所有人工写在档案里的别名 {userId: [别名]}，供昵称索引兜底。
   * 昵称索引只在启动时读一次，所以改完 aliases 需要重启 bot 才生效
   */
  getManualAliases(db = this.db()): Map<number, string[]> {
    const map = new Map<number, string[]>();
    try {
      const rows = db.prepare(
        "SELECT owner_id, text FROM memory WHERE scope = 'user' AND kind = 'alias' AND superseded_by IS NULL ORDER BY id",
      ).all() as { owner_id: number, text: string }[];

      rows.forEach(({ owner_id, text }) => {
        const list = map.get(owner_id) ?? [];
        list.push(text);
        map.set(owner_id, list);
      });
    } catch (e) {
      printError(`[MemoryStore] 读取人工别名失败: ${e}`);
    }
    return map;
  }

  /**
   * 根据当前对话中出现的用户ID，生成注入 prompt 的记忆上下文。
   * 仅返回有记忆数据的用户；关系是人工确认过的，排在 LLM 总结的印象之前。
   */
  getMemoryContext(userIds: number[], db = this.db()): string {
    return userIds
      .map((userId) => this.formatMemoryLine(userId, db))
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  /** 单个群友的一行档案文本，没有可用内容时返回 null */
  formatMemoryLine(userId: number, db = this.db()): string | null {
    const nickName = this.getNickName(userId, db);
    const items = this.listUserMemories(userId, db);
    if (!nickName && items.length === 0) return null;

    const pick = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.text);
    const aliases = pick('alias');
    const relations = pick('relation');
    // trait 和 episode 都是「印象」，已经按分数排过序，取前几条
    const traitList = items
      .filter((i) => i.kind === 'trait' || i.kind === 'episode')
      .slice(0, MAX_INJECT_TRAITS)
      .map((i) => i.text);

    if (!nickName) return null;

    // 群友嘴里叫的常常是外号，不把叫法一起注入，LLM 就不知道这份档案对应问句里的谁
    const name = aliases.length ? `[${nickName}]（也叫：${aliases.join('、')}）` : `[${nickName}]`;

    if (!relations.length) {
      // 绝大多数群友没有关系条目，维持原格式，不平白改动 prompt
      if (traitList.length) return `${name} ${traitList.join('、')}`;
      // 只有叫法也值得注入：被问「XX是谁」时，这行本身就是答案
      return aliases.length ? name : null;
    }

    const traits = traitList.length ? `｜印象：${traitList.join('、')}` : '';
    return `${name} 关系：${relations.join('；')}${traits}`;
  }

  // ========== 写入 ==========

  private insert(db: MemoryDatabase, m: {
    ownerId: number, groupId: number | null, kind: string, text: string,
    confidence: number, pinned?: boolean, source?: string | null,
  }): number {
    const now = Date.now();
    const info = db.prepare(`
      INSERT INTO memory (scope, owner_id, group_id, kind, text, first_seen, last_seen, hits, confidence, pinned, source, updated_at)
      VALUES ('user', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(m.ownerId, m.groupId, m.kind, m.text, now, now, m.confidence, m.pinned ? 1 : 0, m.source ?? null, now);

    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO memory_fts (rowid, seg) VALUES (?, ?)').run(id, segment(m.text));
    return id;
  }

  /** 人工/迁移用的直接写入 */
  addMemory(m: {
    ownerId: number, groupId?: number | null, kind: MemoryKind, text: string,
    confidence?: number, pinned?: boolean, source?: string | null,
  }, db = this.db()): number {
    return this.insert(db, {
      ownerId: m.ownerId,
      groupId: m.groupId ?? null,
      kind: m.kind,
      text: m.text,
      confidence: m.confidence ?? 0.6,
      pinned: m.pinned,
      source: m.source,
    });
  }

  /**
   * 应用 LLM 返回的增删改操作。
   *
   * pinned 是人工维护的，UPDATE/DELETE 一律在这里挡掉——不依赖服务端 prompt 自觉。
   * DELETE 只写 superseded_by 不物理删，判错了还能捞回来
   */
  applyOps(userId: number, groupId: number | null, ops: MemoryOp[], db = this.db()): ApplyResult {
    const result: ApplyResult = {
      added: [], updated: [], deleted: [], blocked: 0,
    };
    if (ops.length === 0) return result;

    const now = Date.now();
    const existing = new Map(
      (db.prepare("SELECT * FROM memory WHERE scope = 'user' AND owner_id = ? AND superseded_by IS NULL").all(userId) as MemoryRow[])
        .map((r) => [r.id, toItem(r)]),
    );

    db.transaction(() => {
      ops.forEach((op) => {
        const target = op.id === undefined ? undefined : existing.get(op.id);
        // 认不出 id 的 UPDATE/DELETE 直接丢：可能指向别人的条目，或者已经被删过
        if (op.op !== 'ADD' && !target) return;
        if (target?.pinned) {
          result.blocked += 1;
          return;
        }

        if (op.op === 'DELETE') {
          db.prepare('UPDATE memory SET superseded_by = ?, updated_at = ? WHERE id = ?').run(DELETED, now, op.id);
          db.prepare('DELETE FROM memory_fts WHERE rowid = ?').run(op.id);
          result.deleted.push(op.id!);
          return;
        }

        if (!op.text) return;

        if (op.op === 'UPDATE') {
          // first_seen 保留：这件事是什么时候第一次知道的，比它最近一次被印证更有价值
          db.prepare(
            'UPDATE memory SET kind = ?, text = ?, confidence = ?, last_seen = ?, hits = hits + 1, updated_at = ? WHERE id = ?',
          ).run(op.kind ?? target!.kind, op.text, op.confidence ?? target!.confidence, now, now, op.id);
          db.prepare('UPDATE memory_fts SET seg = ? WHERE rowid = ?').run(segment(op.text), op.id);
          result.updated.push(op.id!);
          return;
        }

        // 同一句话又说了一遍不该多出一条，算作又被印证一次
        const same = [...existing.values()].find((i) => i.text === op.text && i.kind === (op.kind ?? 'trait'));
        if (same) {
          db.prepare('UPDATE memory SET hits = hits + 1, last_seen = ?, updated_at = ? WHERE id = ?').run(now, now, same.id);
          result.updated.push(same.id);
          return;
        }

        result.added.push(this.insert(db, {
          ownerId: userId,
          groupId,
          kind: op.kind ?? 'trait',
          text: op.text,
          confidence: op.confidence ?? 0.6,
        }));
      });
    })();

    return result;
  }

  /**
   * 人工改一条记忆。和 applyOps 不同，这里不挡 pinned——钉住是防 LLM 的，不防人。
   * 返回文本是否变了：变了就得让调用方重新排队算向量
   */
  updateMemory(id: number, patch: MemoryPatch, db = this.db()): { ok: boolean, textChanged: boolean } {
    const current = this.getMemory(id, db);
    if (!current) return { ok: false, textChanged: false };

    const kind = patch.kind ?? current.kind;
    const text = patch.text ?? current.text;
    const confidence = patch.confidence ?? current.confidence;
    const pinned = patch.pinned ?? current.pinned;
    const textChanged = text !== current.text;

    db.transaction(() => {
      // last_seen 不动：人工改字面不代表这件事又被印证了一次
      db.prepare(
        'UPDATE memory SET kind = ?, text = ?, confidence = ?, pinned = ?, updated_at = ? WHERE id = ?',
      ).run(kind, text, confidence, pinned ? 1 : 0, Date.now(), id);

      if (textChanged) {
        db.prepare('UPDATE memory_fts SET seg = ? WHERE rowid = ?').run(segment(text), id);
        // 旧向量对应的是旧文本，留着会把这条召回到错的语境上
        deleteEmbeddings(db, 'memory', [id]);
      }
    })();

    return { ok: true, textChanged };
  }

  /** 人工删一条。同样只软删，判错了改回 superseded_by 就能捞回来 */
  removeMemory(id: number, db = this.db()): boolean {
    if (!this.getMemory(id, db)) return false;

    db.transaction(() => {
      db.prepare('UPDATE memory SET superseded_by = ?, updated_at = ? WHERE id = ?').run(DELETED, Date.now(), id);
      db.prepare('DELETE FROM memory_fts WHERE rowid = ?').run(id);
    })();

    deleteEmbeddings(db, 'memory', [id]);
    return true;
  }

  /**
   * 超出上限的非 pinned 记忆按分数从低到高软删，返回被淘汰的 id。
   * 不再像旧实现那样硬截断前 6 条——那样长期事实会被短期热点挤掉，挤掉就再也回不来
   */
  evict(userId: number, db = this.db()): number[] {
    const items = this.listUserMemories(userId, db).filter((i) => !i.pinned);
    if (items.length <= MAX_ITEMS_PER_USER) return [];

    // listUserMemories 已按分数降序，尾巴就是最该淘汰的
    const doomed = items.slice(MAX_ITEMS_PER_USER).map((i) => i.id);
    const now = Date.now();

    db.transaction(() => {
      const supersede = db.prepare('UPDATE memory SET superseded_by = ?, updated_at = ? WHERE id = ?');
      const unindex = db.prepare('DELETE FROM memory_fts WHERE rowid = ?');
      doomed.forEach((id) => {
        supersede.run(DELETED, now, id);
        unindex.run(id);
      });
    })();

    deleteEmbeddings(db, 'memory', doomed);
    return doomed;
  }
}

export default new MemoryStore();
