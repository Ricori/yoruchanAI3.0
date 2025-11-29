import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "../base";
import yorubot from '@/core/yoruBot';
import { changeModel } from "@/service/ai";

export default class AdminModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {

  static NAME = 'AdminModule';

  async checkConditions() {
    const adminList = yorubot.config.admin || [];
    const userId = this.data.user_id;
    // Check if in the list
    if (adminList.indexOf(userId) > -1) {
      const message = this.data.message;
      // Exec administrator command

      // AI model switch (chatgpt or deepseek)
      const exec = /--ai_model=([^\s]+)/.exec(message);
      if (exec !== null) {
        return true;
      }


    }
    return false;
  }

  async run() {
    const { user_id: userId, message_type: messageType, message } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    // AI model switch
    const match = message.match(/--ai_model=([^\s]+)/);
    const model = match ? match[1] : null;

    if (model === 'chatgpt' || model === 'deepseek') {
      changeModel(model);
      const reply = `[YoruSystem] The AI model successfully switched to ${model}.`;
      yorubot.sendMsg(groupId, userId, reply);
    }

    // finish
    this.finished = true;
  }

}