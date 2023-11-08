
import { GroupMessageData } from "@/types/event";
import YoruModuleBase from "@/modules/base";
import yorubot from '@/core/yoruBot';
import yoruStorage from "@/core/yoruStorage";

export default class RepeaterModule extends YoruModuleBase<GroupMessageData> {

  static NAME = 'RepeaterModule';

  async checkConditions() {
    if (!yorubot.config.repeater.enable) return false;
    const { message, user_id: userId, group_id: groupId } = this.data;
    const times = yoruStorage.saveLogAndGetRepeaterTimes(groupId, userId, message);
    if (times >= yorubot.config.repeater.times) {
      return true;
    }

    return false;
  }

  async run() {
    const { message, group_id: groupId } = this.data;
    yoruStorage.setRepeaterDone(groupId);

    setTimeout(() => {
      yorubot.sendGroupMsg(groupId, message);
    }, 1000);

    // finish
    this.finished = true;
  }
}