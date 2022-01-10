import Axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import { random } from 'lodash';
import { hPicReplyText } from '../customize/replyTextConfig';
import { getImgCode, getBigImgCode } from '../utils/msgCode';

const API_URI = 'https://api.lolicon.app/setu/?apikey=170792005f99b428151719';
const MY_PROXY = 'https://i.pixiv.cat'; // http://pximg.cdn.kvv.me
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Safari/537.36';

export default async function getHPic(limitLevel: 0 | 1 | 2, needBig = false, count = 1, useBase64 = true, useSmallPic = false) {
  const resultMsgs = [];
  try {
    if (limitLevel) {
      const res1 = await Axios.get(`${API_URI}&r18=${limitLevel}&num=${count}`);
      if (res1.data.code !== 0 || res1.data.data?.length < 1) {
        resultMsgs.push(hPicReplyText.serverError);
        return resultMsgs;
      }
      const { data } = res1.data;
      for (const item of data) {
        const imgurl = item.url.replace('https://i.pximg.net', MY_PROXY);
        let resultMsg;
        if (!useBase64) {
          if (needBig) {
            resultMsg = getBigImgCode(useSmallPic ? getMaster1200(imgurl) : imgurl);
          } else {
            resultMsg = getImgCode(useSmallPic ? getMaster1200(imgurl) : imgurl);
          }
        } else {
          const base64 = await getAntiShieldingBase64(imgurl, useSmallPic).catch((err) => {
            console.error(`${new Date().toLocaleString()} [Hpic Anti Error]}\n${err}`);
            resultMsg = hPicReplyText.error;
          });
          if (needBig) {
            resultMsg = base64 ? getBigImgCode(base64, true) : getBigImgCode(imgurl);
          } else {
            resultMsg = base64 ? getImgCode(base64) : getImgCode(imgurl);
          }
        }
        resultMsgs.push(resultMsg);
      }
    } else {
      /* 色图新逻辑
      for (let i = 0; i < count; i += 1) {
        const t = new Date().getTime() + i;
        resultMsgs.push(getImgCode(`http://localhost:60233/?type=setu&t=${t}`));
      }
      */
    }
    return resultMsgs;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [Hpic Error]}\n${err}`);
    return [hPicReplyText.error];
  }
}

async function getAntiShieldingBase64(url: string, useSmallPic: boolean) {
  if (!useSmallPic) {
    const origBase64 = await loadImgAndAntiShielding(url);
    if (checkBase64RealSize(origBase64)) return origBase64;
  } else {
    const m1200Base64 = await loadImgAndAntiShielding(getMaster1200(url));
    if (checkBase64RealSize(m1200Base64)) return m1200Base64;
  }
  return false;
}
function loadImgAndAntiShielding(url: string) {
  return loadImage(url)
    .then(imgAntiShielding)
    .catch((e) => {
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
