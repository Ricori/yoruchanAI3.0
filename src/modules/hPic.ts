import Axios from 'axios';
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
    if (needBig) {
      resultMsg = MessageCode.bigImg(imgurl);
    } else {
      resultMsg = MessageCode.img(imgurl);
    }
    console.log(resultMsg);
    return resultMsg;
  } catch (err) {
    console.error(`${new Date().toLocaleString()} [error]}\n${err}`);
    return hPicReplyText.error;
  }
}