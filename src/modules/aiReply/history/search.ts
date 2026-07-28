import fs from 'fs';
import path from 'path';
import { CHAT_BACKUP_DIR, backupDateKey } from '../storage/message';

/** 一条命中的历史发言 */
export interface HistoryHit {
  /** 'MM-DD'，取自备份文件名 */
  date: string;
  userId: number;
  /** 去掉 [userId] 外壳后的原文，仍带 [昵称]说： 之类的前缀 */
  text: string;
}

interface SearchOptions {
  userIds?: number[];
  keywords?: string[];
  days?: number;
  limit?: number;
  /** 从几天前开始往回扫，默认 0 即包含当天。传 1 可以跳过今天 */
  fromDaysAgo?: number;
}

/** 备份行格式 `[userId]内容` */
const LINE_RE = /^\[(\d+)\](.*)$/;

const DEFAULT_DAYS = 14;
const DEFAULT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 已归档文件的行缓存上限，超了按插入序丢最早的（丢了也只是下次重新读盘） */
const MAX_CACHED_FILES = 60;

/** 只缓存往日的文件；当日文件还在被追加，每次都要重读 */
const fileCache = new Map<string, string[]>();

function readLines(file: string, cacheable: boolean): string[] {
  if (cacheable) {
    const cached = fileCache.get(file);
    if (cached) return cached;
  }

  let lines: string[];
  try {
    lines = fs.readFileSync(file, 'utf-8').split('\n');
  } catch {
    // 当天消息没攒够就还没落盘，文件不存在属正常情况
    return [];
  }

  if (cacheable) {
    if (fileCache.size >= MAX_CACHED_FILES) {
      fileCache.delete(fileCache.keys().next().value as string);
    }
    fileCache.set(file, lines);
  }
  return lines;
}

function matchLine(
  line: string,
  date: string,
  userSet: Set<number> | null,
  keywords: string[] | null,
): HistoryHit | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;

  const userId = Number(m[1]);
  // bot 自己的发言不算旧账
  if (userId === 0) return null;
  if (userSet && !userSet.has(userId)) return null;

  const text = m[2];
  if (keywords && !keywords.some((k) => text.toLowerCase().includes(k))) return null;

  return { date, userId, text };
}

/**
 * 在某群最近 days 天的聊天备份里检索历史发言。
 *
 * userIds 与 keywords 至少给一个；两者都给时要求同时满足
 * （userId 命中 && 任一 keyword 命中）。返回按时间倒序，最多 limit 条。
 */
export function searchGroupHistory(groupId: number, opts: SearchOptions): HistoryHit[] {
  const {
    userIds, keywords, days = DEFAULT_DAYS, limit = DEFAULT_LIMIT, fromDaysAgo = 0,
  } = opts;
  if (!userIds?.length && !keywords?.length) return [];

  const userSet = userIds?.length ? new Set(userIds) : null;
  const lowerKeywords = keywords?.length ? keywords.map((k) => k.toLowerCase()) : null;

  const today = backupDateKey();
  const hits: HistoryHit[] = [];

  for (let i = fromDaysAgo; i < fromDaysAgo + days && hits.length < limit; i++) {
    const dateKey = backupDateKey(new Date(Date.now() - i * DAY_MS));
    const file = path.join(CHAT_BACKUP_DIR, `${groupId}_${dateKey}.txt`);
    const lines = readLines(file, dateKey !== today);
    const date = `${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;

    // 文件内是时间正序，倒着扫才是最近优先
    for (let j = lines.length - 1; j >= 0 && hits.length < limit; j--) {
      const hit = matchLine(lines[j], date, userSet, lowerKeywords);
      if (hit) hits.push(hit);
    }
  }

  return hits;
}
