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
  private repeaterData: Record<number | string, RepeaterLog> = {};

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
    return logObj.done ? 0 : logObj.times;
  }

  /** 标记某群已复读
   *  @param {number} groupId 群号
  */
  setRepeaterDone(groupId: number) {
    if (this.repeaterData[groupId]) {
      this.repeaterData[groupId].done = true;
    }
  }
}
