


export default class YData {

  static instance: YData;

  private searchMode = []; //搜图模式记录
  private repeaterData = [];  //复读记录
  private searchCount = []; //搜索次数记录
  private initDate = new Date().getDate();
  private hPicData = { g: {}, u: {} };  //setu记录
  private animeSearchLog = {};


  private approveFriendIds = [] as number[];


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






}