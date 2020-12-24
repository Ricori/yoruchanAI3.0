import Axios from 'axios';
import MessageCode from '../../core/MessageCode';

/**
 * nhentai搜索
 */
export default async function nhentaiSearch(details: Record<string, any>) {
  const name = details.jp_name;
  let url = "";
  await getSearchResult(name, true).then(ret => {
    url = ret;
  }).catch(e => {
    console.error(new Date().toLocaleString() + " [error] nhentai\n" + e);
  });
  if (url.length === 0) {
    await getSearchResult(name, false).then(ret => {
      url = ret;
    }).catch(e => {
      console.error(new Date().toLocaleString() + " [error] nhentai\n" + e);
    });
  }
  if (url.length > 0) {
    const msg = MessageCode.share(url, `[${details.similarity}%] ${details.jp_name}`, details.origURL, details.thumbnail);
    return {
      success: true,
      msg
    }
  } else {
    console.error(`${new Date().toLocaleString()} [Nhentai Error]API ERROR`);
    return {
      success: false,
      msg: ''
    }
  }
}


/**
 * 取得搜本子结果
 *
 * @param {string} name 本子名
 * @param {boolean} getChinese 是否搜索汉化本
 * @returns Axios对象
 */
function getSearchResult(name: string, getChinese = true) {
  return Axios.get('https://nhentai.net/search/', {
    params: {
      //q: name.replace(/[^ ]*(:|')[^ ]*/g, '') + (getChinese ? " chinese" : "")
      q: `"${name}"${getChinese ? " chinese" : ""}`
    }
  }).then(ret => {
    const html = ret.data;
    if (ret.status == 200 && html) {
      if (html.search(/\/g\/[0-9]+\//) !== -1) {
        const gid = /\/g\/[0-9]+\//.exec(html)?.[0];
        return 'https://nhentai.net' + gid;
      }
    }
    return '';
  });
}
