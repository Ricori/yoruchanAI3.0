import YBot from '../core/YBot';
import YData from '../core/YData';
import {
  interceptorsType,
  actionParamType,
  doInterceptor,
  testInterceptor
} from '../core/Interceptor';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';
import config from '../../config';
import REPLYTEXT from '../customize/replyTextConfig';
const yoruConfig = config.yoruConfig;

export default function handleGroup(messageInfo: IGroupMessage) {

  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();


  /*
  const interceptors: interceptorsType = [
    {

    },

  ];



  testInterceptor(interceptors, messageInfo);
  */
  //doInterceptor(interceptors, message);


  //last.群聊的复读机功能
  if (yoruConfig.repeater.enable) {
    const res = ydata.saveRptLog(messageInfo.group_id, messageInfo.user_id, messageInfo.message)
    if (res >= yoruConfig.repeater.times) {
      ydata.setRptDone(messageInfo.group_id);
      setTimeout(() => {
        ybot.sendGroupMsg(messageInfo.group_id, messageInfo.message)
      }, 1000);
    }
  }

  return;

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
