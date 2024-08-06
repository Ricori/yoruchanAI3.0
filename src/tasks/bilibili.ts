import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { printLog } from '@/utils/print';
import getBiliDynamic from '@/service/bilibili/dynamic';
import { getImgCode } from '@/utils/msgCode';

async function checkBiliDynamic(
  { uid, groupIds, myBiliCookie }: { uid: string, groupIds: number[], myBiliCookie: string }
) {
  try {
    const dyData = await getBiliDynamic(uid, myBiliCookie);
    if (dyData) {
      const newTime = dyData.pubDate;
      const lastestTime = yoruStorage.getBiliLastestDynamicTime(uid);
      if (newTime > lastestTime) {
        yoruStorage.setBiliLastestDynamicTime(uid, newTime);

        if (uid === '629994228' && dyData.description.includes('今日速览')) {
          if (dyData.images[0]) {
            groupIds.forEach((groupId) => {
              yorubot.sendGroupMsg(groupId, getImgCode(dyData.images[0]));
            });
          }
          return;
        }

        const msgTextArr = [] as string[];
        msgTextArr.push(dyData.title);
        msgTextArr.push(dyData.description);

        const images = dyData.images ?? [];
        for (let i = 0; i < images.length; i += 1) {
          msgTextArr.push(getImgCode(images[i]));
          if (i > 1) {
            break;
          }
        }
        if (!dyData.description.includes('视频地址：')) {
          msgTextArr.push(`动态链接：${dyData.dylink}`);
        }
        const msg = msgTextArr.join('\n');

        groupIds.forEach((groupId) => {
          yorubot.sendGroupMsg(groupId, msg);
        });
      }
    }
  } catch (err) {
    printLog(`[biliTask] Error: ${err}`);
  }
}


const task = new AsyncTask('biliTask', async () => {
  const botIsConnect = yorubot.getIsBotConnecting();
  const config = yorubot.config.biliDynamicPush;
  if (!config.enable || !config.cookie) return;
  if (botIsConnect) {
    Object.keys(config.config).forEach((uid: string, i: number) => {
      if (Array.isArray(config.config[uid])) {
        setTimeout(() => checkBiliDynamic({
          uid,
          groupIds: config.config[uid],
          myBiliCookie: config.cookie
        }), i * 2000)
      }
    });
  }
});


const BilibiliNewSharedJob = new SimpleIntervalJob({ seconds: 120 }, task, { id: 'bilibiliNewShared' });

// 启动bot时将动态最新时间设置为现在，防止立即推送
Object.keys(yorubot.config.biliDynamicPush.config).forEach((uid: string) => {
  yoruStorage.setBiliLastestDynamicTime(uid, new Date().getTime());
});


export default BilibiliNewSharedJob;
