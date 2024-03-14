import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { printLog } from '@/utils/print';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { getImgCode } from '@/utils/msgCode';

async function checkBiliDynamic(uid: string, groupIds: number[]) {
  try {
    const dyData = await getBiliDynamic(uid);
    if (dyData) {
      const newTime = dyData.item.pubDate ?? 0;
      const lastestTime = yoruStorage.getBiliLastestDynamicTime(uid);
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

        groupIds.forEach((groupId) => {
          yorubot.sendGroupMsg(groupId, msg);
        });

        yoruStorage.setBiliLastestDynamicTime(uid, newTime);
      }
    }
  } catch (err) {
    printLog(`[biliTask] Error: ${err}`);
  }
}


const task = new AsyncTask('biliTask', async () => {
  const botIsConnect = yorubot.getIsBotConnecting();
  const config = yorubot.config.biliDynamicPush;
  if (botIsConnect) {
    Object.keys(config.config).forEach((uid: string) => {
      if (Array.isArray(config.config[uid])) {
        const groupIds = config.config[uid];
        checkBiliDynamic(uid, groupIds);
      }
    });
  }
});


const BilibiliNewSharedJob = new SimpleIntervalJob({ seconds: 30 }, task, { id: 'bilibiliNewShared' });

// 启动bot时将动态最新时间设置为现在，防止立即推送
Object.keys(yorubot.config.biliDynamicPush.config).forEach((uid: string) => {
  yoruStorage.setBiliLastestDynamicTime(uid, new Date().getTime());
});


export default BilibiliNewSharedJob;
