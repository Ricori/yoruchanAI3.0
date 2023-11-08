import Axios from 'axios';

const API_URI = 'https://api.lolicon.app/setu/?apikey=170792005f99b428151719';
// const MY_PROXY = 'http://pximg.cdn.kvv.me'; // or https://i.pixiv.cat/

export default async function getHPic(hPicLevel: 0 | 1 | 2, count: number) {
  try {
    const res1 = await Axios.get(`${API_URI}&r18=${hPicLevel}&num=${count}`);
    if (res1.data.code !== 0 || res1.data.data?.length < 1) {
      return [];
    }
    const { data } = res1.data;
    const resultUrls = [] as string[];
    for (const item of data) {
      const url = item.url;
      // const imgurl = url.replace('https://i.pximg.net/', MY_PROXY).replace('https://i.pixiv.re/', MY_PROXY);
      resultUrls.push(url);
    }
    return resultUrls;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [Hpic Error]\n${err}`);
    return [];
  }
}
