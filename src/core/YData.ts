interface RepeaterLog {
  userId: number | string,
  msg: string,
  times: number,
  done: boolean,
}

export default class YData {
  static instance: YData;

  /** 自动同意好友请求的名单  */
  private approveFriendIds: number[] = [];

  /** 复读记录  */
  private repeaterData: Record<number | string, RepeaterLog | undefined> = {};

  /** b站up最新动态时间  */
  private biliLastestDynamicTime: Record<number, number> = {};

  constructor() {
    // 设置up最新动态时间为现在，防止bot启动立即推送
    this.setBiliLastestDynamicTime(4549624, new Date().getTime());
  }

  static getInstance() {
    if (!YData.instance) {
      YData.instance = new YData();
    }
    return YData.instance;
  }

  /** 新增好友白名单 */
  addApproveFriendIds = (userId: number) => {
    this.approveFriendIds = [...this.approveFriendIds, userId];
  };

  /** 检查用户是否在好友白名单中 */
  checkApproveFriend = (userId: number) => this.approveFriendIds.indexOf(userId) > -1;

  /** 在好友白名单中删除某用户 */
  deleteApproveFriend = (userId: number) => {
    this.approveFriendIds = this.approveFriendIds.filter((id) => id !== userId);
  };

  /** 记录某群复读情况
   * @param {number} groupId 群号
   * @param {number} userId QQ号
   * @param {string} msg 消息
   * @returns 如果已经复读则返回0，否则返回当前复读次数
   */
  saveRepeaterLog(groupId: number, userId: number, msg: string) {
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
}
