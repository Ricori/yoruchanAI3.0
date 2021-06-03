import YBot from '../../core/YBot';
import { actionParamType } from '../../core/Interceptor';
import searchImage from '../../modules/searchImg';
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
  const imgsData = resultParam?.imgsData as { file: string; url: string }[];
  const urls = imgsData.map(item => item.url);
  if (groupId) {
    //群聊
    searchImage(urls).then(resultMsgs => {
      for (const msg of resultMsgs) {
        ybot.sendGroupMsg(groupId, msg);
      }
    })
  } else {
    //私聊
    searchImage(urls).then(resultMsgs => {
      for (const msg of resultMsgs) {
        ybot.sendPrivateMsg(senderId, msg);
      }
    })
  }
}

export default {
  name: 'searchImage',
  doRule: searchImgRule,
  doAction: searchImgAction
}