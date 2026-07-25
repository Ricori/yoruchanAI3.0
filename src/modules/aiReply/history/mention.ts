import type { FormattedMessage } from '@/types/message';
import userMemoryStorage from '../storage/userMemory';
import aliasIndex from './aliasIndex';

/** 认人时往回看几条群友发言：bot 有 3.5s 防抖，等它开口时问句往往已经被后续消息挤下去了 */
const MENTION_SCAN_COUNT = 5;

/** 一次最多额外注入几个被提到的人的档案 */
const MAX_MENTIONED_USERS = 2;

/**
 * 找出「被提到但这轮没发言」的群友。
 * 档案本来只按最近发言人加载，于是「雨漫是谁」这种问题永远查不到——
 * 雨漫的档案在盘上，但她此刻没说话。这里靠昵称索引把名字解析成 userId 补上。
 *
 * loaded 是已经会被注入的人，要整个排除掉：群里很多人习惯用第三人称称呼自己
 * （「小雏觉得…」），认出来的其实是说话人本人，不排除就会白占注入名额
 */
export function getMentionedUserIds(
  groupId: number,
  history: FormattedMessage[],
  loaded: Set<number>,
): number[] {
  // 倒序：bot 要回的是最后那条，它提到的人得先占名额。
  // 正序扫的话前几条旧消息会把 MAX_MENTIONED_USERS 占满，把正主挤掉
  const recent = history
    .filter((m) => m.role === 'user' && m.userId !== 0)
    .slice(-MENTION_SCAN_COUNT)
    .reverse();

  const ids = new Set<number>();
  recent.forEach((m) => {
    aliasIndex.resolve(groupId, m.message).forEach((userId) => {
      // 认出了名字但这个人没有任何档案可注入，占名额也没意义
      if (!loaded.has(userId) && userMemoryStorage.hasMemory(userId)) ids.add(userId);
    });
  });

  return [...ids].slice(0, MAX_MENTIONED_USERS);
}
