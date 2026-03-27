import { ChatCompletionMessageParam } from 'openai/resources';

const MAX_CHAT_HISTORY_COUNT = 25;

interface RepeaterLog {
  userId: number | string,
  msg: string,
  times: number,
  done: boolean,
}

class YoruStorage {
  /** 自动同意好友请求的名单  */
  private toBeAddedList = new Set<number>();

  /** 复读记录  */
  private repeaterData = new Map<number, RepeaterLog>();

  /** 各平台最新内容时间 (key: "bili-{uid}" | "twitter-{username}") */
  private lastestSNSUpdateTime = new Map<string, number>();

  /** 私聊消息对话记录 (key: qq) */
  private privateChatConversations = new Map<number, ChatCompletionMessageParam[]>();

  /** 群消息对话记录  (key: groupId) */
  private groupChatConversations = new Map<number, ChatCompletionMessageParam[]>();

  /** 新增好友到待添加名单 */
  joinToBeAddedList = (userId: number) => { this.toBeAddedList.add(userId); };

  /** 检查是否在待添加的好友名单中 */
  getIsInToBeAddedList = (userId: number) => this.toBeAddedList.has(userId);

  /** 在待添加的好友名单中删除某用户 */
  deleteIdFromToBeAddedList = (userId: number) => { this.toBeAddedList.delete(userId); };

  /** 记录某群复读情况
   * @param {number} groupId 群号
   * @param {number} userId QQ号
   * @param {string} msg 消息
   * @returns 如果已经复读则返回0，否则返回当前复读次数
   */
  saveLogAndGetRepeaterTimes(groupId: number, userId: number, msg: string) {
    const logObj = this.repeaterData.get(groupId);
    // 没有记录或另起复读则新建记录
    if (!logObj || logObj.msg !== msg) {
      this.repeaterData.set(groupId, {
        userId, msg, times: 1, done: false,
      });
    } else if (logObj.userId !== userId) {
      // 不同人复读则次数加1
      logObj.userId = userId;
      logObj.times += 1;
    }
    return logObj ? (logObj.done ? 0 : logObj.times) : 0;
  }

  /** 标记某群已复读
   *  @param {number} groupId 群号
  */
  setRepeaterDone(groupId: number) {
    const logObj = this.repeaterData.get(groupId);
    if (logObj) {
      logObj.done = true;
    }
  }

  /** 设置某up最新动态时间 */
  setBiliLastestDynamicTime(uid: string, time: number) {
    this.lastestSNSUpdateTime.set(`bili-${uid}`, time);
  }

  /** 获取某up最新动态时间 */
  getBiliLastestDynamicTime(uid: string) {
    return this.lastestSNSUpdateTime.get(`bili-${uid}`) ?? 0;
  }

  /** 设置某推特用户最新推文时间 */
  setTwitterLastestTweetTime(username: string, time: number) {
    this.lastestSNSUpdateTime.set(`twitter-${username}`, time);
  }

  /** 获取某推特用户最新推文时间 */
  getTwitterLastestTweetTime(username: string) {
    return this.lastestSNSUpdateTime.get(`twitter-${username}`) ?? 0;
  }

  /** 添加某qq私聊会话记录 */
  addPrivateChatMessage(userId: number, messageParam: ChatCompletionMessageParam) {
    if (!this.privateChatConversations.has(userId)) {
      this.privateChatConversations.set(userId, []);
    }
    const history = this.privateChatConversations.get(userId)!;
    history.push(messageParam);
    if (history.length > MAX_CHAT_HISTORY_COUNT) {
      // 删掉前面超出的部分
      history.splice(0, history.length - MAX_CHAT_HISTORY_COUNT);
    }
  }

  /** 获取某qq私聊会话记录 */
  getPrivateChatMessage(userId: number): ChatCompletionMessageParam[] {
    return this.privateChatConversations.get(userId) || [];
  }


  /** 添加某群会话记录 */
  addGroupChatConversations(groupId: number, messageParam: ChatCompletionMessageParam) {
    if (!this.groupChatConversations.has(groupId)) {
      this.groupChatConversations.set(groupId, []);
    }
    const history = this.groupChatConversations.get(groupId)!;
    history.push(messageParam);
    if (history.length > MAX_CHAT_HISTORY_COUNT) {
      history.splice(0, history.length - MAX_CHAT_HISTORY_COUNT);
    }
  }

  /** 修剪某群会话记录 */
  trimGroupChatConversations(groupId: number) {
    let imageCount = 0;
    const history = this.groupChatConversations.get(groupId)!;
    // 倒序遍历消息
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      // 判断消息 content 是不是多模态数组
      if (Array.isArray(msg.content)) {
        imageCount++;
        // 如果超过 3 张图
        if (imageCount > 2) {
          const downgradedText = (msg.content[0] as { text: string }).text;
          // 多模态消息改为纯文本消息
          history[i] = {
            ...msg,
            content: downgradedText,
          };
        }
      }
    }
  }

  /** 获取某群会话记录 */
  getGroupChatConversations(groupId: number) {
    return this.groupChatConversations.get(groupId) || [];
  }

  /** 清理所有会话缓存 */
  cleanChatConversations() {
    this.privateChatConversations.clear();
    this.groupChatConversations.clear();
  }
}

export default new YoruStorage();
