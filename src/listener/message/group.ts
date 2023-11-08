import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { GroupMessageEventData } from '../../types/event';
import handleHpic from './handle/hpic';

export async function groupMessageListener(data: GroupMessageEventData) {
  const userId = data.user_id;
  const { message } = data;

  const handleParams = {
    message,
    userId,
    isGroupMessage: true,
    groupId: data.group_id,
  };

  // 1.发送瑟图
  if (yorubot.config.hPic.enable) {
    const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
    if (exec !== null) {
      handleHpic(handleParams);
      return true;
    }
  }

  // 2.群聊复读机功能
  if (yorubot.config.repeater.enable) {
    const res = yoruStorage.saveRepeaterLog(data.group_id, userId, message);
    if (res >= yorubot.config.repeater.times) {
      yoruStorage.setRepeaterDone(data.group_id);
      setTimeout(() => {
        yorubot.sendGroupMsg(data.group_id, message);
      }, 1000);
    }
  }

  return true;
}
