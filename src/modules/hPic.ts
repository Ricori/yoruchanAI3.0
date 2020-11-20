import Axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import { random } from 'lodash';
import { hPicReplyText } from '../customize/replyTextConfig';
import MessageCode from '../core/MessageCode';

const API_URI = 'https://api.lolicon.app/setu/zhuzhu.php?apikey=170792005f99b428151719';

export const getHPic = async (limitLevel: 0 | 1 | 2, needBig = false) => {
  let resultMsg = '';
  try {
    const res1 = await Axios.get(`${API_URI}&r18=${limitLevel}`);
    if (!res1.data.file) {
      resultMsg = hPicReplyText.serverError;
      return resultMsg;
    }
    const imgurl = res1.data.file.replace('https://i.pximg.net', 'http://pximg.cdn.kvv.me');
    const base64 = await getAntiShieldingBase64(imgurl).catch(err => {
      console.error(`${new Date().toLocaleString()} [Hpic Anti Error]}\n${err}`);
      return hPicReplyText.error;
    });
    if (needBig) {
      resultMsg = base64 ? MessageCode.bigImg(base64, true) : MessageCode.bigImg(imgurl);
    } else {
      resultMsg = base64 ? MessageCode.img(base64, true) : MessageCode.img(imgurl);
    }
    return resultMsg;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [Hpic Error]}\n${err}`);
    return hPicReplyText.error;
  }
}


async function getAntiShieldingBase64(url: string) {
  const origBase64 = await loadImgAndAntiShielding(url);
  if (checkBase64RealSize(origBase64)) {
    return origBase64;
  }
  return false;
  /*发送小图,加快发送速度
  const m1200Base64 = await loadImgAndAntiShielding(getMaster1200(url));
  if (checkBase64RealSize(m1200Base64)) return m1200Base64;
  return false;
  */
}
function loadImgAndAntiShielding(url: string) {
  return loadImage(url)
    .then(imgAntiShielding)
    .catch(e => {
      console.error('[error] anti-shielding load image\n', e);
      return '';
    });
}
function imgAntiShielding(img: any) {
  const { width: w, height: h } = img;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = [
    [0, 0, 1, 1],
    [w - 1, 0, w, 1],
    [0, h - 1, 1, h],
    [w - 1, h - 1, w, h],
  ] as any[];
  for (const pixel of pixels) {
    ctx.fillStyle = `rgba(${random(255)},${random(255)},${random(255)},0.3)`;
    ctx.fillRect.apply(ctx, pixel);
  }
  return canvas.toDataURL('image/jpeg', 0.97).split(',')[1];
}
function checkBase64RealSize(base64: string) {
  return base64.length && base64.length * 0.75 < 4000000;
}
function getMaster1200(url: string) {
  return url.replace('img-original', 'img-master').replace(/(.*)\..+$/, '$1_master1200.jpg');
}