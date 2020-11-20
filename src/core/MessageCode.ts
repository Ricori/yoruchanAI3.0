/**
 * 转义
 *
 * @param {string} str 欲转义的字符串
 * @param {boolean} [insideCQ=false] 是否在CQ码内
 * @returns 转义后的字符串
 */
function escape(str: string, insideCQ = false) {
  let temp = str.replace(/&/g, '&amp;');
  temp = temp.replace(/\[/g, '&#91;');
  temp = temp.replace(/\]/g, '&#93;');
  if (insideCQ) {
    temp = temp.replace(/,/g, '&#44;').replace(/(\ud83c[\udf00-\udfff])|(\ud83d[\udc00-\ude4f\ude80-\udeff])|[\u2600-\u2B55]/g, ' ');
  }
  return temp;
}
/**
 * 反转义
 *
 * @param {string} str 欲反转义的字符串
 * @returns 反转义后的字符串
 */
function unescape(str: string) {
  return str.replace(/&#44;/g, ',').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');
}


/**
 * CQ码 普通图片
 */
function img(file: string, isBase64 = false) {
  if (isBase64) {
    return `[CQ:image,file=base64://${file}]`;
  } else {
    return `[CQ:image,file=${escape(file, true)}]`;
  }
}
/**
 * CQ码 闪照图片
 */
function flashImg(url: string) {
  return `[CQ:image,url=${escape(url, true)},type=flash]`;
}
/**
 * CQ码 秀图图片
 * @param {string} id 40000=普通,40001=幻影,40002=抖动,40003=生日,40004=爱你,40005=征友
 */
function showImg(url: string, id: string) {
  return `[CQ:image,url=${escape(url, true)},type=show,id=${id}]`;
}
/**
 * CQ码 大图片
 */
function bigImg(file: string, isBase64 = false) {
  if (isBase64) {
    return `[CQ:cardimage,maxwidth=800,maxheight=1600,source=夜夜酱,file=base64://${file}]`;
  } else {
    return `[CQ:cardimage,maxwidth=800,maxheight=1600,source=夜夜酱,file=${file}]`;
  }
}


/**
 * CQ码 语音
 */
function tts(text: string) {
  return `[CQ:tts,text=${escape(text)}]`;
}

/**
 * CQ码 分享链接
 *
 * @param {string} url 链接
 * @param {string} title 标题
 * @param {string} content 内容
 * @param {string} image 图片URL
 * @returns CQ码 分享链接
 */
function share(url: string, title: string, content: string, image: string) {
  return `${title}\n${img(image)}\n${url}`;
  return `[CQ:share,url=${escape(url, true)},title=${escape(title, true)},content=${escape(content, true)},image=${escape(image, true)}]`;
}


/**
 * CQ码 @
 *
 * @param {number} qq
 * @returns CQ码 @
 */
function at(qq: number) {
  return "[CQ:at,qq=" + qq + "] ";
}


export default {
  escape,
  img,
  bigImg,
  share,
  at
};
