import _ from 'lodash';

/**
 * 转义
 * @param {string} str 欲转义的字符串
 * @param {boolean} [insideCQ=false] 是否在CQ码内
 */
const escape = (str: string, insideCQ = false) => {
  const result = str.replace(/&/g, '&amp;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
  if (!insideCQ) return result;
  return result
    .replace(/,/g, '&#44;')
    .replace(/(\ud83c[\udf00-\udfff])|(\ud83d[\udc00-\ude4f\ude80-\udeff])|[\u2600-\u2B55]/g, ' ');
};

/**
 * 反转义
 * @param {string} str 欲反转义的字符串
 */
const unescape = (str: string) => str.replace(/&#44;/g, ',').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');

const escapeInsideCQ = (str: string) => escape(String(str), true);

class CQCode {
  type: string;

  data: Map<string, any>;

  constructor(type: string, obj: any) {
    this.type = type;
    this.data = new Map();
    if (obj) this.mset(obj);
  }

  set(key: string, value: any) {
    this.data.set(key, value);
    return this;
  }

  mset(obj: any) {
    Object.entries(obj).forEach((kv) => this.set(...kv));
    return this;
  }

  toString() {
    const list = Array.from(this.data.entries())
      .filter(([, v]) => !_.isNil(v))
      .map((kv) => kv.map(escapeInsideCQ).join('='));
    list.unshift(`CQ:${this.type}`);
    return `[${list.join(',')}]`;
  }
}

/**
 * CQ码 图片
 * @param {string} file 本地文件路径或URL
 * @param {string} type 类型
 */
const img = (file: string, type = null) => new CQCode('image', { file, type }).toString();

/**
 * CQ码 Base64 图片
 * @param {string} base64 图片 Base64
 */
const img64 = (base64: string, type = null) => new CQCode('image', { file: `base64://${base64}`, type }).toString();

/**
 * CQ码 视频
 * @param {string} file 本地文件路径或URL
 * @param {string} cover 本地文件路径或URL
 */
const video = (file: string, cover: string) => new CQCode('video', { file, cover }).toString();

/**
 * CQ码 分享链接
 * @param {string} url 链接
 * @param {string} title 标题
 * @param {string} content 内容
 * @param {string} image 图片URL
 */
const share = (url: string, title: string, content: string, image: string) => new CQCode('share', {
  url, title, content, image,
}).toString();

/**
 * CQ码 @
 * @param {number} qq
 */
const at = (qq: string) => new CQCode('at', { qq }).toString();

/**
* CQ码 大图片
* @param {string} base64 图片 Base64
 */
const bigImg = (file: string, isBase64 = false) => new CQCode('cardimage', {
  maxwidth: 800, maxheight: 1600, source: '夜夜酱', file: isBase64 ? `base64://${file}` : file,
}).toString();

export default {
  escape,
  img,
  bigImg,
  video,
  share,
  at,
};
