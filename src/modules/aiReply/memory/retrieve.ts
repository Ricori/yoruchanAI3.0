import { embedTexts } from '@/service/llm';
import { printError } from '@/utils/print';
import { backupDateKey } from '../storage/message';
import { getMemoryDb, type MemoryDatabase } from './db';
import { segment, stripSpeakerPrefix, weightedTerms } from './segment';
import { searchSimilar } from './vector';

/**
 * 混合检索：字面（FTS5 + BM25）与语义（向量余弦）两路各自召回，再用 RRF 融合。
 *
 * 关键是排序里终于有了相关性——旧的实现从最近一天倒扫、凑满就停，
 * 拿到的永远是「最近 N 条」而不是「最相关 N 条」，20 天前的完美匹配会输给昨天勉强沾边的
 */

/** RRF 的平滑常数，取 60 是通行做法：名次靠前的差距被压平，不需要在两路之间调权重 */
const RRF_K = 60;

/** 每一路各取多少条进融合池 */
const CANDIDATE_LIMIT = 30;

const DEFAULT_LIMIT = 5;
const DEFAULT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 指定说话人只加权不硬过滤，倍率压在「多命中一路」的量级上 */
const SPEAKER_BOOST = 1.5;

/** 一个话题最多展开几行原文，否则一段长对话就能把候选池灌满 */
const TOPIC_EXPAND_LIMIT = 8;

/**
 * 语义召回的相似度下限。这道闸不能省：余弦只排序不判断有无，
 * 没有下限时哪怕全库都跟问题无关，最不相关的那个也会以 rank 1 进入融合，压掉真正的字面命中。
 *
 * 阈值跟着 embedding 模型走，换模型必须重新量。qwen3.7-text-embedding 上实测
 * 该命中的最低 0.446、该落空的最高 0.394，中间有空档；取 0.40 卡在空档偏低的一侧——
 * 召回宁可多给，让模型自己判断要不要用，漏掉才是更糟的错。
 * （同一组样本换 text-embedding-v4 就是 0.409 对 0.409，根本切不开）
 *
 * 只用了一天的 4 个话题做样本，P6 攒出全量话题后要重新校准
 */
const MIN_SIMILARITY = 0.40;

export interface ChatHit {
  id: number;
  /** 'MM-DD' */
  date: string;
  userId: number;
  nick: string | null;
  /** 仍带 `[昵称]说：` 前缀，注入时直接可用 */
  text: string;
}

export interface MemoryHit {
  id: number;
  scope: string;
  ownerId: number;
  kind: string;
  text: string;
  confidence: number;
  source: string | null;
}

interface CommonOptions {
  query: string;
  limit?: number;
  /** 已经算好的查询向量，传了就省一次 embed 往返 */
  queryVec?: Float32Array;
  /** 关掉语义那一路只走字面检索。主动插话这种不值得多花一次网络往返的场合用 */
  semantic?: boolean;
}

export interface RecallChatOptions extends CommonOptions {
  /** 加权而非过滤：别人说过的相关内容也进候选，注入时标明是谁说的 */
  speakerIds?: number[];
  days?: number;
}

export interface RecallMemoryOptions extends CommonOptions {
  /** 硬过滤：问某个人就只要这个人的档案，混进别人的是噪音 */
  aboutUserIds?: number[];
}

export interface TermQuery {
  /** FTS5 的 MATCH 串 */
  match: string;
  /** 这一路在融合时的权重，一句话里所有检索词加起来为 1 */
  weight: number;
}

/**
 * 查询串必须过一遍和索引侧相同的分词再包成词组：索引里存的是分词后的 seg，
 * 直接拿 `"手办"` 去 MATCH 命中 0 行，`"手 办"` 才命中——「手办」不在 jieba 默认词典里。
 * 不包引号的话空格会被当成 AND，变成「手」和「办」分别出现在任意位置
 */
function phrase(text: string): string | null {
  const seg = segment(text);
  return seg ? `"${seg.replace(/"/g, '""')}"` : null;
}

/**
 * 把一句话拆成若干路检索，一个检索词一路，权重取它的 TF-IDF。
 *
 * 不把所有词 OR 进一条语句：BM25 的长度归一会让「好吃好吃」这种极短的行拿到高分，
 * 常见词于是盖过稀有词——查「拉面好吃吗」召回的全是「好吃」。
 * 一词一路、再按稀有度加权融合，排序维度才真的是稀有度
 */
export function buildTermQueries(query: string): TermQuery[] {
  const queries = weightedTerms(query).flatMap(({ term, weight }) => {
    const match = phrase(term);
    return match ? [{ match, weight }] : [];
  });

  if (queries.length === 0) {
    // 词典外的词会被切成单字、全被最小长度滤掉，这时退回整句当一个词组
    const match = phrase(query);
    return match ? [{ match, weight: 1 }] : [];
  }

  // 归一化成和为 1，让「字面」这一整路与「语义」那一路的份量相当
  const total = queries.reduce((sum, q) => sum + q.weight, 0) || 1;
  return queries.map((q) => ({ ...q, weight: q.weight / total }));
}

/** /llm/embed 挂掉时不要每次回复都去撞一次，连错几次就歇一会，期间只走字面检索 */
const EMBED_FAIL_LIMIT = 3;
const EMBED_COOLDOWN = 10 * 60 * 1000;
let embedFails = 0;
let embedMutedUntil = 0;

async function embedQuery(text: string): Promise<Float32Array | null> {
  if (Date.now() < embedMutedUntil) return null;

  const vectors = await embedTexts([text]);
  if (!vectors?.length) {
    embedFails += 1;
    if (embedFails >= EMBED_FAIL_LIMIT) {
      embedMutedUntil = Date.now() + EMBED_COOLDOWN;
      embedFails = 0;
      printError('[Retrieve] /llm/embed 连续失败，语义召回暂停 10 分钟，期间只走字面检索');
    }
    return null;
  }

  embedFails = 0;
  return Float32Array.from(vectors[0]);
}

/** 取查询向量：调用方给了就用，明确关掉语义路就返回 null，否则现算 */
function resolveQueryVec(opts: CommonOptions): Promise<Float32Array | null> | Float32Array | null {
  if (opts.queryVec) return opts.queryVec;
  return opts.semantic === false ? null : embedQuery(opts.query);
}

export interface RankedList {
  /** 按相关性降序的 id */
  ids: number[];
  /** 这一路的份量，默认 1 */
  weight?: number;
}

/** RRF：只比较各路里的名次，不需要在 BM25 分和余弦值这两种量纲之间换算 */
export function rrfFuse(lists: RankedList[], k = RRF_K): Map<number, number> {
  const scores = new Map<number, number>();
  lists.forEach(({ ids, weight = 1 }) => {
    ids.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + i + 1));
    });
  });
  return scores;
}

function placeholders(n: number) {
  return new Array(n).fill('?').join(', ');
}

function dateKeySince(days: number) {
  return Number(backupDateKey(new Date(Date.now() - days * DAY_MS)));
}

/** yyyymmdd -> 'MM-DD' */
function formatDate(dateKey: number) {
  const s = String(dateKey);
  return `${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// ========== 聊天记录 ==========

function literalChatLists(db: MemoryDatabase, groupId: number, query: string, since: number): RankedList[] {
  // CROSS JOIN 强制 FTS 当外层。让 SQLite 自己挑的话它会拿 chat_line 走索引当外层、
  // 再对每一行重跑一次 MATCH，6 万行的群实测 3.7s；换成这样是 2ms
  const stmt = db.prepare(`
    SELECT c.id FROM chat_fts f CROSS JOIN chat_line c ON c.id = f.rowid
    WHERE f.chat_fts MATCH ? AND c.group_id = ? AND c.date_key >= ? AND c.user_id != 0
    ORDER BY bm25(chat_fts) LIMIT ?
  `);

  return buildTermQueries(query).flatMap(({ match, weight }) => {
    try {
      // bm25() 返回负值，升序即相关性降序。bot 自己的发言不算旧账
      const rows = stmt.all(match, groupId, since, CANDIDATE_LIMIT) as { id: number }[];
      return rows.length > 0 ? [{ ids: rows.map((r) => r.id), weight }] : [];
    } catch (e) {
      // MATCH 串里混进 FTS5 语法字符时会抛，检索不到不该拖垮回复
      printError(`[Retrieve] 字面检索失败 (${match}): ${e}`);
      return [];
    }
  });
}

function semanticChatIds(db: MemoryDatabase, groupId: number, vec: Float32Array, since: number): number[] {
  const topics = searchSimilar(db, 'topic', vec, CANDIDATE_LIMIT).filter((t) => t.score >= MIN_SIMILARITY);
  if (topics.length === 0) return [];

  const rows = db.prepare(
    `SELECT id, line_from, line_to FROM topic WHERE id IN (${placeholders(topics.length)}) AND group_id = ? AND date_key >= ?`,
  ).all(...topics.map((t) => t.refId), groupId, since) as { id: number, line_from: number, line_to: number }[];

  const byId = new Map(rows.map((r) => [r.id, r]));
  const expand = db.prepare(
    'SELECT id FROM chat_line WHERE id BETWEEN ? AND ? AND group_id = ? AND user_id != 0 ORDER BY id LIMIT ?',
  );

  // 按话题的相似度名次依次展开，同一话题内的行共享这个名次
  return topics.flatMap(({ refId }) => {
    const topic = byId.get(refId);
    if (!topic) return [];
    const lines = expand.all(topic.line_from, topic.line_to, groupId, TOPIC_EXPAND_LIMIT) as { id: number }[];
    return lines.map((l) => l.id);
  });
}

/** CQ 码转成的占位符，剥掉之后才知道这行到底有没有内容 */
const PLACEHOLDER_RE = /\[[^\]]*\]/g;
const PUNCT_RE = /[\s\p{P}\p{S}]/gu;

/** 至少要剩这么多个字才值得占一个注入名额 */
const MIN_CONTENT_CHARS = 2;

/**
 * 只发了个表情、图片或问号的行没有注入价值。
 * 话题展开会把整段对话里这类行一并带出来，不滤掉就是白占名额
 */
function hasContent(text: string): boolean {
  const body = stripSpeakerPrefix(text).replace(PLACEHOLDER_RE, '').replace(PUNCT_RE, '');
  return body.length >= MIN_CONTENT_CHARS;
}

function fetchChatLines(db: MemoryDatabase, ids: number[]) {
  const rows = db.prepare(
    `SELECT id, user_id, date_key, nick, text FROM chat_line WHERE id IN (${placeholders(ids.length)})`,
  ).all(...ids) as { id: number, user_id: number, date_key: number, nick: string | null, text: string }[];
  return new Map(rows.map((r) => [r.id, r]));
}

/** 在某群的聊天记录里混合检索，按相关性降序返回最多 limit 条 */
export async function recallChat(
  groupId: number,
  opts: RecallChatOptions,
  db: MemoryDatabase = getMemoryDb(),
): Promise<ChatHit[]> {
  const {
    query, speakerIds, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT,
  } = opts;
  const since = dateKeySince(days);

  const literal = literalChatLists(db, groupId, query, since);
  const vec = await resolveQueryVec(opts);
  const semantic = vec ? semanticChatIds(db, groupId, vec, since) : [];
  if (literal.length === 0 && semantic.length === 0) return [];

  const scores = rrfFuse([...literal, { ids: semantic }]);
  const lines = fetchChatLines(db, [...scores.keys()]);
  const boost = speakerIds?.length ? new Set(speakerIds) : null;

  return [...scores.entries()]
    .flatMap(([id, score]) => {
      const row = lines.get(id);
      if (!row || !hasContent(row.text)) return [];
      return [{ row, score: boost?.has(row.user_id) ? score * SPEAKER_BOOST : score }];
    })
    .sort((a, b) => b.score - a.score || b.row.id - a.row.id)
    .slice(0, limit)
    .map(({ row }) => ({
      id: row.id,
      date: formatDate(row.date_key),
      userId: row.user_id,
      nick: row.nick,
      text: row.text,
    }));
}

// ========== 记忆条目 ==========

function memoryFilter(groupId: number, aboutUserIds?: number[]) {
  // 别的群的记忆不串台，group_id 为空的是跨群/人工条目，处处可见
  const where = ['m.superseded_by IS NULL', '(m.group_id IS NULL OR m.group_id = ?)'];
  const params: number[] = [groupId];

  if (aboutUserIds?.length) {
    where.push("m.scope = 'user'", `m.owner_id IN (${placeholders(aboutUserIds.length)})`);
    params.push(...aboutUserIds);
  }
  return { where: where.join(' AND '), params };
}

function literalMemoryLists(db: MemoryDatabase, query: string, groupId: number, aboutUserIds?: number[]): RankedList[] {
  const { where, params } = memoryFilter(groupId, aboutUserIds);
  const stmt = db.prepare(`
    SELECT m.id FROM memory_fts f CROSS JOIN memory m ON m.id = f.rowid
    WHERE f.memory_fts MATCH ? AND ${where}
    ORDER BY bm25(memory_fts) LIMIT ?
  `);

  return buildTermQueries(query).flatMap(({ match, weight }) => {
    try {
      const rows = stmt.all(match, ...params, CANDIDATE_LIMIT) as { id: number }[];
      return rows.length > 0 ? [{ ids: rows.map((r) => r.id), weight }] : [];
    } catch (e) {
      printError(`[Retrieve] 记忆字面检索失败 (${match}): ${e}`);
      return [];
    }
  });
}

function fetchMemories(db: MemoryDatabase, ids: number[], groupId: number, aboutUserIds?: number[]) {
  const { where, params } = memoryFilter(groupId, aboutUserIds);
  const rows = db.prepare(`
    SELECT m.id, m.scope, m.owner_id, m.kind, m.text, m.confidence, m.source
    FROM memory m WHERE m.id IN (${placeholders(ids.length)}) AND ${where}
  `).all(...ids, ...params) as any[];

  return new Map(rows.map((r) => [r.id as number, {
    id: r.id,
    scope: r.scope,
    ownerId: r.owner_id,
    kind: r.kind,
    text: r.text,
    confidence: r.confidence,
    source: r.source,
  } as MemoryHit]));
}

/** 在记忆库里混合检索。aboutUserIds 是硬过滤，问谁就只翻谁的档案 */
export async function recallMemory(
  groupId: number,
  opts: RecallMemoryOptions,
  db: MemoryDatabase = getMemoryDb(),
): Promise<MemoryHit[]> {
  const { query, aboutUserIds, limit = DEFAULT_LIMIT } = opts;

  const literal = literalMemoryLists(db, query, groupId, aboutUserIds);
  const vec = await resolveQueryVec(opts);
  const semantic = vec
    ? searchSimilar(db, 'memory', vec, CANDIDATE_LIMIT).filter((h) => h.score >= MIN_SIMILARITY).map((h) => h.refId)
    : [];
  if (literal.length === 0 && semantic.length === 0) return [];

  const scores = rrfFuse([...literal, { ids: semantic }]);
  // 语义那一路没带过滤条件，取详情时统一按同样的可见性再筛一次
  const found = fetchMemories(db, [...scores.keys()], groupId, aboutUserIds);

  return [...scores.entries()]
    .flatMap(([id, score]) => {
      const hit = found.get(id);
      return hit ? [{ hit, score }] : [];
    })
    .sort((a, b) => b.score - a.score || b.hit.id - a.hit.id)
    .slice(0, limit)
    .map(({ hit }) => hit);
}
