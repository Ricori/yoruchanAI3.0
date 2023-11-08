import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "@/modules/base";
import yorubot from '@/core/yoruBot';
import { deleteAtFromMsg } from '@/utils/function';
import { getOpenAiReply } from "@/service/openai";

export default class DefaultReplyModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {

  static NAME = 'DefaultReplyModule';

  async checkConditions() {
    return true;
  }

  async run() {
    const { message, user_id: userId, message_type: messageType, message_id: messageId } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    let replyText = '夜夜酱受到了特殊电波干扰，暂时没法回答主人的问题呢，主人可以过会儿重新询问夜夜酱哦';

    if (yorubot.config.openAi.enable) {
      const prompt = deleteAtFromMsg(message);
      const res = await getOpenAiReply(userId, prompt);
      if (res) replyText = res;
    }

    if (groupId) {
      yorubot.sendGroupReplyMsg(groupId, replyText, messageId);
    } else {
      yorubot.sendPrivateMsg(userId, replyText);
    }

    // finish
    this.finished = true;
  }
}