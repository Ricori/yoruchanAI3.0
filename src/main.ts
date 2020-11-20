import { CQWebSocket } from 'cq-websocket';
import config from '../config';
import YBot from './core/YBot';
import { registerOnRequest } from './listener/onRequest';
import { registerOnMessage } from './listener/onMessage';

export default function init() {

  const ybot = YBot.getInstance();

  //注册好友请求、拉群请求监听
  registerOnRequest();

  //注册消息监听
  registerOnMessage();

  //开始连接
  ybot.connect();

}