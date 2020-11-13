import YBot from '../core/yBot';
import config from '../../config';
import handleAdminCommand from '../handle/handleAdmin';
import handleCommonCommand from '../handle/handleCommon';
const yoruConfig = config.yoruConfig;
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';

export function registerOnMessage() {

  const ybot = YBot.getInstance();

  //监听私信消息
  ybot.on('message.private', (e, cxt) => {
    const messageInfo = cxt as IPrivateMessage;
    //1.管理员用户，先处理管理员命令
    if (yoruConfig.admin.indexOf(messageInfo.user_id) > -1) {
      if (handleAdminCommand(messageInfo)) {
        return;
      }
    }

    //2.通用命令处理
    if (handleCommonCommand(messageInfo)) {
      return;
    }

    //last.默认返回
    ybot.sendPrivateMsg(messageInfo.user_id,'2323223')
    return;
  });

  /*
  //监听群聊@bot的消息
  ybot.on('message.group.@.me', (e, cxt) => {

  })


  //监听群消息
  ybot.on('message.group', (e, cxt) => {


  })
  */


}