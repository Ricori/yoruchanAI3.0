import fs from 'fs';
import path from 'path';
import { printError, printLog } from '@/utils/print';
import {
  getMemoryDb, getMeta, setMeta, type MemoryDatabase,
} from './db';
import memoryStore from './store';

/**
 * 把旧的 data/memory/user/{userId}.json 迁进 memory 表。
 *
 * 只跑一次，跑完在 meta 里记一笔。**不删源文件**——留着做人工比对，
 * 确认没问题之后再手动删。迁移本身是幂等的，重复跑不会写重
 */

const LEGACY_DIR = path.resolve(process.cwd(), 'data/memory/user');
const DONE_KEY = 'legacy_user_migrated';

interface LegacyFile {
  userId: number;
  nickName: string;
  traits?: string[];
  relations?: string[];
  aliases?: string[];
  updatedAt?: number;
}

export interface MigrateStats {
  users: number;
  traits: number;
  relations: number;
  aliases: number;
}

function readLegacy(file: string): LegacyFile | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, file), 'utf-8')) as LegacyFile;
    return data?.userId ? data : null;
  } catch {
    return null;
  }
}

/** 迁一个人，返回各类条目数。已经有记忆的直接跳过，避免重复跑写重 */
function migrateUser(db: MemoryDatabase, data: LegacyFile): Omit<MigrateStats, 'users'> | null {
  const { n } = db.prepare(
    "SELECT count(*) AS n FROM memory WHERE scope = 'user' AND owner_id = ?",
  ).get(data.userId) as { n: number };
  if (n > 0) return null;

  if (data.nickName) memoryStore.noteNickName(data.userId, data.nickName, db);

  const add = (kind: 'trait' | 'relation' | 'alias', list: string[] | undefined) => {
    // relations 和 aliases 是人工维护的，迁过来就钉住，LLM 的 UPDATE/DELETE 一律挡掉
    const pinned = kind !== 'trait';
    list?.forEach((text) => memoryStore.addMemory({
      ownerId: data.userId, kind, text, confidence: pinned ? 1 : 0.6, pinned, source: '旧档案迁移',
    }, db));
    return list?.length ?? 0;
  };

  return {
    traits: add('trait', data.traits),
    relations: add('relation', data.relations),
    aliases: add('alias', data.aliases),
  };
}

/** 迁移旧档案，返回统计。已经迁过或没有旧目录时返回 null */
export function migrateLegacyUserMemory(db: MemoryDatabase = getMemoryDb(), force = false): MigrateStats | null {
  if (!force && getMeta(db, DONE_KEY)) return null;
  if (!fs.existsSync(LEGACY_DIR)) {
    setMeta(db, DONE_KEY, String(Date.now()));
    return null;
  }

  const stats: MigrateStats = {
    users: 0, traits: 0, relations: 0, aliases: 0,
  };

  try {
    const files = fs.readdirSync(LEGACY_DIR).filter((f) => f.endsWith('.json'));
    db.transaction(() => {
      files.forEach((file) => {
        const data = readLegacy(file);
        const done = data && migrateUser(db, data);
        if (done) {
          stats.users += 1;
          stats.traits += done.traits;
          stats.relations += done.relations;
          stats.aliases += done.aliases;
        }
      });
    })();

    setMeta(db, DONE_KEY, String(Date.now()));
    if (stats.users > 0) {
      printLog(`[Migrate] 已迁移 ${stats.users} 个旧档案：`
        + `${stats.traits} 条印象、${stats.relations} 条关系、${stats.aliases} 条别名。`
        + `源文件保留在 ${LEGACY_DIR}，确认无误后可手动删除`);
    }
    return stats;
  } catch (e) {
    printError(`[Migrate] 迁移旧档案失败: ${e}`);
    return null;
  }
}
