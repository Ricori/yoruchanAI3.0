import { printLog } from '@/utils/print';
import { getAtCode, getReplyCode } from '@/utils/msgCode';
import { SimpleMessageData } from '@/types/event';
import { YoruCore } from './yoruCore';

class YoruBot extends YoruCore {
  /** 处理好友请求 */
  setFriendAddRequest(flag: string | number, approve: boolean) {
    this.cqs('set_friend_add_request', { flag: `${flag}`, approve });
  }

  /** 处理拉群请求 */
  setGroupAddRequest(flag: string | number, approve: boolean) {
    this.cqs('set_group_add_request', {
      flag: `${flag}`,
      type: 'invite',
      approve,
      reason: '该群无授权，请联系Yoru管理员',
    });
  }

  /** 发送私聊消息
   * @param {number} userId 对方QQ号
   * @param {string} msg 要发送的内容
   * @param {string} plainText 消息内容是否作为纯文本发送
   */
  async sendPrivateMsg(userId: number, msg: string, plainText?: boolean) {
    if (msg.length === 0) return;
    if (this.debugMode) {
      printLog(`[Send Private Msg] ${msg}`);
    }
    this.cqs('send_private_msg', {
      user_id: userId,
      message: msg,
      auto_escape: !!plainText,
    });
  }

  /** 发送群消息
   * @param {number} groupId 群号
   * @param {string} msg 要发送的内容
   * @param {string} atUser 可选，要at的qq
   * @param {string} plainText 消息内容是否作为纯文本发送
   */
  async sendGroupMsg(groupId: number, msg: string, atUser?: number | string, plainText?: boolean) {
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
  }

  /** 发送群回复消息
   * @param {number} groupId 群号
   * @param {string} msg 要发送的内容
   * @param {string} replyMsgId 要回复的消息id
   */
  async sendGroupReplyMsg(groupId: number, msg: string, replyMsgId: number | string) {
    if (msg.length === 0) return;
    const prefix = getReplyCode(replyMsgId);
    if (this.debugMode) {
      printLog(`[Send Group Msg] ${prefix}${msg}`);
    }
    this.cqs('send_group_msg', {
      group_id: groupId,
      message: prefix + msg,
    });
  }

  /** 获取合并转发
   * @param {string} forwardId 合并转发id
   */
  async getGroupForwardMsg(forwardId: number | string) {
    if (!forwardId) return;
    if (this.debugMode) {
      printLog(`[Get Group Forward Msg] forwardId:${forwardId}`);
    }
    const res = await this.cqs('get_forward_msg', {
      message_id: forwardId,
    });
    return res;
  }

  /** 发送合并转发
   * @param {number} groupId 对方QQ号
   * @param {object} msg 内容，参照 https://docs.go-cqhttp.org/cqcode
   */
  async sendGroupForwardMsg(groupId: number, msg: any[]) {
    if (msg.length === 0) return;
    if (this.debugMode) {
      printLog('[Send Group Forward Msg]\n', msg);
    }
    this.cqs('send_group_forward_msg', {
      group_id: groupId,
      messages: msg,
    });
  }

  /** 获取消息
   * @param {string} messageId 合并转发id
   */
  async getMessageFromId(messageId: number | string) {
    if (!messageId) return;
    const res = await this.cqs('get_msg', {
      message_id: messageId,
    });
    if (res.retcode === 0 && res.data) {
      return res.data as SimpleMessageData;
    }
    return undefined;
  }

  /** 撤回消息
   * @param {number} messageId 消息 ID
   */
  async deleteMsg(messageId: number) {
    this.cqs('delete_msg', {
      message_id: messageId,
    });
  }

  /** 获取图片信息
   * @param {string} file 图片缓存文件名
   */
  async getImageInfo(file: string) {
    const data = await this.cqs('get_image', {
      file,
    }) as unknown as null | { size: number; filename: string; url: string };
    return data;
  }

  /** 获取中文分词[不稳定]
   * @param {string} content 内容
   */
  async getWordSlices(content: string) {
    const data = await this.cqs('get_word_slices', {
      content,
    }) as unknown as null | { slices: string[] };
    return data;
  }

  /** 下载文件到缓存目录[不稳定]
    * @param {string} url 链接地址
    * @param {array} headers 请求头
  */
  async downloadFile(url: string, headers: string[]) {
    const data = await this.cqs('download_file', {
      url, headers,
    }) as unknown as null | { file: string };
    return data?.file;
  }
}

export default new YoruBot();
