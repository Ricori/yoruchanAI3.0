import { searchImageText } from '../../customize/replyTextConfig';
import saucenaoSearch from './saucenao';
// import nhentaiSearch from './nhentai';
import whatAnimeSearch from './whatAnime';
import ascii2dSearch from './ascii2d';

const searchImage = async (imgUrls: string[]) => {
  const resultMsgs = [] as string[];
  try {
    for (const imgUrl of imgUrls) {
      let saucenaoSuccess = false;
      let ascii2dSuccess = false;

      const result = await saucenaoSearch(imgUrl);
      let result2;
      saucenaoSuccess = result.success;
      if (saucenaoSuccess) {
        const similarity = +(result.similarity ?? 0);
        if (similarity < 60) {
          // 相似度过低，追加ascii2d搜索
          result2 = await ascii2dSearch(imgUrl);
          ascii2dSuccess = result2.success;
        }
      } else {
        // saucenao失败时追加ascii2d搜索
        result2 = await ascii2dSearch(imgUrl);
        ascii2dSuccess = result2.success;
      }

      // saucenao一级渠道搜索成功时，进行进一步的细分渠道搜索
      if (saucenaoSuccess && !ascii2dSuccess) {
        if (result.isAnime) {
          // 是动画，只返回动画相关搜索文本
          const whatAnimeRes = await whatAnimeSearch(imgUrl);
          if (whatAnimeRes.success && whatAnimeRes.msg.length > 0) {
            resultMsgs.push(whatAnimeRes.msg);
            if (whatAnimeRes.extraMsg) {
              resultMsgs.push(whatAnimeRes.extraMsg);
            }
          }
        } else if (result.msg.length > 0) {
          resultMsgs.push(result.msg);
        }

        /* else if (result.isBook) {
          // 是动画，返回本子搜索文本，兜底为saucenao
          const nhentaiRes = await nhentaiSearch(result.details.jp_name || '');
          if (nhentaiRes.success && nhentaiRes.msg.length > 0) {
            resultMsgs.push(nhentaiRes.msg)
          } else if (result.msg.length > 0) {
            resultMsgs.push(result.msg);
          }
        }
        */

      }

      // ascii2d搜索成功时，直接返回结果
      if (ascii2dSuccess && result2?.msg && result2.msg.length > 0) {
        resultMsgs.push(result2.msg);
      }

      console.log(result, result2, saucenaoSuccess, ascii2dSuccess);

    }

    // 返回msg数组
    if (resultMsgs.length > 0) {
      return resultMsgs;
    }
    // 为空时返回兜底文案
    return [searchImageText.error];
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [searchImage Error]\n${err}`);
    return [searchImageText.error];
  }
};

export default searchImage;
