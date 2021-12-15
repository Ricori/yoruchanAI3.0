import { CQWebSocket } from 'cq-websocket';
import YData from './YData';
import { printLog } from '../utils/print';
import MessageCode from './MessageCode';
import { getAtCode } from '../utils/code';

import { wsConfig } from '../../config';
// import { PrivateMessage, GroupMessage } from './MessageType';

import {
  RequestFirendListenerFc,
  PrivateMessageListenerFc,
} from '../types/listener';

type listenerType = 'requestFriend';

export default class YBot {
  static instance: YBot;

  private cqs: CQWebSocket;

  public on: CQWebSocket['on'];

  public once: CQWebSocket['once'];

  private connectState = {
    '/event': false,
    '/api': false,
  };

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

  // 注册连接相关监听事件
  registerConnectingEvent = () => {
    this.cqs.on('socket.connecting', (type) => { printLog(`[${type}]start ws connenct..`); });
    this.cqs.on('socket.error', (type, err) => {
      printLog(`[${type}]ws connect fail,Error: ${err}`);
      this.connectState[type] = false;
    });
    this.cqs.on('socket.connect', (type) => {
      printLog(`[${type}]connect successfully`);
      this.connectState[type] = true;
    });
  };

  // 启动连接
  connect = () => {
    this.cqs.connect();
  };

  // bot是否连接中
  getBotIsConnect = () => {
    if (this.connectState['/api'] && this.connectState['/event']) {
      return true;
    }
    return false;
  };

  /* BOT API LIST */
  /* https://docs.go-cqhttp.org/api/ */

  /** 处理好友请求 */
  setFriendAddRequest = (flag: string | number, approve: boolean) => {
    this.cqs('set_friend_add_request', { flag: `${flag}`, approve });
  };

  /** 处理邀请加群 */
  setGroupAddRequest = (flag: string | number, approve: boolean) => {
    this.cqs('set_group_add_request', {
      flag: `${flag}`,
      type: 'invite',
      approve,
      reason: '该群无授权，请联系Yoru管理员',
    });
  };

  /** 发送私聊消息
   * @param {number} userId 对方QQ号
   * @param {string} msg 要发送的内容
   * @param {string} plainText 消息内容是否作为纯文本发送
   */
  sendPrivateMsg = async (userId: number, msg: string, plainText?: boolean) => {
    if (msg.length === 0) return;
    this.cqs('send_private_msg', {
      user_id: userId,
      message: msg,
      auto_escape: !!plainText,
    });
  };

  /** 发送群消息
   * @param {number} groupId 对方QQ号
   * @param {string} msg 要发送的内容
   * @param {string} atUser 可选，要at的qq
   * @param {string} plainText 消息内容是否作为纯文本发送
   */
  sendGroupMsg = async (groupId: number, msg: string, atUser?: number | string, plainText?: boolean) => {
    if (msg.length === 0) return;
    let prefix = '';
    if (atUser) {
      prefix = getAtCode(`${atUser}`);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: prefix + msg,
      auto_escape: !!plainText,
    });
  };

  /** 发送合并转发
   * @param {number} groupId 对方QQ号
   * @param {object} msg 内容，参照 https://docs.go-cqhttp.org/cqcode
   */
  sendGroupForwardMsg = async (groupId: number, msg: any[]) => {
    if (msg.length === 0) return;
    this.cqs('send_group_forward_msg', {
      group_id: groupId,
      messages: msg,
    });
  };

  /** 撤回消息
   * @param {number} messageId 消息 ID
   */
  deleteMsg = async (messageId: number) => {
    this.cqs('delete_msg', {
      message_id: messageId,
    });
  };

  /** 获取图片信息
   * @param {string} file 图片缓存文件名
   */
  getImageInfo = async (file: string) => {
    const data = await this.cqs('get_image', {
      file,
    }) as unknown as null | { size: number; filename: string; url: string };
    return data;
  };

  /** 获取中文分词[不稳定]
   * @param {string} content 内容
   */
  getWordSlices = async (content: string) => {
    const data = await this.cqs('get_word_slices', {
      content,
    }) as unknown as null | { slices: string[] };
    return data;
  };

  /* BOT EVENT LIST */
  /* https://12.onebot.dev/interface/event/meta/ */

  bindRequestFirendListener = (listenerFc: RequestFirendListenerFc) => {
    this.cqs.on('request.friend', async (cxt: any) => {
      listenerFc(cxt);
    });
  };

  bindPrivateMessageListener = (listenerFc: PrivateMessageListenerFc) => {

  };
}
