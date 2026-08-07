import {
  embedTexts, segmentTopics, TOPIC_REJECTED, type TopicLine, type TopicSegment,
} from '@/service/llm';
import { printError, printLog } from '@/utils/print';
import { backupDateKey } from '../storage/message';
import {
  delMeta, getMemoryDb, getMeta, setMeta, type MemoryDatabase,
} from './db';
import { ingestChatBackups } from './ingest';
import { stripSpeakerPrefix } from './segment';
import memoryStore from './store';
import { saveEmbeddings, type RefKind } from './vector';

/**
 * 每日巩固：把昨天以前的日志切成话题并向量化，补齐漏掉的向量，再跑一遍淘汰。
 *
 * 向量化的是话题而不是每条消息——话题数量是 O(千)，消息是 O(百万)。
 * 话题的一句话概括本身就是语义检索的载体，比单条「好困」有意义得多
 */

/** 服务端单次切话题的行数上限 */
const TOPIC_CHUNK = 100;

/** 每轮最多处理几天。首次跑有几十天积压，分批消化，别一次把额度打满 */
const MAX_DAYS_PER_RUN = 3;

/** 每轮最多调几次 /llm/topic，给成本封顶 */
const MAX_CHUNKS_PER_RUN = 40;

/**
 * 同时发几个切话题请求。实测单次要 40~80s，串行跑完一天两三千行要半小时以上，
 * 首次那几十天的积压根本消化不动。段与段之间互不依赖，可以并发
 */
const CHUNK_CONCURRENCY = 3;

/** 向量化的批大小，服务端单次上限 200 */
const EMBED_BATCH = 200;

/**
 * 单段失败重试几次。上游偶发 90s 超时，整天重来要多烧几十次调用，
 * 就地重试那一段划算得多
 */
const SEGMENT_RETRY = 2;

/** 重试前等一下，避免上游正忙时几段一起立刻撞回去 */
const RETRY_DELAY = 5000;

/** 每群已经切完话题的最后一天 */
export const topicWatermarkKey = (groupId: number) => `topic:${groupId}`;

/** 某天已经切完的段数，用于天内断点续跑。
 *  段数是按过滤后的行数算的，改了 isNoise 的判据就得换 key，否则老断点会落在错的位置 */
export const dayProgressKey = (groupId: number, dateKey: number) => `topic:v2:${groupId}:${dateKey}`;

/** 过滤噪声行之前的断点，认不出来就当没切过，这一天会整天重切 */
const legacyDayProgressKey = (groupId: number, dateKey: number) => `topic:${groupId}:${dateKey}`;

const sleep = (ms: number) => new Promise((r) => { setTimeout(r, ms); });

/** `[表情]` `[图片]` 这类占位符 */
const PLACEHOLDER_RE = /\[[^\]]{1,10}\]/g;

/**
 * 剥掉占位符和空白后没剩几个字的行。prompt 本来就要求跳过这些，
 * 但它们占全库四分之一，发过去纯烧 token
 */
function isNoise(body: string): boolean {
  return body.replace(PLACEHOLDER_RE, '').replace(/\s+/g, '').length <= 2;
}

/** 切一段，暂时失败就重试；被内容审核拒收的不重试，重试永远还是拒收 */
async function segmentWithRetry(
  slice: TopicLine[],
  groupId: number,
  dateKey: number,
) {
  for (let attempt = 0; ; attempt++) {
    const result = await segmentTopics(slice);
    if (result !== null || attempt >= SEGMENT_RETRY) return result;
    printError(`[Consolidate] 群 ${groupId} ${dateKey} 有一段切失败，${RETRY_DELAY / 1000}s 后重试（第 ${attempt + 1} 次）`);
    await sleep(RETRY_DELAY);
  }
}

/** 覆盖每轮的封顶与并发，用于本地一次性消化历史积压 */
export interface ConsolidateOptions {
  maxDays?: number;
  maxChunks?: number;
  concurrency?: number;
}

export interface ConsolidateStats {
  ingestedLines: number;
  days: number;
  topics: number;
  embedded: number;
  evicted: number;
  /** 被上游内容审核拒收、只能跳过的段数 */
  skipped: number;
}

/** 分批向量化并入库，返回成功条数 */
async function embedAll(
  db: MemoryDatabase,
  refKind: RefKind,
  rows: { id: number, text: string }[],
): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((r) => r.text));
    if (!vectors) {
      // 整批失败就跳过，下轮巩固还会把它们当成缺向量的重新捞出来
      printError(`[Consolidate] ${batch.length} 条 ${refKind} 向量化失败`);
    } else {
      done += saveEmbeddings(db, refKind, batch.map((r, j) => ({ refId: r.id, vec: vectors[j] })));
    }
  }
  return done;
}

/** 把某群某天的日志切成话题写进 topic 表，返回新增条数、用掉的调用次数与被拒收跳过的段数 */
async function segmentDay(
  db: MemoryDatabase,
  groupId: number,
  dateKey: number,
  chunkBudget: number,
  concurrency: number,
): Promise<{ topics: number, chunks: number, embedded: number, skipped: number, complete: boolean }> {
  // bot 自己的发言也带上：少了它对话就不完整，概括容易跑偏
  const rows = db.prepare(
    'SELECT id, user_id AS userId, nick, text FROM chat_line WHERE group_id = ? AND date_key = ? ORDER BY id',
  ).all(groupId, dateKey) as { id: number, userId: number, nick: string | null, text: string }[];

  // 噪声行不发给模型。它们夹在话题中间，lineFrom/lineTo 的区间照样覆盖得到，
  // 只有正好落在片段首尾的会被漏掉，无所谓
  const lines: TopicLine[] = rows.flatMap((r) => {
    const body = r.userId === 0 ? r.text : stripSpeakerPrefix(r.text);
    return isNoise(body) ? [] : [{
      id: r.id, userId: r.userId, nick: r.nick, body,
    }];
  });
  if (lines.length === 0) {
    return {
      topics: 0, chunks: 0, embedded: 0, skipped: 0, complete: true,
    };
  }

  // 这一天上轮可能跑到一半失败过。已完成的段数记在 meta 里，从断点接着切，
  // 前面切好的话题原样保留；只有从头开始时才清残留，避免写出重复话题
  const doneKey = dayProgressKey(groupId, dateKey);
  const doneChunks = Number(getMeta(db, doneKey) ?? 0);
  if (doneChunks === 0) {
    delMeta(db, legacyDayProgressKey(groupId, dateKey));
    const stale = db.prepare('SELECT id FROM topic WHERE group_id = ? AND date_key = ?')
      .all(groupId, dateKey) as { id: number }[];
    if (stale.length > 0) {
      db.transaction(() => {
        db.prepare('DELETE FROM topic WHERE group_id = ? AND date_key = ?').run(groupId, dateKey);
        const del = db.prepare("DELETE FROM embedding WHERE ref_kind = 'topic' AND ref_id = ?");
        stale.forEach(({ id }) => del.run(id));
      })();
    }
  }

  const insert = db.prepare(
    'INSERT INTO topic (group_id, date_key, summary, user_ids, line_from, line_to) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const slices: typeof lines[] = [];
  for (let i = doneChunks * TOPIC_CHUNK; i < lines.length && slices.length < chunkBudget; i += TOPIC_CHUNK) {
    slices.push(lines.slice(i, i + TOPIC_CHUNK));
  }

  let topics = 0;
  let chunks = 0;
  let embedded = 0;
  let skipped = 0;
  for (let i = 0; i < slices.length; i += concurrency) {
    const wave = slices.slice(i, i + concurrency);
    chunks += wave.length;

    const results = await Promise.all(wave.map((slice) => segmentWithRetry(slice, groupId, dateKey)));
    // 重试完还是失败就中断这一天，水位不推进；下轮从 doneChunks 处接着切，前面的不白跑
    if (results.some((r) => r === null)) {
      printError(`[Consolidate] 群 ${groupId} ${dateKey} 切话题失败，已完成 ${doneChunks + i} 段`);
      return {
        topics: -1, chunks, embedded, skipped, complete: false,
      };
    }

    // 被内容审核拒收的段重试永远失败，跳过它继续，否则这一天的水位永远推不过去。
    // 代价是这几百行只剩字面索引、没有话题向量，比整天卡死划算
    const ok = results.filter((r): r is TopicSegment[] => r !== TOPIC_REJECTED);
    if (ok.length < results.length) {
      skipped += results.length - ok.length;
      printError(`[Consolidate] 群 ${groupId} ${dateKey} 有 ${results.length - ok.length} 段被内容审核拒收，跳过`);
    }

    const created: { id: number, text: string }[] = [];
    // 话题和断点同一个事务：中途被杀也不会出现「写了话题但断点没推进」而重复切
    db.transaction(() => {
      ok.flat().forEach((t) => {
        const info = insert.run(groupId, dateKey, t.summary, JSON.stringify(t.userIds ?? []), t.lineFrom, t.lineTo);
        created.push({ id: Number(info.lastInsertRowid), text: t.summary });
      });
      setMeta(db, doneKey, String(doneChunks + i + wave.length));
    })();

    embedded += await embedAll(db, 'topic', created);
    topics += created.length;
  }

  // 段数封顶可能把这一天截断了，没切完就不算完成，断点留着下轮接
  const complete = (doneChunks + slices.length) * TOPIC_CHUNK >= lines.length;
  if (complete) delMeta(db, doneKey);
  return {
    topics, chunks, embedded, skipped, complete,
  };
}

/** 找出这个群还没切过话题的日子（不含今天，今天还在追加） */
function pendingDays(db: MemoryDatabase, groupId: number, limit: number): number[] {
  const done = Number(getMeta(db, topicWatermarkKey(groupId)) ?? 0);
  const today = Number(backupDateKey());
  const rows = db.prepare(
    'SELECT DISTINCT date_key FROM chat_line WHERE group_id = ? AND date_key > ? AND date_key < ? ORDER BY date_key LIMIT ?',
  ).all(groupId, done, today, limit) as { date_key: number }[];
  return rows.map((r) => r.date_key);
}

/** 补齐缺向量的记忆和话题。抽取时服务不可用、或上面切话题时向量化失败的，都靠这里兜住 */
async function backfillMissingVectors(db: MemoryDatabase): Promise<number> {
  const memories = db.prepare(`
    SELECT m.id, m.text FROM memory m
    LEFT JOIN embedding e ON e.ref_kind = 'memory' AND e.ref_id = m.id
    WHERE m.superseded_by IS NULL AND e.ref_id IS NULL ORDER BY m.id
  `).all() as { id: number, text: string }[];

  const topics = db.prepare(`
    SELECT t.id, t.summary AS text FROM topic t
    LEFT JOIN embedding e ON e.ref_kind = 'topic' AND e.ref_id = t.id
    WHERE e.ref_id IS NULL ORDER BY t.id
  `).all() as { id: number, text: string }[];

  return await embedAll(db, 'memory', memories) + await embedAll(db, 'topic', topics);
}

/**
 * 跑一次巩固。groupIds 是要切话题的群（默认取 initiativeList），
 * 字面索引对所有群都建，但切话题要花 LLM 调用，只对会主动插话的群做
 */
export async function consolidateMemory(
  groupIds: number[],
  db: MemoryDatabase = getMemoryDb(),
  opts: ConsolidateOptions = {},
): Promise<ConsolidateStats> {
  const maxDays = opts.maxDays ?? MAX_DAYS_PER_RUN;
  const concurrency = opts.concurrency ?? CHUNK_CONCURRENCY;
  const stats: ConsolidateStats = {
    ingestedLines: 0, days: 0, topics: 0, embedded: 0, evicted: 0, skipped: 0,
  };

  // 1. 先把新备份行导进来，话题要从 chat_line 里取
  stats.ingestedLines = ingestChatBackups(db).lines;

  // 2. 切话题 + 向量化，天数和调用次数都封顶
  let chunkBudget = opts.maxChunks ?? MAX_CHUNKS_PER_RUN;
  for (const groupId of groupIds) {
    if (chunkBudget <= 0) break;
    for (const dateKey of pendingDays(db, groupId, maxDays)) {
      if (chunkBudget <= 0) break;
      const {
        topics, chunks, embedded, skipped, complete,
      } = await segmentDay(db, groupId, dateKey, chunkBudget, concurrency);
      chunkBudget -= chunks;
      stats.embedded += embedded;
      stats.skipped += skipped;
      // 中途失败或段数封顶截断了这一天，水位都不推进；断点记在 meta 里，下轮接着切
      if (topics < 0) break;
      if (!complete) break;
      setMeta(db, topicWatermarkKey(groupId), String(dateKey));
      stats.days += 1;
      stats.topics += topics;
    }
  }

  // 3. 补齐漏掉的向量：抽取时服务不可用、或上面某批向量化失败的，都在这里兜住
  stats.embedded += await backfillMissingVectors(db);

  // 4. 淘汰。分数里已经含时间衰减，不需要另外写一遍「衰减」
  const owners = db.prepare(
    "SELECT DISTINCT owner_id FROM memory WHERE scope = 'user' AND superseded_by IS NULL",
  ).all() as { owner_id: number }[];
  owners.forEach(({ owner_id }) => {
    stats.evicted += memoryStore.evict(owner_id, db).length;
  });

  printLog(`[Consolidate] 导入 ${stats.ingestedLines} 行、切了 ${stats.days} 天共 ${stats.topics} 个话题、`
    + `向量化 ${stats.embedded} 条、淘汰 ${stats.evicted} 条`
    + `${stats.skipped > 0 ? `、跳过 ${stats.skipped} 段（内容审核拒收）` : ''}`);
  return stats;
}
