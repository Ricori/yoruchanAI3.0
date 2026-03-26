import { PrivateMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import { generateAssistantMessageParam, generateUserMessageParam, getAiReply } from '@/service/ai';
import yoruStorage from '@/core/yoruStorage';
import { calculateTypingDelay, sleep, trimChar } from '@/utils/function';

export default class PrivateAIReplyModule extends YoruModuleBase<PrivateMessageData> {
  static NAME = 'PrivateAIReplyModule';

  async checkConditions() {
    return yorubot.config.aiReply.enable;
  }

  async run() {
    const { message, user_id: userId } = this.data;

    const messageParam = generateUserMessageParam(message);

    yoruStorage.addPrivateChatMessage(userId, messageParam);
    const history = yoruStorage.getPrivateChatMessage(userId);
    const aiReplyText = await getAiReply(history, false);

    if (aiReplyText) {
      const aiReplyMessageParam = generateAssistantMessageParam(aiReplyText);
      yoruStorage.addPrivateChatMessage(userId, aiReplyMessageParam);

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
        yorubot.sendPrivateMsg(userId, msg);
      }
    }
  }
}


