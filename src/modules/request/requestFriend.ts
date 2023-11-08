import { RequestFirendMessageData } from "@/types/event";
import YoruModuleBase from "../base";
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';

export default class RequestFriendModule extends YoruModuleBase<RequestFirendMessageData> {

  static NAME = 'RequestFriendModule';

  async checkConditions() {
    return true;
  }

  async run() {
    const userId = this.data.user_id;
    const flag = this.data.flag;
    if (yorubot.config.autoAddFriend || yoruStorage.getIsInToBeAddedList(userId)) {
      // Agree to be added as a friend
      yorubot.setFriendAddRequest(flag, true);
      // Delete id from to be added list
      yoruStorage.deleteIdFromToBeAddedList(userId);
      // Send notification to administrator
      (yorubot.config.admin || []).forEach((adminId) => {
        if (!Number.isNaN(Number(adminId))) {
          yorubot.sendPrivateMsg(adminId, `[SystemMessage] 新增好友，Id：${userId}`);
        }
      });
    } else {
      // Refuse to be friends
      yorubot.setFriendAddRequest(flag, false);
    }

    // finish
    this.finished = true;
  }

}