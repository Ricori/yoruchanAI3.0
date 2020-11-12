import YBot from '../core/yBot';
import config from '../../config';
import handleAdminCommand from '../handle/handleAdmin';
const yoruConfig = config.yoruConfig;


export function registerOnMessage() {

  const ybot = YBot.getInstance();

  //监听到私信消息
  ybot.on('message.private', (e, cxt) => {
    if (yoruConfig.admin.indexOf(cxt.user_id) > -1) {
      //私聊的是管理员，先处理管理员命令
      const isResolve = handleAdminCommand(cxt);      
      if(isResolve){
        return;
      }
    }

    // TODO 处理通用私聊

  });

}