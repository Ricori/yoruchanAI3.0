import YBot from '../../core/yBot';
import YData from '../../core/yData';
import { GroupMessageEventData } from '../../types/event';
import { yoruConfig } from '../../../config';
import handleHpic from './handle/hpic';

export async function groupMessageListener(data: GroupMessageEventData) {
  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();
  const userId = data.user_id;
  const { message } = data;

  const handleParams = {
    message,
    userId,
    isGroupMessage: true,
    groupId: data.group_id,
  };

  // 1.发送瑟图
  if (yoruConfig.hPic.enable) {
    const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
    if (exec !== null) {
      handleHpic(handleParams);
      return true;
    }
  }

  // 2.群聊复读机功能
  if (yoruConfig.repeater.enable) {
    const res = ydata.saveRepeaterLog(data.group_id, userId, message);
    if (res >= yoruConfig.repeater.times) {
      ydata.setRepeaterDone(data.group_id);
      setTimeout(() => {
        ybot.sendGroupMsg(data.group_id, message);
      }, 1000);
    }
  }

  return true;
}
