import { GroupMessageData, PrivateMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import { sleep } from '@/utils/function';
import { getImgCode } from '@/utils/msgCode';
import Axios from 'axios';
import { printError } from '@/utils/print';


enum HPicLevel {
  /** All ages */
  SAFE = 0,
  /** R18 Only */
  R18 = 1,
  /** All ages and R18 mixed */
  MIX = 2,
}

export default class HPicModule extends YoruModuleBase<PrivateMessageData | GroupMessageData> {
  static NAME = 'HPicModule';

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
    const { whiteGroupIds, enableR18 } = yorubot.config.hPic;

    const hasPermissions = !groupId || whiteGroupIds.length === 0 || whiteGroupIds.includes(groupId);
    if (!hasPermissions) return;

    let level = HPicLevel.SAFE;
    if (enableR18) {
      level = HPicLevel.MIX;
    }

    // Get image Count
    let count = 1;
    const countExec = /([0-9]+)[张份]/.exec(message);
    if (countExec && countExec[1]) {
      count = Number(countExec[1]);
    }
    count = count > 10 ? 10 : count;

    // Get image urls
    const yoruServiceConfig = yorubot.config.yoruService;
    const yoruURL = `${yoruServiceConfig.baseUrl}/hpic/get?apikey=${yoruServiceConfig.apiKey}&level=${level}&count=${count}`;
    const ret = await Axios.get(yoruURL, { timeout: 15000 });

    const imgUrls = ret.data?.list;

    if (ret?.data?.success === false || imgUrls.length === 0) {
      printError('[yoru-service] getHpic API Error.');
      yorubot.sendMsg(groupId, userId, '色图库炸了！');
      return;
    }

    // Send images
    for (const url of imgUrls) {
      const msg = getImgCode(url);
      yorubot.sendMsg(groupId, userId, msg);
      await sleep(4000);
    }
  }
}
