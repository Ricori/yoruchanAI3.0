import {
  interceptorsType,
  doInterceptor,
  testInterceptor,
} from '../core/Interceptor';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';

import helpInterceptor from './interceptors/help';
import searchImgInterceptor from './interceptors/searchImg';
import hPicInterceptor from './interceptors/hPic';

// 私聊与群聊@消息
export default function handleCommon(messageInfo: IPrivateMessage | IGroupMessage) {
  // 拦截器们
  const interceptors: interceptorsType = [
    helpInterceptor,
    searchImgInterceptor,
    hPicInterceptor,

  ];

  return doInterceptor(interceptors, messageInfo);
}
