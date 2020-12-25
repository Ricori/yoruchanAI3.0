import { searchImageText } from '../../customize/replyTextConfig';
import saucenaoSearch from './saucenao';
import nhentaiSearch from './nhentai';
import whatAnimeSearch from './whatAnime';

interface IImgData {
  file: string;
  url: string;
}

export const searchImage = async (imgsData: IImgData[]) => {
  const resultMsgs = [] as string[];
  try {
    for (const imgData of imgsData) {
      const result = await saucenaoSearch(imgData.url);
      if (result.success) {
        if (result.isAnime) {
          const whatAnimeRes = await whatAnimeSearch(imgData.url);
          if (whatAnimeRes.success) {
            resultMsgs.push(whatAnimeRes.msg)
          }
        } else if (result.isBook) {
          const nhentaiRes = await nhentaiSearch(result.details)
          if (nhentaiRes.success) {
            resultMsgs.push(nhentaiRes.msg)
          }
        } else {
          resultMsgs.push(result.msg)
        }
      }
    }
    //console.log(resultMsgs);
    return resultMsgs;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [searchImage Error]\n${err}`);
    return [searchImageText.error];
  }
}