import YBot from '../../core/YBot';
import { PrivateMessageEventData, GroupMessageEventData } from '../../types/event';
import { yoruConfig } from '../../../config';
import { hasText, hasImage } from '../../utils/function';
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
      ybot.sendGroupMsg(groupId, helpText, userId);
    } else {
      ybot.sendPrivateMsg(userId, helpText);
    }
    return true;
  }

  // 2.发现图片，进行图片搜索
  if (hasImage(message)) {
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
    ybot.sendGroupMsg(groupId, getDefaultReply(), userId);
  } else {
    ybot.sendPrivateMsg(userId, getDefaultReply());
  }
  return true;
}
