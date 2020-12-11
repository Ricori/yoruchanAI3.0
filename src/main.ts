import YBot from './core/YBot';
import InitProxy from './proxy';
import { registerOnRequest } from './listener/onRequest';
import { registerOnMessage } from './listener/onMessage';

export default function init() {

  const ybot = YBot.getInstance();

  //注册好友请求、拉群请求监听
  registerOnRequest();

  //注册消息监听
  registerOnMessage();

  //启动本地代理
  InitProxy();

  //开始连接
  ybot.connect();

}