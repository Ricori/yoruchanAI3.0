import YBot from '../core/YBot';
import YData from '../core/YData';
import config from '../../config';
const yoruConfig = config.yoruConfig;

export function registerOnRequest() {
  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();

  //注册好友请求监听
  ybot.on('request.friend', async cxt => {
    //好友白名单处理
    const userId = cxt.user_id;
    if (ydata.checkApproveFriend(userId)) {
      ybot.setFriendAddRequest(cxt.flag, true);
      //在白名单中去除,节省内存
      ydata.deleteApproveFriend(userId);
      //向所有管理员推送新好友消息
      const adminIds = yoruConfig.admin || [];
      adminIds.forEach(adminId => {
        if (!isNaN(adminId)) {
          ybot.sendPrivateMsg(adminId, `YoruBot新增好友${userId}`);
        }
      })
    } else {
      //自动全局处理
      ybot.setFriendAddRequest(cxt.flag, yoruConfig.autoAddFriend)
    }

  })


  //拉群请求监听
  //因为傻逼QQ只要是好友拉群会自动同意，所以已经不需要拉群后操作 
  /*
  ybot.on('request.group.invite', (cxt) => {
    ybot.setGroupAddRequest(cxt.flag, false)
  })
  */

}