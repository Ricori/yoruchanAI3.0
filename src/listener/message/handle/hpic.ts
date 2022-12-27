import YBot from '../../../core/yBot';
import { yoruConfig } from '../../../../config';
import { hasText } from '../../../utils/function';
import getHPic from '../../../modules/hPic';
import { hPicReplyText } from '../../../customize/replyTextConfig';

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
  const ybot = YBot.getInstance();
  const bigMode = !!hasText(message, '大');
  let count = 1;
  const countExec = /([0-9]+)[张份]/.exec(message);
  if (countExec && countExec[1]) {
    count = Number(countExec[1]);
  }
  if (isGroupMessage) {
    if (!groupId) return;
    let limitLevel = 0 as 0 | 1 | 2; // 0=全年龄, 1=混合, 2=r18Only
    const { whiteOnly, whiteGroup, whiteGroupLimit } = yoruConfig.hPic;
    const inWhiteList = whiteGroup.includes(groupId);
    if (whiteOnly && !inWhiteList) {
      // 该群无色图权限
      ybot.sendGroupMsg(groupId, hPicReplyText.noAuth, userId);
    }
    if (inWhiteList && [0, 1, 2].includes(whiteGroupLimit)) {
      limitLevel = whiteGroupLimit as 0 | 1 | 2;
    }
    const limitCount = inWhiteList ? 20 : 9;
    if (count > limitCount) {
      count = limitCount;
    }
    getHPic(limitLevel, bigMode, count, false, true).then((resultMsgs) => {
      const delay = inWhiteList ? 1200 : 4000;
      let i = 0;
      resultMsgs.forEach((msg) => {
        setTimeout(() => {
          ybot.sendGroupMsg(groupId, msg);
        }, i * delay);
        i += 1;
      });
    });
  } else {
    ybot.sendPrivateMsg(userId, '因腾讯限制，私聊上传图片失败概率高，请在群中使用此功能');
  }
}
