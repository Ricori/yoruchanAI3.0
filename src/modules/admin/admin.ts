import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "../base";
import yorubot from '@/core/yoruBot';
import { generateAiObj, switchThinkingChainDisplay } from "@/service/ai";

export default class AdminModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {

  static NAME = 'AdminModule';

  async checkConditions() {
    const adminList = yorubot.config.admin || [];
    const userId = this.data.user_id;
    // Check if in the list
    if (adminList.indexOf(userId) > -1) {
      const message = this.data.message;
      // Exec administrator command

      // AI model switch
      const exec = /--ai_model=([0-9])/.exec(message);
      if (exec !== null) {
        return true;
      }

      // AI reasoning switch [debug]
      const exec2 = /--ai_reasoning=([0-9])/.exec(message);
      if (exec2 !== null) {
        return true;
      }
    }
    return false;
  }

  async run() {
    const { user_id: userId, message_type: messageType, message } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    // AI model switch
    const switchAIId = /--ai_model=([0-9])/.exec(message)?.[1];
    if (switchAIId === '1' || switchAIId === '2') {
      generateAiObj(switchAIId === '1' ? false : true);
      const reply = `[YoruSystem] The AI model successfully switched to ${switchAIId === '1' ? 'chatgpt' : 'deepseek'}.`;
      yorubot.sendMsg(groupId, userId, reply);
    }

    // AI reasoning switch [debug]
    const reasoningId = /--ai_reasoning=([0-9])/.exec(message)?.[1];
    if (reasoningId === '0' || reasoningId === '1') {
      switchThinkingChainDisplay(Boolean(+reasoningId));
      const reply = `[YoruSystem] Successfully opened the AI ​​thinking chain display`;
      yorubot.sendMsg(groupId, userId, reply);
    }

    // finish
    this.finished = true;
  }

}