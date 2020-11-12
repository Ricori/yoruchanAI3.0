import YBot from '../core/yBot';
import config from '../../config';
const yoruConfig = config.yoruConfig;

export function registerOnRequest() {
  const ybot = YBot.getInstance();

  //注册好友请求监听
  ybot.on('request.friend', (cxt) => {
    //自动处理
    ybot.setFriendAddRequest(cxt.flag, yoruConfig.autoAddFriend)
  })

  //注册拉群请求监听
  ybot.on('request.group.invite', (cxt) => {
    //自动处理
    ybot.setGroupAddRequest(cxt.flag, yoruConfig.autoAddGroup)
  })

}