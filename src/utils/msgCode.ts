import _ from 'lodash';

/**
 * 转义
 * @param {string} str 欲转义的字符串
 * @param {boolean} [insideCQ=false] 字符串是否放在CQ码内
 */
export const escape = (str: string, insideCQ = false) => {
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

class CQCode {
  type: string;

  data: Map<string, any>;

  constructor(type: string, obj: any) {
    this.type = type;
    this.data = new Map();
    if (obj) this.mset(obj);
  }

  set(key: string, value: any) {
    if (value) {
      this.data.set(key, value);
    }
    return this;
  }

  mset(obj: any) {
    Object.entries(obj).forEach((kv) => this.set(...kv));
    return this;
  }

  toString() {
    const list = Array.from(this.data.entries())
      .filter(([, v]) => !_.isNil(v))
      .map((kv) => kv.map((str: string) => escape(String(str), true)).join('='));
    list.unshift(`CQ:${this.type}`);
    return `[${list.join(',')}]`;
  }
}

// https://docs.go-cqhttp.org/cqcode
type CQType =
  'face' | 'record' | 'video' | 'at' | 'shake' |
  'share' | 'music' | 'image' | 'reply' | 'redbag' |
  'poke' | 'forward' | 'node' | 'xml' | 'json' |
  'cardimage' | 'tts';

/**
 * CQ码文本转换
 * @param {string} type
 * @param {object} params 参数,参照 https://docs.go-cqhttp.org/cqcode
 */
export default function getMessageCode(type: CQType, params: Record<string, any>) {
  return new CQCode(type, params).toString();
}

export function getAtCode(qq: string) {
  return getMessageCode('at', { qq });
}

export function getReplyCode(msgId: number | string) {
  return getMessageCode('reply', { id: `${msgId}` });
}

export function getImgCode(file: string, type?: 'flash' | 'show') {
  if (type) {
    return getMessageCode('image', { file, type });
  }
  return getMessageCode('image', { file });
}

export function getBigImgCode(file: string, isBase64 = false) {
  return getMessageCode('cardimage', {
    file: isBase64 ? `base64://${file}` : file,
    maxwidth: 800,
    maxheight: 1600,
    source: '夜夜酱',
  });
}

export function getVideoCode(file: string, cover: string) {
  return getMessageCode('video', {
    file,
    cover,
  });
}

export function getShareCode_UNSAFE(url: string, title: string, content?: string, image?: string) {
  return getMessageCode('share', {
    url,
    title,
    content,
    image,
  });
}