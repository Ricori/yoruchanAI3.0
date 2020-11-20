


export default class YData {

  static instance: YData;

  private searchMode = []; //搜图模式记录

  private searchCount = []; //搜索次数记录
  private initDate = new Date().getDate();
  private hPicData = { g: {}, u: {} };  //setu记录
  private animeSearchLog = {};


  private approveFriendIds = [] as number[];  //好友请求白名单
  private repeaterData = [] as any;   //复读记录


  static getInstance() {
    if (!YData.instance) {
      YData.instance = new YData();
    }
    return YData.instance;
  }


  constructor() {
    /*
    //每分钟进行定时任务检测
    setInterval(() => {
      //清理每日搜索记录
      const nowDate = new Date().getDate();
      if (this.initDate != nowDate) {
        this.initDate = nowDate;

        this.approveFriendIds = [];

        this.searchCount = [];
      }
    }, 60 * 1000);
    */
  }

  //新增好友请求白名单
  addApproveFriendIds = (userid: number) => {
    this.approveFriendIds = [...this.approveFriendIds, userid]
  }
  //检查用户是否在好友白名单中
  checkApproveFriend = (userid: number) => {
    return this.approveFriendIds.indexOf(userid) > -1;
  }
  //在好友白名单中删除某用户
  deleteApproveFriend = (userid: number) => {
    this.approveFriendIds = this.approveFriendIds.filter(id => id != userid)
  }


  /**
   * 记录某群复读情况
   *
   * @param {number} g 群号
   * @param {number} u QQ号
   * @param {string} msg 消息
   * @returns 如果已经复读则返回0，否则返回当前复读次数
   */
  saveRptLog(groupId: number, userId: number, msg: string) {
    let lg = this.repeaterData[groupId];
    //没有记录或另起复读则新建记录
    if (!lg || lg.msg !== msg) {
      lg = {
        user: userId,
        msg,
        times: 1,
        done: false
      }
      this.repeaterData[groupId] = lg;
    } else if (lg.user !== userId) {
      //不同人复读则次数加1
      lg.user = userId;
      lg.times++;
    }
    return lg.done ? 0 : lg.times;
  }

  /**
   * 标记某群已复读
   *
   * @param {number} g 群号
  */
  setRptDone(groupId: number) {
    this.repeaterData[groupId].done = true;
  }




}