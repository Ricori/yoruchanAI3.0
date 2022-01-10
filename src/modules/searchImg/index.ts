import { searchImageText } from '../../customize/replyTextConfig';
import saucenaoSearch from './saucenao';
import nhentaiSearch from './nhentai';
import whatAnimeSearch from './whatAnime';

const searchImage = async (imgUrls: string[]) => {
  const resultMsgs = [] as string[];
  try {
    for (const imgUrl of imgUrls) {
      const result = await saucenaoSearch(imgUrl);
      if (result.success) {
        // 进行进一步的细分渠道搜索
        if (result.isAnime) {
          const whatAnimeRes = await whatAnimeSearch(imgUrl);
          if (whatAnimeRes.msg && whatAnimeRes.msg.length > 0) {
            resultMsgs.push(whatAnimeRes.msg);
            if (whatAnimeRes.extraMsg) {
              resultMsgs.push(whatAnimeRes.extraMsg);
            }
          }
        } else if (result.msg && result.msg.length > 0) {
          resultMsgs.push(result.msg);
        }
        /** *
        if (result.isBook) {
          const nhentaiRes = await nhentaiSearch(result.details);
          if (nhentaiRes.msg && nhentaiRes.msg.length > 0) {
            resultMsgs.push(nhentaiRes.msg)
          }
        }
        ** */
      }
    }
    if (resultMsgs.length > 0) {
      return resultMsgs;
    }
    return [searchImageText.error];
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [searchImage Error]\n${err}`);
    return [searchImageText.error];
  }
};

export default searchImage;
