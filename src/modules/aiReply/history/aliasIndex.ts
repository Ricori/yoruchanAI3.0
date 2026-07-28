import fs from 'fs';
import path from 'path';
import { printError, printLog } from '@/utils/print';
import { CHAT_BACKUP_DIR, backupDateKey } from '../storage/message';
import userMemoryStorage from '../storage/userMemory';
import { stripSpeakerPrefix } from '../memory/segment';
import { matchAlias, normalizeAlias, normalizeText } from './nameMatch';

/**
 * 昵称索引：userId -> 这个人用过的全部名字。
 *
 * 群友问「XXX是谁」时，光靠「最近发过言的人」永远找不到 XXX——他此刻很可能没在说话。
 * 这里从聊天备份日志反推出「名字 -> userId」的映射，让被提到的人也能被认出来。
 *
 * 别名全自动派生，不需要人工维护：备份日志每行都是 `[userId][昵称]内容`，
 * 扫一遍就能拿到每个人的历史昵称，连改名前的旧名一起收进来——
 * 这恰恰是只存当前昵称的档案文件做不到的（改了名，旧名就永远对不上了）。
 */

/** 备份文件名 `{groupId}_{yyyymmdd}.txt` */
const FILE_RE = /^(\d+)_(\d{8})\.txt$/;

/** 备份行首的 `[userId][昵称]` */
const LINE_RE = /^\[(\d+)\]\[([^\]]*)\]/;

/**
 * 只扫这么多天内的备份。更早的昵称基本没人再叫了，留着只会扩大误命中面，
 * 也免得日志目录逐年增长后启动扫描越来越慢
 */
const INDEX_DAYS = 180;

/** 一条消息最多认出几个人，多了大概率是误命中 */
const MAX_CANDIDATES = 4;

/** 一个 userId 的全部曾用名 */
interface UserAliases {
  /** 归一化昵称 -> 最后一次见到的日期 yyyymmdd，撞名时用来判断谁更近活跃 */
  aliases: Map<string, number>;
  /** 出现过的群。解析时只认同群的人，避免跨群撞名张冠李戴 */
  groups: Set<number>;
}

class AliasIndex {
  private byUser = new Map<number, UserAliases>();

  /** 日志建底是一次性的，首次解析时才做，避免拖慢启动 */
  private built = false;

  private entryOf(userId: number): UserAliases {
    let entry = this.byUser.get(userId);
    if (!entry) {
      entry = { aliases: new Map(), groups: new Set() };
      this.byUser.set(userId, entry);
    }
    return entry;
  }

  /**
   * 记下某人在某群用过的昵称。日志建底走这里，收到新消息时也走这里——
   * 改名后当天就能认出新名字，不用等下次重启
   */
  note(groupId: number, userId: number, nickName: string, date = Number(backupDateKey())) {
    // bot 自己不进索引
    if (userId === 0) return;
    const alias = normalizeAlias(nickName);
    if (!alias) return;

    const entry = this.entryOf(userId);
    entry.groups.add(groupId);
    if (date > (entry.aliases.get(alias) ?? 0)) {
      entry.aliases.set(alias, date);
    }
  }

  private scanFile(file: string, groupId: number, date: number) {
    const lines = fs.readFileSync(path.join(CHAT_BACKUP_DIR, file), 'utf-8').split('\n');
    lines.forEach((line) => {
      const m = LINE_RE.exec(line);
      if (m) this.note(groupId, Number(m[1]), m[2], date);
    });
  }

  /**
   * 并入人工写在 data/memory/user/{userId}.json 的 aliases。
   * 自动派生只能拿到日志里出现过的写法，圈内外号、本名这类和昵称毫无字面关系的叫法
   * 只能人工补。返回补进去的条数。
   *
   * 只给已经在日志里露过面的人加：索引靠 groups 做同群约束，
   * 一个群都没出现过的人无从归属，硬加进去会变成跨群误命中
   */
  private addManualAliases(): number {
    const today = Number(backupDateKey());
    let added = 0;

    userMemoryStorage.getManualAliases().forEach((aliases, userId) => {
      const entry = this.byUser.get(userId);
      if (!entry) return;
      aliases.forEach((raw) => {
        const alias = normalizeAlias(raw);
        // 人工确认过的叫法按「今天见过」算，撞名时压过日志里的旧名
        if (alias && !entry.aliases.has(alias)) {
          entry.aliases.set(alias, today);
          added += 1;
        }
      });
    });
    return added;
  }

  /** 扫聊天备份建底，失败不致命：索引空着只是认不出人，不影响回复 */
  private build() {
    this.built = true;
    const oldest = Number(backupDateKey(new Date(Date.now() - INDEX_DAYS * 24 * 60 * 60 * 1000)));

    try {
      fs.readdirSync(CHAT_BACKUP_DIR).forEach((file) => {
        const m = FILE_RE.exec(file);
        if (m && Number(m[2]) >= oldest) {
          this.scanFile(file, Number(m[1]), Number(m[2]));
        }
      });
      const manual = this.addManualAliases();
      const aliasCount = [...this.byUser.values()].reduce((n, e) => n + e.aliases.size, 0);
      printLog(`[AliasIndex] 已从聊天记录建立 ${this.byUser.size} 人 / ${aliasCount} 个昵称的索引`
        + `（其中 ${manual} 个来自档案里人工填的 aliases）`);
    } catch (e) {
      printError(`[AliasIndex] 建立昵称索引失败: ${e}`);
    }
  }

  /**
   * 从一条群消息里认出被提到的群友，按匹配得分降序返回 userId。
   * 只返回和本群有过交集的人；有没有档案可注入由调用方判断
   */
  resolve(groupId: number, message: string): number[] {
    if (!this.built) this.build();

    const text = normalizeText(stripSpeakerPrefix(message));
    if (!text) return [];

    const scored: { userId: number; score: number; lastSeen: number }[] = [];
    this.byUser.forEach((entry, userId) => {
      if (!entry.groups.has(groupId)) return;

      let score = 0;
      let lastSeen = 0;
      entry.aliases.forEach((date, alias) => {
        const s = matchAlias(text, alias);
        if (s > 0) {
          score = Math.max(score, s);
          lastSeen = Math.max(lastSeen, date);
        }
      });
      if (score > 0) scored.push({ userId, score, lastSeen });
    });

    // 同名的人取最近还在活跃的那个：`azu`、`泽叶` 这类昵称在群里真的被两个号用过
    scored.sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen);
    return scored.slice(0, MAX_CANDIDATES).map((c) => c.userId);
  }
}

export default new AliasIndex();
