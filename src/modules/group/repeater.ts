
import { GroupMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';

export default class RepeaterModule extends YoruModuleBase<GroupMessageData> {
  static NAME = 'RepeaterModule';

  async checkConditions() {
    if (!yorubot.config.repeater.enable) return false;
    const { message, group_id: groupId } = this.data;
    const times = yoruStorage.saveRepeaterLog(groupId, message);
    const randomValue = Math.floor(Math.random() * 2);
    return times >= 2 + randomValue;
  }

  async run() {
    const { message, group_id: groupId } = this.data;
    yoruStorage.setRepeaterDone(groupId);

    setTimeout(() => {
      yorubot.sendGroupMsg(groupId, message);
    }, 1200);
  }
}
