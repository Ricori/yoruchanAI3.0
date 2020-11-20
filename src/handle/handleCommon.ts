import YBot from '../core/YBot';
import {
  interceptorsType,
  actionParamType,
  doInterceptor,
  testInterceptor
} from '../core/Interceptor';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';
import { getHPic } from '../modules/hPic';

import config from '../../config';
import { helpText, hPicReplyText } from '../customize/replyTextConfig';
const yoruConfig = config.yoruConfig;

export default function handleCommon(messageInfo: IPrivateMessage | IGroupMessage) {

  const interceptors: interceptorsType = [
    {
      name: 'helpText',
      doRule: helpTextRule,
      doAction: helpTextAction
    },
    {
      name: 'hPic',
      doRule: hPicRule,
      doAction: hPicAction
    },

  ];

  return doInterceptor(interceptors, messageInfo);
}


function hasText(text: string, findText: string) {
  return text.search(findText) !== -1;
}
function hasImage(msg: string) {
  return msg.indexOf("[CQ:image") !== -1;
}
function replyMessage(param: actionParamType, msg: string, at = false) {
  const ybot = YBot.getInstance();
  const { senderId, groupId } = param;
  if (groupId) {
    ybot.sendGroupMsg(groupId, msg, at ? senderId : undefined);
  } else {
    ybot.sendPrivateMsg(senderId, msg)
  }
};

function helpTextRule(message: string) {
  return {
    hit: hasText(message, 'help') || hasText(message, '帮助')
  }
}
function helpTextAction(param: actionParamType) {
  replyMessage(param, helpText, true)
}

function hPicRule(message: string) {
  if (!yoruConfig.hPic.enable) {
    return { hit: false }
  }
  const exec = /((要|发|份|点)(色|h|瑟|涩)图)/.exec(message);
  let needBig = false;
  if (exec !== null) {
    needBig = hasText(message, '大');
  }
  return {
    hit: exec !== null,
    param: { needBig }
  }
}
function hPicAction(param: actionParamType) {
  const ybot = YBot.getInstance();
  const { senderId, groupId, resultParam } = param;
  const needBig = resultParam?.needBig;
  if (groupId) {
    //0=全年龄,1=混合,2=r18Only
    let limitLevel = 0 as 0 | 1 | 2;
    //设置色图限制等级
    const whiteOnly = yoruConfig.hPic.whiteOnly;
    const whiteList = yoruConfig.hPic.whiteGroup;
    const inWhiteList = whiteList.includes(groupId);
    if (whiteOnly && !inWhiteList) {
      //该群无色图权限
      ybot.sendGroupMsg(groupId, hPicReplyText.noAuth);
      return;
    }
    if (inWhiteList) {
      const lv = yoruConfig.hPic.whiteGroupLimit;
      if ([0, 1, 2].includes(lv)) {
        limitLevel = lv as 0 | 1 | 2;
      }
    }
    getHPic(limitLevel, needBig).then(resultMsg => {
      ybot.sendGroupMsg(groupId, resultMsg);
    })
  } else {
    //私聊无限制
    getHPic(1, needBig).then(resultMsg => {
      ybot.sendPrivateMsg(senderId, resultMsg)
    })
  }
}





