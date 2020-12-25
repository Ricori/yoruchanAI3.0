import Axios from 'axios';
import { searchImageText } from '../../customize/replyTextConfig';
import MessageCode from '../../core/MessageCode';

const waURL = "https://trace.moe";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36";

/**
 * whatanime搜索
 */
export default async function whatAnimeSearch(imgURL: string) {
  const ret = await getSearchResult(imgURL);
  if (ret.code === 413) {
    return {
      success: false,
      msg: searchImageText.whatAnimeToLarge
    }
  } else if (ret.code !== 200) {
    return {
      success: false,
      msg: ''
    }
  }
  const retData = ret.data as any;
  if (retData.docs.length === 0) {
    return {
      success: false,
      msg: searchImageText.whatAnimeLimit
    }
  }

  /*
   let quota = retData.quota; //剩余搜索次数
   let expire = retData.expire; //次数重置时间  
   if (quota <= 5) {}
  */

  //提取信息
  const doc = retData.docs[0]; //相似度最高的结果
  const similarity = (doc.similarity * 100).toFixed(2); // 相似度
  const jpName = doc.title_native || ""; //日文名
  const romaName = doc.title_romaji || ""; //罗马音
  const cnName = doc.title_chinese || ""; //中文名
  let posSec = Math.floor(doc.at); // 位置：秒
  const posMin = Math.floor(posSec / 60); // 位置：分
  posSec %= 60;
  const isR18 = doc.is_adult; //是否R18
  const anilistID = doc.anilist_id; //动漫ID
  const episode = doc.episode || "-"; //集数

  let type: any, start: any, end: any, img: any, synonyms: any;
  const info = await getAnimeInfo(anilistID);
  if (!info) {
    return {
      success: false,
      msg: ''
    }
  }
  type = info.type + " - " + info.format; //类型
  let sd = info.startDate;
  start = sd.year + "-" + sd.month + "-" + sd.day; //开始日期
  let ed = info.endDate;
  end = (ed.year > 0) ? (ed.year + "-" + ed.month + "-" + ed.day) : "";
  img = MessageCode.img(info.coverImage.large); //番剧封面图
  synonyms = info.synonyms_chinese || []; //别名

  //构造返回信息
  let msg = MessageCode.escape(`相似度达到了${similarity}% \n出自第${episode}集的${posMin < 10 ? "0" : ""}${posMin}:${posSec < 10 ? "0" : ""}${posSec}`);
  const appendMsg = (str: string, needEsc = true) => {
    if (typeof (str) == "string" && str.length > 0) {
      msg += "\n" + (needEsc ? MessageCode.escape(str) : str);
    }
  }

  appendMsg(img, false);
  appendMsg(romaName);
  if (jpName != romaName) appendMsg(jpName);
  if (cnName != romaName && cnName != jpName) appendMsg(cnName);
  if (synonyms.length > 0 && !(synonyms.length >= 2 && synonyms[0] == '[' && synonyms[1] == ']')) {
    let syn = `别名：“${synonyms[0]}”`;
    for (let i = 1; i < synonyms.length; i++)
      syn += `、“${synonyms[i]}”`;
    appendMsg(syn);
  }
  appendMsg(`类型：${type}`);
  appendMsg(`开播：${start}`);
  if (end.length > 0) appendMsg(`完结：${end}`);
  if (isR18) appendMsg(searchImageText.r18warn);

  return {
    success: true,
    msg
  };
}


/**
 * 取得搜番结果
 *
 * @param {string} imgURL 图片地址
 * @param {string} cookie Cookie
 */
async function getSearchResult(imgURL: string) {
  const res = {
    code: 0,
    data: null
  };
  const ret = await Axios.get(imgURL, {
    responseType: 'arraybuffer' //为了转成base64
  })
  if (!ret.data) {
    res.code = 111;
    return res;
  }
  await Axios.post(waURL + "/api/search", {
    image: Buffer.from(ret.data, 'binary').toString('base64')
  }).then(ret => {
    res.data = ret.data;
    res.code = ret.status;
  }).catch(e => {
    if (e.response) {
      res.code = e.response.status;
      res.data = e.response.data;
    }
  });
  return res;
}

/**
 * 取得番剧信息
 * 
 * @param {number} anilistID
 */
async function getAnimeInfo(anilistID: number) {
  const ret = await Axios.get(waURL + "/info?anilist_id=" + anilistID, {
    headers: {
      "user-agent": UA,
    }
  })
  return ret.data?.[0];
}