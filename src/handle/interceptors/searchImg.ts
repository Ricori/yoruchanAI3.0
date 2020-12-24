import YBot from '../../core/YBot';
import { actionParamType } from '../../core/Interceptor';
import { searchImage } from '../../modules/searchImg';
import { hasImage, getImgs } from './utils';

function searchImgRule(message: string) {
  const hit = hasImage(message);
  if (!hit) {
    return { hit }
  } else {
    const imgsData = getImgs(message);
    return {
      hit,
      param: { imgsData }
    }
  }
}
function searchImgAction(param: actionParamType) {
  const ybot = YBot.getInstance();
  const { senderId, groupId, resultParam } = param;
  const imgsData = resultParam?.imgsData;
  console.log(imgsData);
  if (groupId) {
    //群聊
    searchImage(imgsData).then(resultMsgs => {
      for (const msg of resultMsgs) {
        setTimeout(() => {
          ybot.sendGroupMsg(groupId, msg);
        }, 500)
      }
    })
  } else {
    //私聊
    searchImage(imgsData).then(resultMsgs => {
      for (const msg of resultMsgs) {
        setTimeout(() => {
          ybot.sendPrivateMsg(senderId, msg);
        }, 500)
      }
    })
  }
}

export default {
  name: 'searchImage',
  doRule: searchImgRule,
  doAction: searchImgAction
}