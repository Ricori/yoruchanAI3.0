/** 返回文本数组中随机文本 */
export function randomText(textArr: string[]) {
  const i = Math.floor(Math.random() * textArr.length);
  return textArr[i];
}

/** 判断消息是否有指定文本
 * @param {string} text 消息
 * @param {string} findText 需要寻找的消息
 * @returns 有则返回true
 */
export function hasText(text: string, findText: string) {
  return text.search(findText) !== -1;
}

/** 判断消息是否有图片
 * @param {string} msg 消息
 * @returns 有则返回true
 */
export function hasImage(msg: string) {
  return msg.indexOf('[CQ:image') !== -1;
}

/** 从消息中提取图片
 * @param {string} msg
 * @returns 图片URL数组
 */
export function getImgs(msg: string) {
  const reg = /\[CQ:image,file=([^,]+),url=([^\]]+)\]/g;
  const result = [];
  let search = reg.exec(msg);
  while (search) {
    result.push({
      file: search[1],
      url: search[2],
    });
    search = reg.exec(msg);
  }
  return result;
}
