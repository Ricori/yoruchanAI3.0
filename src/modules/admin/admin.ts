import { GroupMessageData, PrivateMessageData } from '@/types/event';
import yorubot from '@/core/yoruBot';
import { createMsgFromTweetId } from '@/tasks/twitter';
import yoruStorage from '@/core/yoruStorage';
import yoruSchedule from '@/core/yoruSchedule';
import YoruModuleBase from '../base';

export default class AdminModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {
  static NAME = 'AdminModule';

  private taskControlMatch: RegExpMatchArray | null = null;

  private pushTwiiterMatch: RegExpMatchArray | null = null;

  async checkConditions() {
    const adminList = yorubot.config.admin || [];
    const userId = this.data.user_id;
    // Check userId in admin list
    if (adminList.indexOf(userId) === -1) {
      return false;
    }

    // Exec administrator command
    const { message } = this.data;
    // 1. clean memory
    if (message === '/clean-memory') {
      return true;
    }

    // 2. task control - /task twitter|bilibili on|off
    this.taskControlMatch = message.match(/\/task\s+(\w+)\s+(on|off)/);
    if (this.taskControlMatch) {
      return true;
    }

    // 3. push twitter - /push-twitter <groupId> <tweetUrl or tweetId>
    this.pushTwiiterMatch = message.match(/\/push-twitter\s+(\d+).*(?:status\/|\s+)(\d+)/);
    if (this.pushTwiiterMatch) {
      return true;
    }

    return false;
  }

  async run() {
    // Prevent call chain
    this.finished = true;

    const { user_id: userId, message_type: messageType, message } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    // 1. clean memory
    if (message === '/clean-memory') {
      yoruStorage.cleanGroupChatConversations();
      yorubot.sendMsg(groupId, userId, '[YoruSystem] Memory cleaned.');
      return;
    }

    // 2. task control
    if (this.taskControlMatch) {
      const [, task, action] = this.taskControlMatch;
      switch (task) {
        case 'twitter':
          if (action === 'on') {
            yoruSchedule.startById('twitterPush');
            yorubot.sendMsg(groupId, userId, '[YoruSystem] Twitter task enabled.');
          } else {
            yoruSchedule.stopById('twitterPush');
            yorubot.sendMsg(groupId, userId, '[YoruSystem] Twitter task disabled.');
          }
          return;
        case 'bilibili':
          if (action === 'on') {
            yoruSchedule.startById('bilibiliNewShared');
            yorubot.sendMsg(groupId, userId, '[YoruSystem] Bilibili task enabled.');
          } else {
            yoruSchedule.stopById('bilibiliNewShared');
            yorubot.sendMsg(groupId, userId, '[YoruSystem] Bilibili task disabled.');
          }
          return;
        default:
          yorubot.sendMsg(groupId, userId, '[YoruSystem] Unsupported task.');
          return;
      }
    }

    // 3. push twitter
    if (this.pushTwiiterMatch) {
      const [, targetGroupId, tweetId] = this.pushTwiiterMatch;
      const msgArr = await createMsgFromTweetId(tweetId);
      if (!msgArr || msgArr.length === 0) return;
      for (const msg of msgArr) {
        yorubot.sendMsg(Number(targetGroupId), undefined, msg);
      }
      yorubot.sendMsg(groupId, userId, `[YoruSystem] Push ${tweetId} to ${targetGroupId} successed.`);
    }
  }
}
