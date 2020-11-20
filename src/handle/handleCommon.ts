import {
  interceptorsType,
  doInterceptor,
  testInterceptor
} from '../core/Interceptor';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';

import hPicInterceptor from './interceptors/hPic';
import helpInterceptor from './interceptors/help';

export default function handleCommon(messageInfo: IPrivateMessage | IGroupMessage) {

  const interceptors: interceptorsType = [
    helpInterceptor,    //帮助拦截器
    hPicInterceptor,    //瑟图拦截器


  ];


  return doInterceptor(interceptors, messageInfo);
}
