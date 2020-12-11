import YBot from '../../core/YBot';
import { actionParamType } from '../../core/Interceptor';
import { getHPic } from '../../modules/hPic';
import config from '../../../config';
import { hPicReplyText } from '../../customize/replyTextConfig';
const yoruConfig = config.yoruConfig;

function hPicRule(message: string) {
  if (!yoruConfig.hPic.enable) {
    return { hit: false }
  }
  const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
  let needBig = false;
  if (exec !== null) {
    needBig = message.search('大') !== -1;
  }
  let count = 1;
  const countExec = /([0-9]+)[张份]/.exec(message);
  if (countExec && countExec[1]) {
    count = Number(countExec[1])
  }
  return {
    hit: exec !== null,
    param: { needBig, count }
  }
}
function hPicAction(param: actionParamType) {
  const ybot = YBot.getInstance();
  const { senderId, groupId, resultParam } = param;
  const needBig = resultParam?.needBig;
  let count = resultParam?.count;
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
    const useSmallPic = yoruConfig.hPic.useSmallPic;
    const limitCount = limitLevel === 2 ? 20 : 9
    if (count > limitCount) {
      count = limitCount;
    }
    getHPic(limitLevel, needBig, count, false, useSmallPic).then(resultMsgs => {
      const delay = limitLevel === 2 ? 1200 : 4000;
      let i = 0;
      for (const msg of resultMsgs) {
        setTimeout(() => {
          ybot.sendGroupMsg(groupId, msg);
        }, i * delay)
        i++;
      }
    })
  } else {
    ybot.sendPrivateMsg(senderId, '因腾讯限制，私聊上传图片失败概率高，请在群中使用此功能')
    /*
    getHPic(1, needBig, count, true, true).then(resultMsgs => {
      ybot.sendPrivateMsg(senderId, resultMsg)
    })
    */
  }
}

export default {
  name: 'hPic',
  doRule: hPicRule,
  doAction: hPicAction
}