import { GroupMessageData, PrivateMessageData } from "@/types/event";
import YoruModuleBase from "@/modules/base";
import yorubot from '@/core/yoruBot';
import { hasText, sleep } from '@/utils/function';
import getHPic from "@/service/hpic/hPic";
import { getBigImgCode, getImgCode } from "@/utils/msgCode";

enum HPicLevel {
  /** All ages */
  SAFE = 0,
  /** R18 Only */
  R18 = 1,
  /** All ages and R18 mixed */
  MIX = 2,
}

export default class HPicModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {

  static NAME = 'HPicModuleModule';

  async checkConditions() {
    if (!yorubot.config.hPic.enable) return false;
    const { message } = this.data;
    const exec = /((要|发|份|点|张)大?(色|h|瑟|涩)图)/.exec(message);
    if (exec !== null) {
      return true;
    }
    return false;
  }

  async run() {
    const { message, user_id: userId, message_type: messageType } = this.data;
    const groupId = messageType === 'group' ? this.data.group_id : undefined;

    // Only in group can send hpic
    if (groupId) {
      const { whiteGroupOnly, whiteGroupIds, whiteGroupCustomLimit } = yorubot.config.hPic;
      const inWhiteList = whiteGroupIds.includes(groupId);

      // Check permissions
      if (whiteGroupOnly && !inWhiteList) {
        // This group has no permissions
        return;
      }

      // Get the final Hpic level
      let hPicLevel = 0 as HPicLevel;
      if (inWhiteList && Object.values(HPicLevel).includes(whiteGroupCustomLimit)) {
        hPicLevel = whiteGroupCustomLimit;
      }

      // Does the image need to appear larger
      const bigMode = !!hasText(message, '大');

      // Get image Count
      let count = 1;
      const countExec = /([0-9]+)[张份]/.exec(message);
      if (countExec && countExec[1]) {
        count = Number(countExec[1]);
      }
      count = count > 10 ? 10 : count;

      // Get image urls
      const resultImgUrls = await getHPic(hPicLevel, count);
      if (resultImgUrls.length === 0) {
        yorubot.sendGroupMsg(groupId, '色图库被烧，没法取色图啦，可以联系我的主人解决哦');
      } else {
        // Send images
        for (const url of resultImgUrls) {
          const msg = bigMode ? getBigImgCode(url) : getImgCode(url);
          yorubot.sendGroupMsg(groupId, msg);
          await sleep(4000);
        }
      }
    } else {
      yorubot.sendPrivateMsg(userId, '因腾讯限制，私聊图片发送失败概率高，请在群聊中使用此功能');
    }

    // finish
    this.finished = true;
  }
}