import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { printLog } from '../utils/print';
import getBiliDynamic from '../service/biliDynamic';
import { getImgCode } from '../utils/msgCode';

const LIYUU_UID = 4549624;

const task = new AsyncTask('biliTask', async () => {
  const botIsConnect = yorubot.getIsBotConnecting();
  const config = yorubot.config.biliDynamicPush;
  if (botIsConnect) {
    try {
      const dyData = await getBiliDynamic(LIYUU_UID);
      if (dyData) {
        const newTime = dyData.item.pubDate ?? 0;
        const lastestTime = yoruStorage.getBiliLastestDynamicTime(LIYUU_UID);
        if (newTime > lastestTime) {
          const msgTextArr = [] as string[];
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
              yorubot.sendGroupMsg(groupId, msg);
            });
          }
          yoruStorage.setBiliLastestDynamicTime(LIYUU_UID, newTime);
        }
      }
    } catch (err) {
      printLog(`[biliTask] Error: ${err}`);
    }
  }
});


const BilibiliNewSharedJob = new SimpleIntervalJob({ seconds: 30 }, task, { id: 'bilibiliNewShared' });
yoruStorage.setBiliLastestDynamicTime(4549624, new Date().getTime());

export default BilibiliNewSharedJob;
