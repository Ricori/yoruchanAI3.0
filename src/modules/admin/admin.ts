import { GroupMessageData, PrivateMessageData } from '@/types/event';
import yorubot from '@/core/yoruBot';
import { createMsgFromTweetId } from '@/tasks/twitter';
import yoruStorage from '@/core/yoruStorage';
import YoruModuleBase from '../base';

export default class AdminModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {
  static NAME = 'AdminModule';

  async checkConditions() {
    const adminList = yorubot.config.admin || [];
    const userId = this.data.user_id;
    // Check if in the list
    if (adminList.indexOf(userId) > -1) {
      const { message } = this.data;
      // Exec administrator command

      // clean memory
      if (message === '--clean-memory') {
        return true;
      }

      // Push twiiter
      const pushTwiiterExec = /--push-twiiter=(\d+)/.exec(message);
      if (pushTwiiterExec !== null) {
        return true;
      }
    }
    return false;
  }

  async run() {
    const { user_id: userId, message_type: messageType, message } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    // clean memory
    if (message === '--clean-memory') {
      yoruStorage.cleanGroupChatConversations();
      yorubot.sendMsg(groupId, userId, '[YoruSystem] Memory cleaned.');
      return;
    }

    // Push twiiter
    const tweetIdMatch = message.match(/--push-twiiter=(\d+)/);
    const groupMatch = message.match(/--group=(\d+)/);
    const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;
    const targetGroupId = groupMatch ? groupMatch[1] : null;
    if (tweetId && targetGroupId) {
      const msgArr = await createMsgFromTweetId(tweetId);
      if (!msgArr || msgArr.length === 0) return;
      for (const msg of msgArr) {
        yorubot.sendMsg(Number(targetGroupId), undefined, msg);
      }
      yorubot.sendMsg(groupId, userId, `[YoruSystem] Push ${tweetId} to ${targetGroupId} successed.`);
    } else {
      yorubot.sendMsg(groupId, userId, '[YoruSystem] Push failed. Missing parameters.');
    }

    // finish
    this.finished = true;
  }
}
