import { CQWebSocket } from 'cq-websocket';
import YData from './YData';
import { printLog } from '../utils/print';
import MessageCode from './MessageCode';

import { wsConfig } from '../../config';
//import { PrivateMessage, GroupMessage } from './MessageType';


export default class YBot {

  static instance: YBot;
  private cqs: CQWebSocket;
  public on: CQWebSocket["on"];
  public once: CQWebSocket["once"];

  constructor() {
    this.cqs = new CQWebSocket(wsConfig);
    this.on = this.cqs.on.bind(this.cqs);
    this.once = this.cqs.once.bind(this.cqs);
    this.registerConnectingEvent();
  }

  static getInstance() {
    if (!YBot.instance) {
      YBot.instance = new YBot();
    }
    return YBot.instance;
  }

  // 注册连接监听事件
  registerConnectingEvent = () => {
    this.cqs.on('socket.connecting', () => { printLog('start ws connenct..') });
    this.cqs.on('socket.error', (_, err) => printLog(`ws connect fail,Error: ${err}`));
    this.cqs.on('socket.connect', () => printLog('connect successfully'));
  }

  // 启动连接
  connect = () => {
    this.cqs.connect();
  }

  // 处理好友请求事件
  setFriendAddRequest = (flag: string, approve: boolean) => {
    this.cqs('set_friend_add_request', {
      flag,
      approve
    });
  }

  // 处理邀请加群事件
  setGroupAddRequest = (flag: string, approve: boolean) => {
    this.cqs('set_group_add_request', {
      flag,
      type: "invite",
      approve,
      reason: '无授权,请联系yoru管理员'
    });
  }

  //发私信消息
  sendPrivateMsg = async (toUserId: number, msg: string) => {
    if (msg.length === 0) return;
    this.cqs('send_private_msg', {
      user_id: toUserId,
      message: msg
    });
  }
  //发群消息
  sendGroupMsg = async (groupId: number, msg: string, atUserId?: number) => {
    if (msg.length === 0) return;
    let prefix = '';
    if (atUserId) {
      prefix = MessageCode.at(`${atUserId}`);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: prefix + msg
    });
  }

}
