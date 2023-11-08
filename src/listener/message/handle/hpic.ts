import yorubot from '@/core/yoruBot';
import { hasText } from '@/utils/function';
import getHPic from '@/modules/hPic';

enum HPicLevel {
  /** All ages */
  SAFE = 0,
  /** All ages and R18 mixed */
  MIX = 1,
  /** R18 Only */
  R18 = 2,
}

export default function handleHpic({
  message,
  userId,
  isGroupMessage,
  groupId,
}: {
  message: string,
  userId: number,
  isGroupMessage: boolean,
  groupId?: number
}) {
  if (!groupId) return;

  if (isGroupMessage) {
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

    // Get Reply Text
    getHPic({ hPicLevel, bigMode, count }).then((resultMsgs) => {
      let i = 0;
      resultMsgs.forEach((msg) => {
        // Delay to prevent QQ limit
        setTimeout(() => {
          yorubot.sendGroupMsg(groupId, msg);
        }, i * 1500);
        i += 1;
      });
    });
  } else {
    yorubot.sendPrivateMsg(userId, '因腾讯限制，私聊图片发送失败概率高，请在群中使用此功能');
  }
}
