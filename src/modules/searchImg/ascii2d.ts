import Axios from 'axios';
import Cheerio from 'cheerio';
import { getImgCode } from '../../utils/msgCode';
import { printError } from '../../utils/print';

/**
 * ascii2d搜索
 *
 * @param {string} imgURL 图片地址
 */
export default async function ascii2dSearch(imgURL: string) {
  const res = await getAscii2dResult(imgURL);
  if (res === null) {
    return {
      success: false,
      msg: '',
    };
  }

  const msgArr = [`相似度较低，结果仅供参考`];
  if (res.title) {
    msgArr.push(res.title);
  }
  if (res.thumbnail && res.thumbnail.length > 0) {
    msgArr.push(getImgCode(res.thumbnail));
  }
  msgArr.push(res.imageUrl || '');
  if (res.authorUrl) {
    msgArr.push(`作者主页: ${res.authorUrl}`);
  }
  const msg = msgArr.join('\n');

  return {
    success: true,
    msg,
    isAnime: false,
    isBook: false,
  };
}


/**
 * 获取ascii2d搜索结果
 */
async function getAscii2dResult(url: string) {
  const axiosConfig = {
    responseType: 'text' as 'text',
    timeout: 8000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0.4896.127 Safari/537.36',
    }
  };
  const ret = await Axios.get(`https://ascii2d.net/search/url/${encodeURIComponent(url)}`, axiosConfig).catch((error) => {
    printError(`[Ascii2d Error] Fetch Error: ${error.message}`);
    return null;
  })
  const responseUrl = ret?.request?.res?.responseUrl
  if (responseUrl) {
    // 进行特征搜索
    const bovwURL = responseUrl.replace('/color/', '/bovw/');
    const ret2 = await Axios.get(bovwURL, axiosConfig).catch((error) => {
      printError(`[Ascii2d Error] Fetch Error: ${error.message}`);
      return null;
    })
    return getDetail(ret2?.data || '');
  } else {
    return null;
  }
}

function getDetail(html: string) {
  const $ = Cheerio.load(html, { decodeEntities: false });
  const $box = $($('.item-box')[1]);
  const thumbnail = 'https://ascii2d.net' + $box.find('.image-box img').attr('src');
  const $link = $box.find('.detail-box a');
  const $title = $($link[0]);
  const $author = $($link[1]);
  return {
    imageUrl: $title.attr('href'),
    title: $title.html() !== null ? (
      $author ? `「${$title.html()}」/「${$author.html()}」` : $title.html()
    ) : $box.find('.detail-box .external').html(),
    thumbnail,
    authorUrl: $author.attr('href'),
  }
}