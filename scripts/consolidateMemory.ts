import { botConfig } from '@/core/nnkConfig';
import { consolidateMemory, dayProgressKey, topicWatermarkKey } from '@/modules/aiReply/memory/consolidate';
import {
  getMemoryDb, getMeta, setMeta, type MemoryDatabase,
} from '@/modules/aiReply/memory/db';
import { backupDateKey } from '@/modules/aiReply/storage/message';

/**
 * 手动消化历史积压：反复调 consolidateMemory 直到没有待切的天数，带进度输出。
 * 线上定时任务每天只切 3 天 / 40 段，积压多时靠这个脚本一次性补上。
 *
 * 用法（都可省略）：
 *   npm run memory:consolidate
 *   DAYS=50 CONCURRENCY=6 npm run memory:consolidate
 *   DRY=1 npm run memory:consolidate    只看积压量，不花任何调用
 *
 *   DAYS         只处理最近几天，更早的日志直接放弃（推高水位）。0 表示全部历史，默认 50
 *   CONCURRENCY  同一天内并发切几段，默认 6。注意天与天之间是串行的，
 *                每天不足这个段数时并发吃不满，调大也没用
 *   SERVICE_URL  临时指向本地 wrangler dev，只改内存不写回 config.json
 *
 * 进度和断点都在 meta 表里，Ctrl+C 后重跑会从断点接着切，已切好的不会重来
 */

if (process.env.SERVICE_URL) botConfig.nonokaService.baseUrl = process.env.SERVICE_URL;

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const DAYS = Number(process.env.DAYS ?? 50);
const DRY = !!process.env.DRY;

/** 每轮处理几天。轮末才打印进度，太大就看不到动静 */
const DAYS_PER_ROUND = 2;

/** 连续几轮切不动就停，避免上游一直失败时空转 */
const MAX_STALL = 3;

/** 和 consolidate.ts 里的 TOPIC_CHUNK 一致，用来估段数 */
const TOPIC_CHUNK = 100;

const groupIds: number[] = botConfig.aiReply.initiativeList;
const db: MemoryDatabase = getMemoryDb();
const today = Number(backupDateKey());

interface Progress {
  days: number;
  chunks: number;
}

/** 还剩多少天、多少段没切。天内断点（topic:群:日期）记着当天已完成的段数 */
function remaining(): Progress {
  return groupIds.reduce((acc, groupId) => {
    const done = Number(getMeta(db, topicWatermarkKey(groupId)) ?? 0);
    const rows = db.prepare(
      'SELECT date_key AS k, count(*) AS n FROM chat_line WHERE group_id = ? AND date_key > ? AND date_key < ? GROUP BY date_key',
    ).all(groupId, done, today) as { k: number, n: number }[];

    rows.forEach(({ k, n }) => {
      const partial = Number(getMeta(db, dayProgressKey(groupId, k)) ?? 0);
      acc.chunks += Math.max(0, Math.ceil(n / TOPIC_CHUNK) - partial);
      acc.days += 1;
    });
    return acc;
  }, { days: 0, chunks: 0 });
}

function printPending() {
  groupIds.forEach((groupId) => {
    const done = Number(getMeta(db, topicWatermarkKey(groupId)) ?? 0);
    const rows = db.prepare(
      'SELECT date_key AS k, count(*) AS n FROM chat_line WHERE group_id = ? AND date_key > ? AND date_key < ? GROUP BY date_key ORDER BY date_key',
    ).all(groupId, done, today) as { k: number, n: number }[];
    const lines = rows.reduce((s, r) => s + r.n, 0);
    const chunks = rows.reduce((s, r) => s + Math.ceil(r.n / TOPIC_CHUNK), 0);
    console.log(`  群 ${groupId}｜水位 ${done || '无'}｜待切 ${rows.length} 天 / ${lines} 行 / 约 ${chunks} 段`
      + `${rows.length ? `（${rows[0].k} ~ ${rows[rows.length - 1].k}）` : ''}`);
  });
}

// 更早的历史直接放弃：把水位推到 DAYS 天前，pendingDays 就不会再捞它们
if (DAYS > 0) {
  const cutoff = Number(backupDateKey(new Date(Date.now() - DAYS * 86400000)));
  const moved = groupIds.filter((groupId) => Number(getMeta(db, topicWatermarkKey(groupId)) ?? 0) < cutoff - 1);
  moved.forEach((groupId) => setMeta(db, topicWatermarkKey(groupId), String(cutoff - 1)));
  console.log(`只处理最近 ${DAYS} 天（${cutoff} 起）${moved.length ? `，${moved.length} 个群的水位已前移` : ''}`);
}

const total = remaining();
console.log(`\n待处理 ${total.days} 天 / ${total.chunks} 段，并发 ${CONCURRENCY}`);
printPending();

if (DRY || total.chunks === 0) {
  console.log(DRY ? '\nDRY=1，不实际调用' : '\n没有待切的日志');
  db.close();
  process.exit(0);
}

const started = Date.now();
let stall = 0;
let round = 0;
let left = remaining();
let topics = 0;
let skipped = 0;
console.log('');

while (left.chunks > 0 && stall < MAX_STALL) {
  round += 1;
  const stats = await consolidateMemory(groupIds, db, {
    maxDays: DAYS_PER_ROUND,
    maxChunks: Number.MAX_SAFE_INTEGER,
    concurrency: CONCURRENCY,
  });
  topics += stats.topics;
  skipped += stats.skipped;

  const now = remaining();
  // 一段没切动才算停滞：天数不变但段数在减，说明大群的某天正在推进
  stall = now.chunks < left.chunks ? 0 : stall + 1;

  const doneChunks = total.chunks - now.chunks;
  const elapsed = (Date.now() - started) / 60000;
  const eta = doneChunks > 0 ? (elapsed / doneChunks) * now.chunks : 0;
  const pct = ((doneChunks / total.chunks) * 100).toFixed(1);
  console.log(`[第 ${round} 轮] ${doneChunks}/${total.chunks} 段 ${pct}%｜话题 +${stats.topics}（累计 ${topics}）`
    + `｜剩 ${now.days} 天 ${now.chunks} 段｜已用 ${elapsed.toFixed(1)} 分，预计还要 ${eta.toFixed(1)} 分`
    + `${stall > 0 ? `｜⚠ 连续 ${stall} 轮没进展` : ''}`);
  left = now;
}

const missing = db.prepare(
  "SELECT count(*) AS n FROM topic t LEFT JOIN embedding e ON e.ref_kind = 'topic' AND e.ref_id = t.id WHERE e.ref_id IS NULL",
).get() as { n: number };
const all = db.prepare('SELECT count(*) AS n FROM topic').get() as { n: number };

console.log(`\n${left.chunks === 0 ? '全部处理完' : `连续 ${MAX_STALL} 轮没有进展，剩 ${left.days} 天 ${left.chunks} 段未处理`}`);
console.log(`本次新增话题 ${topics} 个${skipped > 0 ? `，跳过 ${skipped} 段（内容审核拒收）` : ''}`);
console.log(`库中话题共 ${all.n} 个，缺向量 ${missing.n} 个`);
db.close();
