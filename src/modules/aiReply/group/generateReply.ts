import { getLLMReply } from '@/service/llm';
import nnkbot from '@/core/nnkBot';
import { printLog } from '@/utils/print';
import type { FormattedMessage } from '@/types/message';
import messageStorage from '../storage/message';
import userMemoryStorage from '../storage/userMemory';
import groupProfileStorage from '../storage/groupProfile';
import { searchGroupHistory, type HistoryHit } from '../history/search';
import { extractKeywords } from '../history/keywords';
import { getMentionedUserIds } from '../history/mention';
import {
  formatAssistantMessage, formatHistoryPromptMessage,
  formatInitiativePromptMessage, formatUserMemoryPromptMessage,
} from '../format';

/** 会主动插话、却还没写群档案的群，先按陌生群对待，免得把主场的语气带过去 */
const DEFAULT_PROFILE_TEXT = '陌生群，关系空白：少说话，语气收敛，优先只回应直接向你说话的人';

/** 取注入 system 的群环境描述：有档案用档案，
 *  没档案但会主动插话的群用保守默认文案，其余（只在被 @ 时回复）不注入 */
function getGroupContext(groupId: number): string | undefined {
  const { profileText } = groupProfileStorage.getProfile(groupId);
  if (profileText) return profileText;
  if (nnkbot.config.aiReply.initiativeList.includes(groupId)) return DEFAULT_PROFILE_TEXT;
  return undefined;
}

/** 同群两次注入旧账的最小间隔，防止 bot 变成检索工具人 */
const HISTORY_COOLDOWN = 10 * 60 * 1000;
const lastHistoryInjectTime = new Map<number, number>();

/** 取「旧账」槽位：检索这位群友以前说过的、和当前话题相关的话。
 *  大多数时候检索不到，返回空数组即什么都不注入 */
function getHistoryHits(groupId: number, history: FormattedMessage[]): HistoryHit[] {
  const now = Date.now();
  if (now - (lastHistoryInjectTime.get(groupId) ?? 0) < HISTORY_COOLDOWN) return [];

  const last = [...history].reverse().find((m) => m.role === 'user' && m.userId !== 0);
  if (!last) return [];

  const keywords = extractKeywords(last.message);
  if (keywords.length === 0) return [];

  // 只翻今天以前的：30 条的会话窗口已经覆盖了当天近期的发言，
  // 再把它们当「旧账」注入就是同一句话说两遍
  const hits = searchGroupHistory(groupId, { userIds: [last.userId], keywords, fromDaysAgo: 1 });

  // 节流只在真的注入了才计时，检索落空不占用冷却窗口
  if (hits.length > 0) lastHistoryInjectTime.set(groupId, now);
  return hits;
}

/** 组装群聊上下文（会话历史 + 群友记忆 + 旧账 + 主动插话提示）并调用 LLM 生成回复；
 *  生成成功后会把回复记入该群会话历史 */
export async function generateGroupReply(
  groupId: number,
  isInitiativeReply: boolean,
  initiativeChance: number | null = null,
): Promise<string | null> {
  const history = messageStorage.getGroupChatConversations(groupId);

  // 近期发言用户的记忆上下文
  const recentUserIds = [...new Set(
    history.slice(-10).filter((m) => m.role === 'user').map((m) => m.userId),
  )];

  // 再补上被点到名却没发言的人，他们的档案不补就永远查不到
  const mentionedUserIds = getMentionedUserIds(groupId, history, new Set(recentUserIds));
  if (mentionedUserIds.length > 0) {
    printLog(`[GenerateReply] ${groupId} 认出被提到的群友: ${mentionedUserIds.join(', ')}`);
  }

  const userMemoryContext = userMemoryStorage.getMemoryContext([...recentUserIds, ...mentionedUserIds]);
  const userMemoryPrompt = formatUserMemoryPromptMessage(userMemoryContext);

  const historyHits = getHistoryHits(groupId, history);
  const historyPrompt = formatHistoryPromptMessage(historyHits);

  const messages = [
    ...history,
    ...(userMemoryPrompt ? [userMemoryPrompt] : []),
    ...(historyPrompt ? [historyPrompt] : []),
  ];
  if (isInitiativeReply) {
    // 主动发起会话的提示词
    messages.push(formatInitiativePromptMessage());
  }

  const aiReplyText = await getLLMReply(messages, getGroupContext(groupId));
  if (aiReplyText) {
    // 记忆自己的回复，并带上触发方式供备份日志标注
    const historyHitCount = historyHits.length;
    const mentionHitCount = mentionedUserIds.length;
    const assistantMessage = formatAssistantMessage(aiReplyText, isInitiativeReply, initiativeChance, historyHitCount, mentionHitCount);
    messageStorage.addGroupChatConversations(groupId, assistantMessage);
  }
  return aiReplyText;
}
