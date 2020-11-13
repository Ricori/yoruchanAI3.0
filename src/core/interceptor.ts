import { IPrivateMessage, IGroupMessage, IAllMessage } from './MessageType';

export type interceptorsType = [{
  name: string,
  doRule: ruleFuncType,
  doAction: (param: actionParamType) => void;
}]

export type actionParamType = {
  senderId: number,                 //发送者qq
  senderGroupId?: number,           //发送者所在群号
  resultParam?: Record<string, any>
}

export type ruleFuncType = (message: string) => {
  hit: boolean,         //命中规则
  param?: any           //传参
}

//处理拦截器
export function doInterceptor(
  interceptors: interceptorsType,
  messageInfo: IAllMessage
) {
  for (const interceptor of interceptors) {
    const result = interceptor.doRule(messageInfo.message);
    if (result.hit) {
      const param = {
        senderId: messageInfo.user_id,
        groupId: messageInfo.group_id,
        resultParam: result.param
      };
      interceptor.doAction(param);
      //拦截到了返回true
      return true;
    }
  }
  return false;
}

//测试拦截器
export function testInterceptor(
  interceptors: interceptorsType,
  messageInfo: IAllMessage
) {
  for (const interceptor of interceptors) {
    const result = interceptor.doRule(messageInfo.message);
    if (result.hit) {
      const param = {
        senderId: messageInfo.user_id,
        groupId: messageInfo.group_id,
        ...result.param
      };
      console.log(`[interceptor:${interceptor.name}]${param.toString()}`)
      return true;
    }
  }
  return false;
}
