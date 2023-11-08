import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { RequestFirendEventData } from '@/types/event';

export async function requestFirendListener(data: RequestFirendEventData) {
  const userId = data.user_id;
  if (yorubot.config.autoAddFriend || yoruStorage.checkApproveFriend(userId)) {
    yorubot.setFriendAddRequest(data.flag, true);
    yoruStorage.deleteApproveFriend(userId);
    (yorubot.config.admin || []).forEach((adminId) => {
      if (!Number.isNaN(Number(adminId))) {
        yorubot.sendPrivateMsg(adminId, `[YoruBot] 新增好友${userId}`);
      }
    });
  } else {
    yorubot.setFriendAddRequest(data.flag, false);
  }
}
