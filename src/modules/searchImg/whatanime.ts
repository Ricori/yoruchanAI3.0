import _ from 'lodash';
import Axios from 'axios';
import { searchImageText } from '../../customize/replyTextConfig';
import MessageCode from '../../core/MessageCode';

/**
 * whatanime搜索
 */
export default async function whatAnimeSearch(imgURL: string) {
  const ret = await getSearchResult(imgURL);
  if (ret.code !== 200 || !ret.data.result) {
    return {
      success: false,
      msg: ''
    }
  }
  if (ret.data.result.length === 0) {
    return {
      success: false,
      msg: searchImageText.whatAnimeLimit
    }
  }

  //提取信息
  const res = ret.data.result[0]; //相似度最高的结果
  const similarity = (res.similarity * 100).toFixed(2); // 相似度
  const {
    anilist,    // 番剧 ID
    episode = '-',  // 集数
    from,     // 时间点
    video,    // 预览视频
    image,    // 预览图片
  } = res;
  const time = (() => {
    const s = Math.floor(from);
    const m = Math.floor(s / 60);
    const ms = [m, s % 60];
    return ms.map(num => String(num).padStart(2, '0')).join(':');
  })();

  const info = await getAnimeInfo(anilist);
  if (!info) {
    return {
      success: false,
      msg: ''
    }
  }
  //构造返回信息
  let msg = MessageCode.escape(`相似度达到了${similarity}% \n出自第${episode}集的${time}`);
  let extraMsg;
  const appendMsg = (str: string, needEsc = true) => {
    if (typeof (str) == "string" && str.length > 0) {
      msg += "\n" + (needEsc ? MessageCode.escape(str) : str);
    }
  }
  const dateObjToString = ({ year, month, day }: { year: string, month: string, day: string }) => [year, month, day].join('-');
  appendMsg(MessageCode.img(info.coverImage.large), false);
  const titles = _.uniq(['romaji', 'native', 'chinese'].map(k => info.title[k]).filter(v => v));
  appendMsg(titles.join('\n'));
  appendMsg(`类型：${info.type}-${info.format}`);
  appendMsg(`开播：${dateObjToString(info.startDate)}`);
  if (info.endDate.year > 0) appendMsg(`完结：${dateObjToString(info.endDate)}`);
  if (info.isAdult){
    appendMsg(searchImageText.r18warn);
  }else{
    extraMsg = MessageCode.video(`${video}&size=l`, `${image}&size=l`);
  }

  return {
    success: true,
    msg,
    extraMsg
  };
}


/**
 * 取得搜番结果
 */
async function getSearchResult(imgURL: string) {
  const res = {
    code: 0,
    data: null as any,
  };
  await Axios.get("https://api.trace.moe/search", {
    params: {
      url: imgURL
    }
  }).then(ret => {
    res.data = ret.data;
    res.code = ret.status;
  }).catch(e => {
    console.error(`${new Date().toLocaleString()} [WhatAnime Error]API Error`);
    if (e.response) {
      res.code = e.response.status;
      res.data = e.response.data;
    }
  });
  return res;
}


const animeInfoQuery = `
query ($id: Int) {
  Media (id: $id, type: ANIME) {
    id
    type
    format
    isAdult
    title {
      native
      romaji
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    coverImage {
      large
    }
  }
}`;

/**
 * 取得番剧信息
 * 
 * @param {number} anilistID
 */
async function getAnimeInfo(anilistID: number) {
  let data = null;
  const ret = await Axios.post('https://trace.moe/anilist/' + anilistID, {
    query: animeInfoQuery,
    variables: { id: anilistID },
  }).catch(e => {
    console.error(`${new Date().toLocaleString()} [WhatAnime Error]API2 Error: ${e.response.statusText}`);
  });
  if (ret) {
    data = ret.data?.data?.Media;
  }
  return data;
}