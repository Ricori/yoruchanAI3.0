export type interceptorsType = [{
  name: string,
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

//测试拦截器
export function testInterceptor(interceptors: interceptorsType) {
  for (const interceptor of interceptors) {
    if (interceptor.doRule()) {
      console.log(`[interceptor]`, interceptor.name)
      return true;
    }
  }
  return false;
}
