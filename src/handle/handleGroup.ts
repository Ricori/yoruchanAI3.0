import YBot from '../core/YBot';
import YData from '../core/YData';
import {
  interceptorsType,
  doInterceptor,
  testInterceptor
} from '../core/Interceptor';
import { IGroupMessage } from '../core/MessageType';
import hPicInterceptor from './interceptors/hPic';
import config from '../../config';
const yoruConfig = config.yoruConfig;

export default function handleGroup(messageInfo: IGroupMessage) {

  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();

  const interceptors: interceptorsType = [
    hPicInterceptor

  ];


  doInterceptor(interceptors, messageInfo);


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