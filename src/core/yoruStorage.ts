import { ChatCompletionMessageParam } from 'openai/resources';

interface RepeaterLog {
  userId: number | string,
  msg: string,
  times: number,
  done: boolean,
}

class YoruStorage {

  /** 自动同意好友请求的名单  */
  private toBeAddedList: number[] = [];

  /** 复读记录  */
  private repeaterData: Record<number | string, RepeaterLog | undefined> = {};

  /** b站up最新动态时间  */
  private biliLastestDynamicTime: Record<number, number> = {};

  /** 群消息对话（每个id最多记录8条）  */
  private groupChatConversations: Record<number, ChatCompletionMessageParam[]> = {};


  /** 新增好友到待添加名单 */
  joinToBeAddedList = (userId: number) => this.toBeAddedList = [...this.toBeAddedList, userId];
  /** 检查是否在待添加的好友名单中 */
  getIsInToBeAddedList = (userId: number) => this.toBeAddedList.indexOf(userId) > -1;
  /** 在待添加的好友名单中删除某用户 */
  deleteIdFromToBeAddedList = (userId: number) => {
    this.toBeAddedList = this.toBeAddedList.filter((id) => id !== userId);
  };

  /** 记录某群复读情况
   * @param {number} groupId 群号
   * @param {number} userId QQ号
   * @param {string} msg 消息
   * @returns 如果已经复读则返回0，否则返回当前复读次数
   */
  saveLogAndGetRepeaterTimes(groupId: number, userId: number, msg: string) {
    const logObj = this.repeaterData[groupId];
    // 没有记录或另起复读则新建记录
    if (!logObj || logObj.msg !== msg) {
      this.repeaterData[groupId] = {
        userId,
        msg,
        times: 1,
        done: false,
      };
    } else if (logObj.userId !== userId) {
      // 不同人复读则次数加1
      logObj.userId = userId;
      logObj.times += 1;
    }
    return logObj ? (logObj.done ? 0 : logObj?.times) : 0;
  }

  /** 标记某群已复读
   *  @param {number} groupId 群号
  */
  setRepeaterDone(groupId: number) {
    const logObj = this.repeaterData[groupId];
    if (logObj) {
      logObj.done = true;
    }
  }

  /** 设置某up最新动态时间 */
  setBiliLastestDynamicTime(uid: number, time: number) {
    this.biliLastestDynamicTime[uid] = time;
  }

  /** 获取某up最新动态时间 */
  getBiliLastestDynamicTime(uid: number) {
    return this.biliLastestDynamicTime[uid] ?? 0;
  }

  /** 设置某qq的群会话 */
  setGroupChatConversations(userId: number, messages: ChatCompletionMessageParam[]) {
    const conversation = this.groupChatConversations[userId];
    if (conversation && conversation.length > 9) {
      messages.shift();
      this.groupChatConversations[userId] = messages;
    } else {
      this.groupChatConversations[userId] = messages;
    }
  }

  /** 获取某qq的群会话 */
  getGroupChatConversations(userId: number) {
    return this.groupChatConversations[userId] ?? [];
  }
}

export default new YoruStorage();