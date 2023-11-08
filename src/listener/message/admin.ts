import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { PrivateMessageEventData, GroupMessageEventData } from '../../types/event';

export async function adminMessageListener(data: PrivateMessageEventData) {
  const adminList = yorubot.config.admin || [];
  const userId = data.user_id;

  if (adminList.indexOf(userId) > -1) {
    const { message } = data;
    const exec = /--approve=([0-9]+)/.exec(message);
    if (exec !== null) {
      const approveId = exec[1];
      yorubot.sendPrivateMsg(userId, `[Yoru Bot] 已记录${approveId}至好友白名单`);
      yoruStorage.addApproveFriendIds(parseInt(approveId));
      return true;
    }
  }
  return false;
}
