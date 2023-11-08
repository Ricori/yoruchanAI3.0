import yorubot from '@/core/yoruBot';
import { PrivateMessageEventData, GroupMessageEventData } from '../../types/event';
import {
  hasText, hasImage, hasReply, getReplyMsgId, deleteAtFromMsg,
} from '@/utils/function';
import { getOpenAiReply } from '@/modules/openai';
import handleHpic from './handle/hpic';
import handleSearchImg from './handle/searchimg';

const helpText = '有问题请联系开发者takamichikan，本帮助最后更新于2019年4月8日。';

export async function commonMessageListener(data: PrivateMessageEventData | GroupMessageEventData) {
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
      yorubot.sendGroupReplyMsg(groupId, helpText, messageId);
    } else {
      yorubot.sendPrivateMsg(userId, helpText);
    }
    return true;
  }

  // 2.进行图片搜索
  if (hasReply(message)) {
    // 如果是回复消息，提取原消息
    const replyMsgId = getReplyMsgId(message);
    const replyMsgData = await yorubot.getMessageFromId(replyMsgId);
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
  if (yorubot.config.hPic.enable) {
    const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
    if (exec !== null) {
      handleHpic(handleParams);
      return true;
    }
  }

  return false;
}

// 不在功能范围时默认回复
export function getDefaultReply() {
  return '夜夜酱受到了特殊电波干扰，暂时没法回答主人的问题呢，主人可以过会儿重新询问夜夜酱哦';
  // return randomText([
  //   '渣滓主人请不要提过分的要求',
  //   '你说你🐎呢',
  // ]);
}


export async function defalutMessageListener(data: PrivateMessageEventData | GroupMessageEventData) {
  const isGroupMessage = data.message_type === 'group';
  const userId = data.user_id;

  let replyText = '';
  if (yorubot.config.openAi.enable) {
    // 开启了chatGpt回复
    const prompt = deleteAtFromMsg(data.message);
    const res = await getOpenAiReply(userId, prompt);
    if (res) {
      replyText = res;
    } else {
      replyText = getDefaultReply();
    }
  } else {
    replyText = getDefaultReply();
  }

  if (isGroupMessage) {
    const groupId = data.group_id;
    const messageId = data.message_id;
    yorubot.sendGroupReplyMsg(groupId, replyText, messageId);
  } else {
    yorubot.sendPrivateMsg(userId, replyText);
  }
  return true;
}
