export type interceptorsType = [{
  doRule: () => boolean,
  doAction: () => void;
}]

//处理拦截器
export function doInterceptor(interceptors: interceptorsType) {
  for (const interceptor of interceptors) {
    if (interceptor.doRule()) {
      interceptor.doAction();
      //拦截到了返回true
      return true;
    }
  }
  return false;
}
