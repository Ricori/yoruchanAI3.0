import { PrivateMessageData } from "@/types/event";
import YoruModuleBase from "../base";
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';

export default class AdminModule extends YoruModuleBase<PrivateMessageData> {

  static NAME = 'AdminModule';

  async checkConditions() {
    const adminList = yorubot.config.admin || [];
    const userId = this.data.user_id;
    // Check if in the list
    if (adminList.indexOf(userId) > -1) {
      const message = this.data.message;
      // Exec administrator command
      const exec = /--approve=([0-9]+)/.exec(message);
      if (exec !== null) {
        return true;
      }
    }
    return false;
  }

  async run() {
    const userId = this.data.user_id;
    const message = this.data.message;
    const approveId = /--approve=([0-9]+)/.exec(message)?.[1];
    if (approveId) {
      yorubot.sendPrivateMsg(userId, `[SystemMessage] 已记录 ${approveId} 至待添加好友名单`);
      yoruStorage.joinToBeAddedList(parseInt(approveId));
    }
    // finish
    this.finished = true;
  }

}