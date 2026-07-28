import { botConfig } from '@/core/nnkConfig';
import { consolidateMemory } from '@/modules/aiReply/memory/consolidate';
import { getMemoryDb, getMeta, setMeta } from '@/modules/aiReply/memory/db';
import { backupDateKey } from '@/modules/aiReply/storage/message';

/**
 * 本地一次性消化历史积压：反复调 consolidateMemory 直到没有待切的天数。
 * 水位落在 meta 表里，中途 Ctrl+C 再跑会从断点继续
 */

// 指向本地 wrangler dev 时用，只改内存不写回 config.json
if (process.env.SERVICE_URL) botConfig.nonokaService.baseUrl = process.env.SERVICE_URL;

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
/** 每轮处理的天数，越大越少往返；chunk 上限跟着放开 */
const DAYS_PER_ROUND = 5;
/** 连续几轮切不动就停，避免服务端一直失败时空转 */
const MAX_STALL = 3;

const groupIds: number[] = botConfig.aiReply.initiativeList;
const db = getMemoryDb();

function remaining() {
  const today = Number(backupDateKey());
  return groupIds.reduce((sum, groupId) => {
    const done = Number(getMeta(db, `topic:${groupId}`) ?? 0);
    const row = db.prepare(
      'SELECT count(DISTINCT date_key) AS n FROM chat_line WHERE group_id = ? AND date_key > ? AND date_key < ?',
    ).get(groupId, done, today) as { n: number };
    return sum + row.n;
  }, 0);
}

// 更早的历史直接放弃：把水位推到 DAYS 天前，pendingDays 就不会再捞它们
const DAYS = Number(process.env.DAYS ?? 50);
const cutoff = Number(backupDateKey(new Date(Date.now() - DAYS * 86400000)));
groupIds.forEach((groupId) => {
  const done = Number(getMeta(db, `topic:${groupId}`) ?? 0);
  if (done < cutoff - 1) setMeta(db, `topic:${groupId}`, String(cutoff - 1));
});
console.log(`只处理 ${cutoff} 及以后的日志`);

const started = Date.now();
let stall = 0;
let round = 0;
let left = remaining();
console.log(`起始待处理 ${left} 天，并发 ${CONCURRENCY}`);

while (left > 0 && stall < MAX_STALL) {
  round += 1;
  const stats = await consolidateMemory(groupIds, db, {
    maxDays: DAYS_PER_ROUND,
    maxChunks: Number.MAX_SAFE_INTEGER,
    concurrency: CONCURRENCY,
  });
  const now = remaining();
  stall = now < left ? 0 : stall + 1;
  left = now;
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`[第 ${round} 轮] 切了 ${stats.days} 天 / ${stats.topics} 话题，剩 ${left} 天，已用 ${mins} 分钟\n`);
}

console.log(left === 0 ? '历史话题全部处理完' : `连续 ${MAX_STALL} 轮没有进展，剩 ${left} 天未处理`);
db.close();
