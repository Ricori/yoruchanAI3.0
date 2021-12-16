import YBot from '../../core/YBot';
import YData from '../../core/YData';
import { PrivateMessageEventData, GroupMessageEventData } from '../../types/event';
import { yoruConfig } from '../../../config';

export async function adminMessageListener(data: PrivateMessageEventData) {
  const adminList = yoruConfig.admin || [];
  const userId = data.user_id;

  if (adminList.indexOf(userId) > -1) {
    const { message } = data;
    const exec = /--approve=([0-9]+)/.exec(message);
    if (exec !== null) {
      const approveId = exec[1];
      const ybot = YBot.getInstance();
      const ydata = YData.getInstance();
      ybot.sendPrivateMsg(userId, `[Yoru Bot] 已记录${approveId}至好友白名单`);
      ydata.addApproveFriendIds(parseInt(approveId));
      return true;
    }
  }
  return false;
}
