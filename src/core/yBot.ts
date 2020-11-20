import { CQWebSocket } from 'cq-websocket';
import YData from './YData';

import MessageCode from './MessageCode';

import config from '../../config';
const { wsConfig, yoruConfig } = config;
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
    this.registerConnecting();
  }

  static getInstance() {
    if (!YBot.instance) {
      YBot.instance = new YBot();
    }
    return YBot.instance;
  }

  //注册连接监听
  registerConnecting = () => {
    this.cqs.on('socket.connecting', () => { logWithTime('start ws connenct..') });
    this.cqs.on('socket.error', (wsType, err) => logWithTime(`ws connect fail,Error: ${err}`));
    this.cqs.on('socket.connect', () => logWithTime('connect successfully'));
  }

  //启动连接
  connect = () => {
    this.cqs.connect();
  }

  //处理加好友请求
  setFriendAddRequest = (flag: string, approve: boolean) => {
    this.cqs('set_friend_add_request', {
      flag,
      approve
    });
  }
  //处理邀请加群请求
  setGroupAddRequest = (flag: string, approve: boolean) => {
    this.cqs('set_group_add_request', {
      flag,
      type: "invite",
      approve,
      reason: '无授权,请联系yoru管理员'
    });
  }

  //发私信消息
  sendPrivateMsg = (toUserId: number, msg: string) => {
    if (msg.length === 0) return;
    this.cqs('send_private_msg', {
      user_id: toUserId,
      message: msg
    });
  }
  //发群消息
  sendGroupMsg = (groupId: number, msg: string, atUserId?: number) => {
    if (msg.length === 0) return;
    let prefix = '';
    if (atUserId) {
      prefix = MessageCode.at(atUserId);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: prefix + msg
    });
  }

  //发送合并转发消息
  sendForwardMsg = (groupId: number, forwardNode: any[]) => {
    this.cqs('send_group_forward_msg', {
      group_id: groupId,
      message: forwardNode
    })
  }


}


function logWithTime(text: string) {
  console.log(`[${new Date().toLocaleString()}]${text}`);
}