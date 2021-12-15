import YBot from '../../../core/YBot';
import { getImgs } from '../../../utils/function';
import searchImage from '../../../modules/searchImg';

export default function handleSearchImg({
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
  const imgsData = getImgs(message);
  const urls = imgsData.map((item) => item.url);
  if (isGroupMessage) {
    if (!groupId) return;
    searchImage(urls).then((resultMsgs) => {
      resultMsgs.forEach((msg) => {
        ybot.sendGroupMsg(groupId, msg);
      });
    });
  } else {
    searchImage(urls).then((resultMsgs) => {
      resultMsgs.forEach((msg) => {
        ybot.sendPrivateMsg(userId, msg);
      });
    });
  }
}
