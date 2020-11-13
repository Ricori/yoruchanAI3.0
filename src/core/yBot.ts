import { CQWebSocket } from 'cq-websocket';
import config from '../../config';
import CQcode from './CQcode';
const wsConfig = config.wsConfig
const yoruConfig = config.yoruConfig;

export default class YBot {

  static instance: YBot;
  private cqs: CQWebSocket;
  public on;
  public once;

  constructor() {
    this.cqs = new CQWebSocket(wsConfig);
    this.on = this.cqs.on;
    this.once = this.cqs.once;
  }

  static getInstance() {
    if (!YBot.instance) {
      YBot.instance = new YBot();
    }
    return YBot.instance;
  }

  //注册连接监听,并进行首次ws连接
  connecting = () => {
    this.cqs.once('socket.connecting', () => { logWithTime('start ws connenct..') });
    this.cqs.once('socket.error', (wsType, err) => { logWithTime(`connect fail,Error: ${err}`); return true });
    this.cqs.once('socket.connect', () => { logWithTime('connect successfully'); return true });
    this.cqs.on('socket.reconnecting', () => logWithTime('ws reconnect..'));
    this.cqs.on('socket.reconnect_failed', (wsType, err) => logWithTime(`ws reconnect fail,Error: ${err}`));
    this.cqs.on('socket.reconnect', () => logWithTime('reconnect successfully'));
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

  //向某人发私信
  sendPrivateMsg = (user: string, msg: string) => {
    this.cqs('send_private_msg', {
      user_id: user,
      message: msg
    });
  }

  //回复消息
  replyMsg = (context: Record<string, any>, msg: string, at: boolean = false) => {
    if (typeof (msg) != "string" || msg.length === 0) {
      return;
    }
    let str = '';
    if (at) {
      str = CQcode.at(context.user_id) + msg;
    } else {
      str = msg;
    };
    if (context.group_id) {
      return this.cqs('send_group_msg', {
        group_id: context.group_id,
        message: str
      });
    } else if (context.discuss_id) {
      return this.cqs('send_discuss_msg', {
        discuss_id: context.discuss_id,
        message: str
      });
    } else if (context.user_id) {
      return this.cqs('send_private_msg', {
        user_id: context.user_id,
        message: msg
      });
    }
  }


}


function logWithTime(text: string) {
  console.log(`[${new Date().toLocaleString()}]${text}`);
}