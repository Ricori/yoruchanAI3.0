import YBot from '../../core/YBot';
import YData from '../../core/YData';
import { RequestFirendEventData } from '../../types/event';
import { yoruConfig } from '../../../config';

export async function requestFirendListener(data: RequestFirendEventData) {
  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();
  const userId = data.user_id;
  if (yoruConfig.autoAddFriend || ydata.checkApproveFriend(userId)) {
    ybot.setFriendAddRequest(data.flag, true);
    ydata.deleteApproveFriend(userId);
    (yoruConfig.admin || []).forEach((adminId) => {
      if (!Number.isNaN(Number(adminId))) {
        ybot.sendPrivateMsg(adminId, `[YoruBot] 新增好友${userId}`);
      }
    });
  } else {
    ybot.setFriendAddRequest(data.flag, false);
  }
}
