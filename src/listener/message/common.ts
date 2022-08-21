import YBot from '../../core/YBot';
import { PrivateMessageEventData, GroupMessageEventData } from '../../types/event';
import { yoruConfig } from '../../../config';
import {
  hasText, hasImage, hasReply, getReplyMsgId,
} from '../../utils/function';
import { getDefaultReply, helpText } from '../../customize/replyTextConfig';
import handleHpic from './handle/hpic';
import handleSearchImg from './handle/searchImg';


export async function commonMessageListener(data: PrivateMessageEventData | GroupMessageEventData) {
  const ybot = YBot.getInstance();
  const isGroupMessage = data.message_type === 'group';
  const userId = data.user_id;
  const { message } = data;

  const handleParams = {
    message,
    userId,
    isGroupMessage,
    groupId: isGroupMessage ? (data as GroupMessageEventData).group_id : undefined,
  };

  // 1.发送帮助
  if (hasText(message, 'help') || hasText(message, '帮助')) {
    if (isGroupMessage) {
      const groupId = (data as GroupMessageEventData).group_id;
      const messageId = (data as GroupMessageEventData).message_id;
      ybot.sendGroupReplyMsg(groupId, helpText, messageId);
    } else {
      ybot.sendPrivateMsg(userId, helpText);
    }
    return true;
  }

  // 2.进行图片搜索
  if (hasReply(message)) {
    // 如果是回复消息，提取原消息
    const replyMsgId = getReplyMsgId(message);
    const replyMsgData = await ybot.getMessageFromId(replyMsgId);
    if (replyMsgData) {
      const rMsg = replyMsgData.message;
      if (hasImage(rMsg)) {
        handleSearchImg({
          ...handleParams,
          message: rMsg,
        });
        return true;
      }
    }
  } else if (hasImage(message)) {
    // 否则用本条消息搜索
    handleSearchImg(handleParams);
    return true;
  }

  // 3.发送瑟图
  if (yoruConfig.hPic.enable) {
    const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
    if (exec !== null) {
      handleHpic(handleParams);
      return true;
    }
  }

  return false;
}

export async function defalutMessageListener(data: PrivateMessageEventData | GroupMessageEventData) {
  const ybot = YBot.getInstance();
  const isGroupMessage = data.message_type === 'group';
  const userId = data.user_id;
  if (isGroupMessage) {
    const groupId = (data as GroupMessageEventData).group_id;
    const messageId = (data as GroupMessageEventData).message_id;
    ybot.sendGroupReplyMsg(groupId, getDefaultReply(), messageId);
  } else {
    ybot.sendPrivateMsg(userId, getDefaultReply());
  }
  return true;
}
