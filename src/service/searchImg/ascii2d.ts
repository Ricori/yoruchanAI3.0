import Axios from 'axios';
import Cheerio from 'cheerio';
import FormData from 'form-data';
import { getImgCode } from '@/utils/msgCode';
import { printError } from '@/utils/print';

const UA = 'Mozilla / 5.0(Windows NT 10.0; Win64; x64) AppleWebKit / 537.36(KHTML, like Gecko) Chrome / 113.0.0.0 Safari / 537.36';

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

  const msgArr = ['以下为追加搜索结果，仅供参考'];
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
    },
  };
  const imgBuffer = await Axios.get(url, { responseType: 'arraybuffer' }).then((r) => r.data).catch((error) => {
    printError(`[Ascii2d Error] Fetch IMG Error: ${error.message}`);
    return null;
  });
  const form = new FormData();
  form.append('file', imgBuffer, 'image');
  const ret = await Axios.post('https://ascii2d.net/search/file', form, {
    headers:
    {
      ...form.getHeaders(),
      Origin: 'https://ascii2d.net',
      Referer: 'https://ascii2d.net/',
      'User-Agent': UA,
    },
  }).catch((error) => {
    printError(`[Ascii2d Error] Upload File Error: ${error.message}`);
    return null;
  });
  const responseUrl = ret?.request?.res?.responseUrl;
  if (responseUrl) {
    // 进行特征搜索
    const bovwURL = responseUrl.replace('/color/', '/bovw/');
    const ret2 = await Axios.get(bovwURL, axiosConfig).catch((error) => {
      printError(`[Ascii2d Error] Fetch Error: ${error.message}`);
      return null;
    });
    return getDetail(ret2?.data || '');
  }
  return null;
}

function getDetail(html: string) {
  const $ = Cheerio.load(html, { decodeEntities: false });
  const $box = $($('.item-box')[1]);
  const thumbnail = `https://ascii2d.net${$box.find('.image-box img').attr('src')}`;
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
  };
}
