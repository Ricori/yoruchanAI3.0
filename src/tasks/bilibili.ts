import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import YBot from '../core/YBot';
import YData from '../core/YData';
import { printLog } from '../utils/print';
import getBiliDynamic from '../service/biliDynamic';
import { getImgCode } from '../utils/msgCode';
import { yoruConfig } from '../../config';

const LIYUU_UID = 4549624;

const task = new AsyncTask('biliTask', async () => {
  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();
  const botIsConnect = ybot.getBotIsConnect();
  const config = yoruConfig.biliDynamicPush;
  if (botIsConnect) {
    try {
      const dyData = await getBiliDynamic(LIYUU_UID);
      if (dyData) {
        const newTime = dyData.item.pubDate ?? 0;
        const lastestTime = ydata.getBiliLastestDynamicTime(LIYUU_UID);
        if (newTime > lastestTime) {
          const msgTextArr = [];
          if (dyData.title) {
            msgTextArr.push(dyData.title);
          }
          let { description } = dyData.item;
          if (description) {
            if (description.length > 100) {
              description = `${description.substring(0, 150)}...`;
            }
            msgTextArr.push(description);
          }
          const images = dyData.item.images ?? [];
          for (let i = 0; i < images.length; i += 1) {
            msgTextArr.push(getImgCode(images[i]));
            if (i > 1) {
              break;
            }
          }
          msgTextArr.push(`动态链接：${dyData.item.link ?? ''}`);
          const msg = msgTextArr.join('\n');
          if (Array.isArray(config.group)) {
            config.group.forEach((groupId) => {
              ybot.sendGroupMsg(groupId, msg);
            });
          }
          ydata.setBiliLastestDynamicTime(LIYUU_UID, newTime);
        }
      }
    } catch (err) {
      printLog(`[biliTask] Error: ${err}`);
    }
  }
});


const BilibiliNewSharedJob = new SimpleIntervalJob({ seconds: 30 }, task, 'bilibiliNewShared');

export default BilibiliNewSharedJob;
