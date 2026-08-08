import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { printError, printLog } from '@/utils/print';

export type MemoryDatabase = Database.Database;

const MEMORY_DB_PATH = path.resolve('data/memory/nonoka.db');

/**
 * schema 迁移脚本，下标 + 1 即为版本号。
 * 已经发布过的条目只能追加、不能修改，否则老库和新库会长成两个样子
 */
const MIGRATIONS: string[] = [
  // v1 字面检索层 + 语义记忆层 + 话题层
  `
  -- ========== 字面检索层 ==========
  CREATE TABLE chat_line (
    id       INTEGER PRIMARY KEY,
    group_id INTEGER NOT NULL,
    user_id  INTEGER NOT NULL,
    date_key INTEGER NOT NULL,        -- yyyymmdd
    seq      INTEGER NOT NULL,        -- 文件内行号，保证同日顺序 + 幂等
    nick     TEXT,
    text     TEXT NOT NULL,           -- 已剥掉 [userId] 外壳的原文
    UNIQUE(group_id, date_key, seq)
  );
  CREATE INDEX idx_chat_group_date ON chat_line(group_id, date_key);
  CREATE INDEX idx_chat_user       ON chat_line(group_id, user_id, date_key);

  -- 普通表而非 external content：索引的是分词后的 seg，rowid 手工对齐 chat_line.id
  CREATE VIRTUAL TABLE chat_fts USING fts5(seg, tokenize='unicode61');

  -- ========== 语义记忆层 ==========
  CREATE TABLE memory (
    id            INTEGER PRIMARY KEY,
    scope         TEXT    NOT NULL,   -- 'user' | 'group'
    owner_id      INTEGER NOT NULL,   -- userId / groupId
    group_id      INTEGER,            -- 来源群，NULL 表示多群混合/人工；不作为用户档案可见性边界
    kind          TEXT    NOT NULL,   -- 'trait' | 'episode' | 'relation' | 'alias'
    text          TEXT    NOT NULL,
    first_seen    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL,
    hits          INTEGER NOT NULL DEFAULT 1,   -- 被重复印证的次数
    confidence    REAL    NOT NULL DEFAULT 0.6,
    pinned        INTEGER NOT NULL DEFAULT 0,   -- 人工钉住，永不淘汰/覆盖
    -- 非 NULL 即失效。软删写哨兵 -1，不是真实 id，所以这里不能加外键
    superseded_by INTEGER,
    source        TEXT,                         -- 溯源：'MM-DD 原话片段'
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX idx_mem_owner ON memory(scope, owner_id) WHERE superseded_by IS NULL;

  CREATE VIRTUAL TABLE memory_fts USING fts5(seg, tokenize='unicode61');

  -- ========== 话题层（向量检索主载体）==========
  CREATE TABLE topic (
    id        INTEGER PRIMARY KEY,
    group_id  INTEGER NOT NULL,
    date_key  INTEGER NOT NULL,
    summary   TEXT    NOT NULL,       -- 一句话概括
    user_ids  TEXT    NOT NULL,       -- JSON 数组，参与者
    line_from INTEGER NOT NULL,       -- chat_line.id 区间，用于回溯原文
    line_to   INTEGER NOT NULL
  );
  CREATE INDEX idx_topic_group_date ON topic(group_id, date_key);

  CREATE TABLE embedding (
    ref_kind TEXT    NOT NULL,        -- 'memory' | 'topic'
    ref_id   INTEGER NOT NULL,
    vec      BLOB    NOT NULL,        -- Float32Array
    PRIMARY KEY (ref_kind, ref_id)
  );
  `,

  // v2 群友当前昵称。memory 表每行是一条事实，没地方放这种「每人一个」的属性，
  // 而档案行要用它来称呼人（原来存在 user/{id}.json 的 nickName 字段里）
  `
  CREATE TABLE user_profile (
    user_id    INTEGER PRIMARY KEY,
    nick       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,

  // v3 群内当前昵称。同一个 QQ 用户在不同群可能使用不同群名片，user_profile
  // 继续保存最近一次见到的昵称，供管理页和没有群上下文的旧调用兜底。
  `
  CREATE TABLE group_user_profile (
    group_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    nick       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX idx_group_user_profile_nick ON group_user_profile(group_id, nick);
  `,

  // v4 用历史聊天回填群名片。按日期和行 id 取每个群里最后一次见到的昵称；
  // 已经由 v3 运行时写入的记录更新，INSERT OR IGNORE 会保留它，不拿旧日志覆盖。
  `
  INSERT OR IGNORE INTO group_user_profile (group_id, user_id, nick, updated_at)
  SELECT group_id, user_id, nick, CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM (
    SELECT
      group_id,
      user_id,
      nick,
      row_number() OVER (
        PARTITION BY group_id, user_id
        ORDER BY date_key DESC, id DESC
      ) AS position
    FROM chat_line
    WHERE user_id != 0 AND nick IS NOT NULL AND nick != ''
  )
  WHERE position = 1;
  `,
];

/** 读一条 meta，没有返回 null */
export function getMeta(db: MemoryDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** 写一条 meta，存在则覆盖 */
export function setMeta(db: MemoryDatabase, key: string, value: string) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** 删一条 meta */
export function delMeta(db: MemoryDatabase, key: string) {
  db.prepare('DELETE FROM meta WHERE key = ?').run(key);
}

/** 按 meta.schema_version 递增执行未应用的迁移，每步单独一个事务 */
function migrate(db: MemoryDatabase) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');

  const current = parseInt(getMeta(db, 'schema_version') ?? '0') || 0;
  if (current >= MIGRATIONS.length) return;

  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v];
    db.transaction(() => {
      db.exec(sql);
      setMeta(db, 'schema_version', String(v + 1));
    })();
    printLog(`[MemoryDB] schema 迁移至 v${v + 1}`);
  }
}

/**
 * 建连接 + 迁移到最新 schema。测试传临时路径，正常调用走 getMemoryDb()
 */
export function createMemoryDb(file: string = MEMORY_DB_PATH): MemoryDatabase {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  try {
    migrate(db);
  } catch (e) {
    db.close();
    printError(`[MemoryDB] schema 迁移失败: ${e}`);
    throw e;
  }
  return db;
}

let defaultDb: MemoryDatabase | null = null;

/** 默认记忆库单例，首次调用时才建连接 */
export function getMemoryDb(): MemoryDatabase {
  if (!defaultDb) defaultDb = createMemoryDb();
  return defaultDb;
}
