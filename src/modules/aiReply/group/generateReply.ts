import { getLLMReply, getLLMReplyWithTools } from '@/service/llm';
import nnkbot from '@/core/nnkBot';
import { printLog } from '@/utils/print';
import type { FormattedMessage } from '@/types/message';
import messageStorage from '../storage/message';
import memoryStore from '../memory/store';
import groupProfileStorage from '../storage/groupProfile';
import { MEMORY_TOOLS, runMemoryTool } from '../memory/tools';
import {
  getDrawNotice, getImageTools, isDrawing, isImageGenEnabled, isImageTool, runImageTool,
} from '../imageGen/tools';
import { getMentionedUserIds } from '../history/mention';
import {
  formatAssistantMessage, formatDrawNoticeMessage,
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

/**
 * 每次回复允许模型调几轮召回工具。
 *
 * 旧账不再由关键词启发式预先塞进 prompt，改成模型自己按需去查——
 * 它才是最好的查询生成器：同义扩展、指代消解、意图推断都是免费的。
 * 主动插话给 0 轮：随口插一句不值得多花一次网络往返
 */
const DEFAULT_TOOL_ROUNDS = { mention: 1, initiative: 0 };

function getToolRounds(isInitiativeReply: boolean): number {
  const key = isInitiativeReply ? 'initiative' : 'mention';
  return nnkbot.config.aiReply.memory?.toolRounds?.[key] ?? DEFAULT_TOOL_ROUNDS[key];
}

/**
 * 只在这几条里找触发本次回复的那条 @。
 *
 * 回复有 3.5s 防抖，这期间可能又插进来几条别人的消息，所以不能只看最后一条；
 * 但也不能翻遍整个 30 条窗口——那会把十几轮之前的旧图当成这次要改的图
 */
const SRC_IMG_LOOKBACK = 5;

/**
 * 取改图的底图。
 *
 * 只认「提到 bot 的那条消息」带的图：它自己发的图，或者它引用的那条消息里的图
 */
function getSrcImgUrl(history: FormattedMessage[]): string | undefined {
  const mention = history
    .slice(-SRC_IMG_LOOKBACK)
    .reverse()
    .find((m) => m.role === 'user' && m.isMentionMe);
  return mention?.imgUrl ?? mention?.refImgUrl;
}

/** 组装群聊上下文（会话历史 + 群友记忆 + 主动插话提示）并调用 LLM 生成回复；
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

  const userMemoryContext = memoryStore.getMemoryContext([...recentUserIds, ...mentionedUserIds]);
  const userMemoryPrompt = formatUserMemoryPromptMessage(userMemoryContext);

  // 档案行接在会话历史之后：稳定内容在前、易变内容在后，
  // 不动 history 里已有的 cacheControl 断点（见 storage/message.ts）
  const messages = [
    ...history,
    ...(userMemoryPrompt ? [userMemoryPrompt] : []),
  ];
  if (isInitiativeReply) {
    // 主动发起会话的提示词
    messages.push(formatInitiativePromptMessage());
  }

  // 出图状态注入。「还在画」让它别催自己，「已发出」让它别再喊还在画、别重复画，「画崩了」让它别假装图已经交了
  const drawNotice = getDrawNotice(groupId);
  if (drawNotice) {
    messages.push(formatDrawNoticeMessage(drawNotice));
  }

  // 还在画的这一轮不给画图工具——不该排队画第二张
  const stillDrawing = isDrawing(groupId);

  const context = getGroupContext(groupId);
  const rounds = getToolRounds(isInitiativeReply);

  const srcImgUrl = getSrcImgUrl(history);
  const canDraw = isImageGenEnabled(groupId) && !stillDrawing;
  const tools = [
    ...MEMORY_TOOLS,
    // 没有底图时 edit_image 不下发，模型看不见就不会去改别人的图
    ...(canDraw ? getImageTools(!!srcImgUrl) : []),
  ];

  let toolCalls = 0;
  const aiReplyText = rounds > 0
    ? await getLLMReplyWithTools(messages, context, tools, (name, input) => {
      toolCalls += 1;
      return isImageTool(name)
        ? runImageTool(groupId, name, input, srcImgUrl)
        : runMemoryTool(groupId, name, input);
    }, rounds)
    // 0 轮就走原来的无工具请求：不下发 tools，缓存前缀和以前完全一致
    : await getLLMReply(messages, context);

  if (aiReplyText) {
    // 记忆自己的回复，并带上触发方式供备份日志标注
    const assistantMessage = formatAssistantMessage(
      aiReplyText,
      isInitiativeReply,
      initiativeChance,
      toolCalls,
      mentionedUserIds.length,
    );
    messageStorage.addGroupChatConversations(groupId, assistantMessage);
  }
  return aiReplyText;
}
