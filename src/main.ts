import { CQWebSocket } from 'cq-websocket';
import config from '../config';
import YBot from './core/yBot';
import { registerOnRequest } from './listener/onRequest';


export default function init() {

  const ybot = YBot.getInstance();

  //注册好友请求、拉群请求监听
  registerOnRequest();

  




}