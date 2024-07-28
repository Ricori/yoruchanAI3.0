import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "@/modules/base";
import yorubot from '@/core/yoruBot';
import { deleteAtFromMsg, getReplyMsgId, hasReply } from '@/utils/function';
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

    let tempMessage = '';
    if (hasReply(message)) {
      const replyMsgId = getReplyMsgId(message);
      const replyMsgData = await yorubot.getMessageFromId(replyMsgId);
      if (replyMsgData) {
        tempMessage = deleteAtFromMsg(`${replyMsgData.message}。${message}`);
      }
    } else {
      tempMessage = deleteAtFromMsg(message);
    }

    if (yorubot.config.openAi.enable) {
      const res = await getOpenAiReply(userId, tempMessage);
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