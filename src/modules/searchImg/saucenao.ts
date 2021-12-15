import Axios from 'axios';
import MessageCode from '../../core/MessageCode';

/**
 * saucenao搜索
 *
 * @param {string} imgURL 图片地址
 */
export default async function saucenaoSearch(imgURL: string) {
  // API请求与处理
  let res;
  try {
    const ret = (await saucenaoFetch(imgURL)).data;
    if (ret.results && ret.results.length > 0) {
      res = ret.results[0] || {};
    } else {
      console.error(`${new Date().toLocaleString()} [Saucenao Error]API Error`);
      console.log(ret);
      return {
        success: false,
        msg: '',
      };
    }
  } catch (error) {
    console.error(`${new Date().toLocaleString()} [Saucenao Error]Fetch Error`);
    return {
      success: false,
      msg: '',
    };
  }

  // 解析对象结构
  const {
    header: {
      similarity,
      thumbnail,
    } = {},
    data: {
      ext_urls: extUrls = [],
      title,
      pixiv_id: pixivId,
      member_name,
      member_id,
      author_name,
      jp_name,
    } = {},
  } = res;

  let isAnime = false; let
    isBook = false;
  let url = extUrls[0] || '';

  // url处理
  if (pixivId) {
    url = `https://pixiv.net/i/${pixivId}`;
  } else {
    // 如果url有多个，优先取danbooru的
    if (extUrls.length > 0) {
      for (const u of extUrls) {
        if (u.indexOf('danbooru') !== -1) {
          url = u;
          break;
        }
      }
    }
    const pidRegExpRes = /pixiv.+illust_id=([0-9]+)/.exec(url);
    if (pidRegExpRes) {
      url = `https://pixiv.net/i/${pidRegExpRes[1]}`;
    }
    url = url.replace('http://', 'https://');
  }

  const origURL = url.replace('https://', '');
  // 结果类型判断
  isAnime = origURL.indexOf('anidb.net') !== -1;
  if (jp_name && jp_name.length > 0) {
    isBook = true;
  }

  // 标题处理
  let displayTitle = '';
  if (!title) {
    displayTitle = isAnime ? '[AniDB]' : '[YoruDB]';
  }
  if (member_name || author_name) {
    displayTitle = `「${title}」/「${member_name || author_name}」`;
  }

  // 生成消息文本
  const msgArr = [`${displayTitle}\n相似度达到了${similarity}%`];
  if (thumbnail) {
    msgArr.push(MessageCode.img(thumbnail));
  }
  msgArr.push(url);
  if (member_id) {
    msgArr.push(`作者PIXIV ID: ${member_id}`);
  }
  const msg = msgArr.join('\n');

  return {
    success: true,
    msg,
    isAnime,
    isBook,
    details: {
      similarity,
      jp_name,
      origURL,
      thumbnail,
    },
  };
}

enum SnDBEnum {
  ALL = 999,
  PIXIV = 5,
  DANBOORU = 9,
  BOOK = 18,
  ANIME = 21,
}

interface ISaucenaoResult {
  header: any,
  results: {
    header: {
      similarity: string,
      thumbnail: string,
      index_name: string
    },
    data: {
      ext_urls: string[],
      title: string,
      pixiv_id: number,
      member_name: string,
      member_id?: string,
      author_name: string,
      jp_name: string
    }
  }[]
}

/**
 * saucenao请求
 */
function saucenaoFetch(imgURL: string) {
  return Axios.get<ISaucenaoResult>('https://saucenao.com/search.php', {
    params: {
      api_key: '16abeee27bd15d00da11a60c92e7429321b8284e',
      db: SnDBEnum.ALL, // 搜索的DB
      output_type: 2, // API返回方式，2=JSON
      numres: 3, // 结果数量
      url: imgURL,
    },
  });
}
