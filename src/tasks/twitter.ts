import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import yorubot from '@/core/yoruBot';
import yoruStorage from '@/core/yoruStorage';
import { printLog } from '@/utils/print';
import { getImgCode, getVideoCode } from '@/utils/msgCode';
import { getLatestTweet, getTweetPost } from '@/service/twitter/tweet';
import { createScreenshot } from '@/service/twitter/screenshot';
export async function createMsgFromTweetId(tweetId: string) {
  // 获取详细信息
  const tweetData = await getTweetPost(tweetId);
  if (!tweetData) return;
  // 生成推文图片
  const dataUrl = await createScreenshot(tweetData);
  if (!dataUrl) return;

  const msgTextArr = [] as string[];
  msgTextArr.push(getImgCode(dataUrl));
  const images = tweetData.imgUrls ?? [];
  for (let i = 0; i < images.length; i += 1) {
    msgTextArr.push(getImgCode(images[i]));
    if (i > 1) {
      break;
    }
  }
  const videos = tweetData.videoUrls ?? [];
  for (let i = 0; i < videos.length; i += 1) {
    msgTextArr.push(getVideoCode(videos[i]));
    if (i > 1) {
      break;
    }
  }

  msgTextArr.push(`推文链接：${tweetData.link}`);
  const msg = msgTextArr.join('\n');
  return msg;
}

async function checkLastestTweet(
  { username, groupIds, yoruAPIKey }: { username: string, groupIds: number[], yoruAPIKey: string }
) {
  try {
    const latestTweet = await getLatestTweet(username, yoruAPIKey);
    if (!latestTweet || !latestTweet.time) return;
    const preTime = yoruStorage.getTwitterLastestTweetTime(username);
    const newTime = latestTweet.time;

    // 有新推特
    if (newTime > preTime) {
      // 设置最新推特时间
      yoruStorage.setTwitterLastestTweetTime(username, newTime);

      const msg = await createMsgFromTweetId(latestTweet.tweetId)
      if (!msg) return;

      groupIds.forEach((groupId) => {
        yorubot.sendGroupMsg(groupId, msg);
      });
    }

  } catch (err) {
    printLog(`[twiiterTask] Error: ${err}`);
  }
}


const task = new AsyncTask('twitterTask', async () => {
  const botIsConnect = yorubot.getIsBotConnecting();
  const config = yorubot.config.tweetPush;
  if (!config.enable || !config.yoruAPIKey) return;
  if (botIsConnect) {
    Object.keys(config.config).forEach((username: string, i: number) => {
      if (Array.isArray(config.config[username])) {
        setTimeout(() => checkLastestTweet({
          username,
          groupIds: config.config[username],
          yoruAPIKey: config.yoruAPIKey
        }), i * 10000)
      }
    });
  }
});


const TwitterPushJob = new SimpleIntervalJob({ seconds: 240 }, task, { id: 'twitterPush' });

// 启动bot时将用户推文最新时间设置为现在，防止立即推送
Object.keys(yorubot.config.tweetPush.config).forEach((username: string) => {
  yoruStorage.setTwitterLastestTweetTime(username, new Date().getTime());
});


export default TwitterPushJob;
