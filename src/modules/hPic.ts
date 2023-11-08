import Axios from 'axios';

import { getImgCode, getBigImgCode } from '../utils/msgCode';

const API_URI = 'https://api.lolicon.app/setu/?apikey=170792005f99b428151719';
const MY_PROXY = 'https://i.pixiv.cat'; // or http://pximg.cdn.kvv.me

export default async function getHPic(
  {
    hPicLevel,
    bigMode,
    count,
  }: {
    hPicLevel: 0 | 1 | 2,
    bigMode: boolean,
    count: number
  },
) {
  const resultMsgs = [] as string[];

  try {
    const res1 = await Axios.get(`${API_URI}&r18=${hPicLevel}&num=${count}`);
    if (res1.data.code !== 0 || res1.data.data?.length < 1) {
      resultMsgs.push('色图库被烧，没法取色图啦，可以联系我的主人解决哦');
      return resultMsgs;
    }
    const { data } = res1.data;
    for (const item of data) {
      const imgurl = item.url.replace('https://i.pximg.net', MY_PROXY).replace('https://i.pixiv.re/', MY_PROXY);
      let resultMsg;
      if (bigMode) {
        resultMsg = getBigImgCode(imgurl);
      } else {
        resultMsg = getImgCode(imgurl);
      }
      resultMsgs.push(resultMsg);
    }
    return resultMsgs;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [Hpic Error]\n${err}`);
    return ['色图库被烧，没法取色图啦，可以联系我的主人解决哦'];
  }
}
