import fs from 'fs';
import os from 'os';
import path from 'path';
import { createMemoryDb, getMeta, setMeta, MemoryDatabase } from '@/modules/aiReply/memory/db';

/** 临时库跑完就删，不碰 data/memory 下的真实库 */
const TEST_DB = path.join(os.tmpdir(), `nonoka_test_${process.pid}.db`);

let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

/** 断言抛出也要关连接，否则 Windows 上临时库删不掉 */
function withDb(fn: (db: MemoryDatabase) => void) {
  const db = createMemoryDb(TEST_DB);
  try {
    fn(db);
  } finally {
    db.close();
  }
}

const EXPECTED_TABLES = ['chat_fts', 'chat_line', 'embedding', 'memory', 'memory_fts', 'meta', 'topic'];

function testSchema() {
  console.log('\n[schema]');
  withDb((db) => {
    const tables = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[]).map((r) => r.name);
    check('七张表齐全', EXPECTED_TABLES.filter((t) => tables.includes(t)), EXPECTED_TABLES);

    check('WAL 已开启', String(db.pragma('journal_mode', { simple: true })).toLowerCase(), 'wal');
    check('schema_version 已落库', getMeta(db, 'schema_version'), '1');

    const cols = (db.prepare('PRAGMA table_info(memory)').all() as { name: string }[]).map((c) => c.name);
    check('memory 列完整', cols, [
      'id', 'scope', 'owner_id', 'group_id', 'kind', 'text', 'first_seen',
      'last_seen', 'hits', 'confidence', 'pinned', 'superseded_by', 'source', 'updated_at',
    ]);

    setMeta(db, 'probe', 'a');
    setMeta(db, 'probe', 'b');
    check('meta 写入是覆盖不是插重', getMeta(db, 'probe'), 'b');
    check('meta 读不存在的键给 null', getMeta(db, 'nope'), null);
  });
}

function testIdempotent() {
  console.log('\n[重复打开]');
  withDb((db) => {
    check('已是最新版就不重跑迁移', getMeta(db, 'schema_version'), '1');
    check('老数据还在', getMeta(db, 'probe'), 'b');
  });
}

function testFts() {
  console.log('\n[FTS5]');
  withDb((db) => {
    const insert = db.prepare('INSERT INTO chat_fts(rowid, seg) VALUES (?, ?)');
    insert.run(1, '今天 中午 吃 一兰 拉面');
    insert.run(2, '今天中午吃一兰拉面'); // 没分词的对照组

    const hits = db.prepare('SELECT rowid FROM chat_fts WHERE chat_fts MATCH ? ORDER BY rowid').all('"拉面"') as { rowid: number }[];
    check('分词后能被中文词命中，没分词的整段是一个 token 命不中', hits.map((h) => h.rowid), [1]);

    const scored = db.prepare('SELECT bm25(chat_fts) AS s FROM chat_fts WHERE chat_fts MATCH ?').get('"拉面"') as { s: number };
    check('bm25() 返回负值，排序要取相反数', scored.s < 0, true);

    // 普通表用 DELETE 即可，特殊的 'delete' 命令只对 contentless / external content 表有效
    db.prepare('DELETE FROM chat_fts WHERE rowid = ?').run(1);
    const after = db.prepare('SELECT count(*) AS n FROM chat_fts WHERE chat_fts MATCH ?').get('"拉面"') as { n: number };
    check('删除能摘掉索引行', after.n, 0);
  });
}

export function testMemory() {
  try {
    testSchema();
    testIdempotent();
    testFts();
    console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项未通过`);
  } finally {
    ['', '-wal', '-shm'].forEach((suffix) => fs.rmSync(`${TEST_DB}${suffix}`, { force: true }));
  }
}

testMemory();
