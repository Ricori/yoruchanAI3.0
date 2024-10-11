import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "@/modules/base";
import yorubot from '@/core/yoruBot';
import { deleteAtFromMsg, getImgs, getReplyMsgId, hasImage, hasReply } from '@/utils/function';
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
      let tempMessage = '';

      // 获取引用消息文本
      if (hasReply(message)) {
        const replyMsgId = getReplyMsgId(message);
        const replyMsgData = await yorubot.getMessageFromId(replyMsgId);
        if (replyMsgData) {
          tempMessage = deleteAtFromMsg(`${replyMsgData.message}.${message}`);
        }
      } else {
        tempMessage = deleteAtFromMsg(message);
      }

      // 图片消息处理
      if (hasImage(tempMessage)) {
        const imgsData = getImgs(tempMessage);
        const imgUrl = imgsData[0].url;
        const text = tempMessage.replace(/\[CQ:image,.*\]/g, '');
        const res = await getOpenAiReply(userId, text, imgUrl);
        if (res) replyText = res;
      } else {
        const res = await getOpenAiReply(userId, tempMessage);
        if (res) replyText = res;
      }
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