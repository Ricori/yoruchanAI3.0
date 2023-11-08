import { CQWebSocket } from 'cq-websocket';
import { printError, printLog } from '@/utils/print';
import { getAtCode, getReplyCode } from '@/utils/msgCode';
import { SimpleMessageData } from '@/types/event';

import {
  RequestFirendListenerFc,
  PrivateMessageListenerFc,
  GroupMessageListenerFc,
} from '@/types/listener';
import { BotConfig, YoruConfig } from '@/types/config';
import { loadConfigFile } from '@/utils/io';

const debugMode = process.env.YDEBUG === 'true';

class Yorubot {

  /** CQWebSocket Object */
  private cqs: CQWebSocket;

  /** Bot connection status */
  private connectState = {
    '/event': false,
    '/api': false,
  };

  /** Is in debug mode */
  readonly debugMode = debugMode;

  /** Bot configs */
  readonly config: BotConfig;

  constructor() {
    // If you use debug mode, you need to create the `config_debug.json` manually
    const configFileName = debugMode ? 'config_debug.json' : 'config.json';
    const config = loadConfigFile(configFileName) as YoruConfig;

    // config
    this.debugMode = debugMode;
    this.config = config.botConfig;

    // create cqs object
    this.cqs = new CQWebSocket(config.wsConfig);
  }

  /** Start bot */
  start() {
    // register connection-related listening events
    this.cqs.on('socket.connecting', (type) => { printLog(`[WS Connect] ${type} start connenct..`); });
    this.cqs.on('socket.error', (type, err) => {
      printLog(`[WS Connect] ${type} connect fail,Error: ${err}`);
      this.connectState[type] = false;
    });
    this.cqs.on('socket.connect', (type) => {
      printLog(`[WS Connect] ${type} connect successfully`);
      this.connectState[type] = true;
    });
    // ws connect
    this.cqs.connect();
  };

  /** Get bot connecting status */
  getIsBotConnecting() {
    if (this.connectState['/api'] && this.connectState['/event']) {
      return true;
    }
    return false;
  };

  /** Check connection status */
  checkBotState() {
    if (!this.getIsBotConnecting()) {
      printError('[Error] Bot already disconnected, unable to perform action.')
      return;
    }
  }

  /** Handle friend requests */
  setFriendAddRequest = (flag: string | number, approve: boolean) => {
    this.checkBotState();
    this.cqs('set_friend_add_request', { flag: `${flag}`, approve });
  };

  /** Handle group requests */
  setGroupAddRequest = (flag: string | number, approve: boolean) => {
    this.checkBotState();
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
    this.checkBotState();
    if (msg.length === 0) return;
    if (this.debugMode) {
      printLog(`[Send Private Msg] ${msg}`);
    }
    this.cqs('send_private_msg', {
      user_id: userId,
      message: msg,
      auto_escape: !!plainText,
    });
  };

  /** 发送群消息
   * @param {number} groupId 群号
   * @param {string} msg 要发送的内容
   * @param {string} atUser 可选，要at的qq
   * @param {string} plainText 消息内容是否作为纯文本发送
   */
  sendGroupMsg = async (groupId: number, msg: string, atUser?: number | string, plainText?: boolean) => {
    this.checkBotState();
    if (msg.length === 0) return;
    const prefix = atUser ? getAtCode(`${atUser}`) : '';
    if (this.debugMode) {
      printLog(`[Send Group Msg] ${prefix}${msg}`);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: `${prefix}${msg}`,
      auto_escape: !!plainText,
    });
  };

  /** 发送群回复消息
   * @param {number} groupId 群号
   * @param {string} msg 要发送的内容
   * @param {string} replyMsgId 要回复的消息id
   */
  sendGroupReplyMsg = async (groupId: number, msg: string, replyMsgId: number | string) => {
    this.checkBotState();
    if (msg.length === 0) return;
    const prefix = getReplyCode(replyMsgId);
    if (this.debugMode) {
      printLog(`[Send Group Msg] ${prefix}${msg}`);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: prefix + msg,
    });
  };

  /** 获取合并转发
   * @param {string} forwardId 合并转发id
   */
  getGroupForwardMsg = async (forwardId: number | string) => {
    this.checkBotState();
    if (!forwardId) return;
    if (this.debugMode) {
      printLog(`[Get Group Forward Msg] forwardId:${forwardId}`);
    }
    const res = await this.cqs('get_forward_msg', {
      message_id: forwardId,
    });
    return res;
  };

  /** 发送合并转发
   * @param {number} groupId 对方QQ号
   * @param {object} msg 内容，参照 https://docs.go-cqhttp.org/cqcode
   */
  sendGroupForwardMsg = async (groupId: number, msg: any[]) => {
    this.checkBotState();
    if (msg.length === 0) return;
    if (this.debugMode) {
      printLog(`[Send Group Forward Msg]\n`, msg);
    }
    this.cqs('send_group_forward_msg', {
      group_id: groupId,
      messages: msg,
    });
  };

  /** 获取消息
   * @param {string} messageId 合并转发id
   */
  getMessageFromId = async (messageId: number | string) => {
    this.checkBotState();
    if (!messageId) return;
    const res = await this.cqs('get_msg', {
      message_id: messageId,
    });
    if (res.retcode === 0 && res.data) {
      return res.data as SimpleMessageData;
    }
    return undefined;
  };

  /** 撤回消息
   * @param {number} messageId 消息 ID
   */
  deleteMsg = async (messageId: number) => {
    this.checkBotState();
    this.cqs('delete_msg', {
      message_id: messageId,
    });
  };

  /** 获取图片信息
   * @param {string} file 图片缓存文件名
   */
  getImageInfo = async (file: string) => {
    this.checkBotState();
    const data = await this.cqs('get_image', {
      file,
    }) as unknown as null | { size: number; filename: string; url: string };
    return data;
  };

  /** 获取中文分词[不稳定]
   * @param {string} content 内容
   */
  getWordSlices = async (content: string) => {
    this.checkBotState();
    const data = await this.cqs('get_word_slices', {
      content,
    }) as unknown as null | { slices: string[] };
    return data;
  };


  /** Do actions */
  doFc = async (fcs: PrivateMessageListenerFc[] | GroupMessageListenerFc[], data: any) => {
    for (let index = 0; index < fcs.length; index += 1) {
      const fc = fcs[index];
      let res;
      try {
        res = await fc(data);
        if (res) break;
      } catch (error) {
        printLog(`[Listner Error] ${error}`);
      }
    }
  };

  /** Bind request firend listener */
  bindRequestFirendListener = (listenerFc: RequestFirendListenerFc) => {
    this.cqs.on('request.friend', async (data: any) => {
      listenerFc(data);
    });
  };

  /** Bind private message listener */
  bindPrivateMessageListeners = (listenerFcs: PrivateMessageListenerFc[]) => {
    this.cqs.on('message.private', async (_, data: any) => {
      this.doFc(listenerFcs, data);
    });
  };

  /** Bind group at bot message listener */
  bindGroupAtBotMessageListeners = (listenerFcs: GroupMessageListenerFc[]) => {
    this.cqs.on('message.group.@.me', async (_, data: any) => {
      this.doFc(listenerFcs, data);
    });
  };

  /** Bind group common message listener */
  bindGroupCommonMessageListeners = (listenerFcs: GroupMessageListenerFc[]) => {
    this.cqs.on('message.group', async (_, data: any) => {
      this.doFc(listenerFcs, data);
    });
  };
}

export default new Yorubot();