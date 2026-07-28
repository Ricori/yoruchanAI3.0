import { getMemoryDb, getMeta } from '@/modules/aiReply/memory/db';
import { backupDateKey } from '@/modules/aiReply/storage/message';
import { botConfig } from '@/core/nnkConfig';

const DAYS = Number(process.env.DAYS ?? 50);
const db = getMemoryDb();
const today = Number(backupDateKey());
const cutoff = Number(backupDateKey(new Date(Date.now() - DAYS * 86400000)));
console.log(`今天 ${today}，只看最近 ${DAYS} 天（>= ${cutoff}）`);

let allChunks = 0;
botConfig.aiReply.initiativeList.forEach((groupId: number) => {
  const done = Number(getMeta(db, `topic:${groupId}`) ?? 0);
  const from = Math.max(done, cutoff - 1);
  const rows = db.prepare(
    'SELECT date_key, count(*) AS n FROM chat_line WHERE group_id = ? AND date_key > ? AND date_key < ? GROUP BY date_key ORDER BY date_key',
  ).all(groupId, from, today) as { date_key: number, n: number }[];
  const lines = rows.reduce((s, r) => s + r.n, 0);
  const chunks = rows.reduce((s, r) => s + Math.ceil(r.n / 100), 0);
  allChunks += chunks;
  console.log(`群 ${groupId}: 水位 ${done}, 待处理 ${rows.length} 天 / ${lines} 行 / 约 ${chunks} 段`
    + `${rows.length ? ` (${rows[0].date_key} ~ ${rows[rows.length - 1].date_key})` : ''}`);
});
console.log(`合计约 ${allChunks} 段`);
db.close();
