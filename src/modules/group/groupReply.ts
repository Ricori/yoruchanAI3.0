import { GroupMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import {
  calculateTypingDelay, cleanAt, getReplyMsgId, hasReply, sleep,
} from '@/utils/function';
import { generateAssistantMessageParam, generateUserMessageParam, getAiReply } from '@/service/ai';
import yoruStorage from '@/core/yoruStorage';
import { printLog } from '@/utils/print';

const sessionTimers = new Map<number, NodeJS.Timeout | null>();
const processingLocks = new Set<number>(); // 正在回复的群的锁

async function processReplyQueue(groupId: number, autonomousReply = false) {
  // 需要下次回复时，如果还在发送上一条，等2秒后再看看锁解开没
  if (processingLocks.has(groupId)) {
    setTimeout(() => processReplyQueue(groupId), 2000);
    return;
  }
  processingLocks.add(groupId); // 上锁

  try {
    yoruStorage.trimGroupChatConversations(groupId);
    const history = yoruStorage.getGroupChatConversations(groupId);

    // 调用 LLM 回复
    let aiReplyText: string | null = null;
    if (autonomousReply) {
      // 主动发起会话的提示词
      const autoPrompt = generateUserMessageParam('（System：群友并没有@你，请根据上面的对话自然地随机插一句嘴，刷一下存在感）');
      aiReplyText = await getAiReply([...history, autoPrompt]);

      printLog(`[GroupAIReplyModule] Auto Reply: ${aiReplyText}`);
      console.log(history);
    } else {
      aiReplyText = await getAiReply(history);
    }

    if (aiReplyText) {
      const aiReplyMessageParam = generateAssistantMessageParam(aiReplyText);
      yoruStorage.addGroupChatConversations(groupId, aiReplyMessageParam);

      const messages = aiReplyText
        .split('||')
        .map((msg) => msg.trim())
        .filter((msg) => msg.length > 0);

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i].trim();
        if (i > 0) {
          const delay = calculateTypingDelay(msg);
          await sleep(delay);
        }
        yorubot.sendGroupMsg(groupId, msg);
      }
    }
  } finally {
    // 解锁
    processingLocks.delete(groupId);
  }
}



export default class GroupAIReplyModule extends YoruModuleBase<GroupMessageData> {
  static NAME = 'GroupAIReplyModule';

  async checkConditions() {
    if (!yorubot.config.aiReply.enable) {
      return false;
    }
    const { group_id: groupId } = this.data;
    const { blackList } = yorubot.config.aiReply;
    if (blackList.includes(groupId)) {
      return false;
    }

    return true;
  }


  async run() {
    const {
      message, user_id: userId, self_id: selfId, group_id: groupId, sender,
    } = this.data;
    const nickName = sender.nickname || userId;

    let shouldReply = false;
    let autonomousReply = false;
    let processedMessage = '';

    // 获取引用消息文本
    if (hasReply(message)) {
      const replyMsgId = getReplyMsgId(message);
      const replyMsgData = await yorubot.getMessageFromId(replyMsgId);
      if (replyMsgData) {
        const isBot = replyMsgData.sender.user_id === selfId;
        const cleanText = cleanAt(replyMsgData.message).replace(/\[CQ:image,[^\]]+\]/g, '[之前的图片]').trim();
        processedMessage = `[${nickName}]回复了${isBot ? '我' : replyMsgData.sender.nickname || ''}的消息(${cleanText.slice(0, 90)})，说：${cleanAt(message)}`;
        shouldReply = true;
      }
    } else {
      processedMessage = `[${nickName}]说：${cleanAt(message).trim()}`;
    }

    // 记录群对话记录
    const messageParam = generateUserMessageParam(processedMessage, false);

    if (messageParam) {
      yoruStorage.addGroupChatConversations(groupId, messageParam);
    }



    if (message.indexOf(`[CQ:at,qq=${selfId}]`) > -1) {
      // 在群里被@了
      shouldReply = true;
    }
    if (groupId === 914620769) {
      // 主动插话的白名单测试群
      const triggerChance = 0.1;
      if (Math.random() < triggerChance) {
        shouldReply = true;
        autonomousReply = true;
      }
    }


    // 没有命中触发条件直接返回
    if (!shouldReply) return;

    // 触发的话进入队列
    if (sessionTimers.has(groupId) && sessionTimers.get(groupId)) {
      clearTimeout(sessionTimers.get(groupId)!);
    }
    const timer = setTimeout(() => {
      sessionTimers.set(groupId, null);
      processReplyQueue(groupId, autonomousReply);
    }, 3000);
    sessionTimers.set(groupId, timer);
  }
}

