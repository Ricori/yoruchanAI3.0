import YBot from '../core/YBot';
import handleAdminCommand from '../handle/handleAdmin';
import handleCommon from '../handle/handleCommon';
import handleGroup from '../handle/handleGroup';
import { yoruConfig } from '../../config';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';
import REPLYTEXT from '../customize/replyTextConfig';

// https://docs.go-cqhttp.org/event/
// https://12.onebot.dev/interface/event/notice/
// https://github.com/momocow/node-cq-websocket/blob/master/docs/api/EventListener.md#eventlistener

export function registerOnMessage() {
  const ybot = YBot.getInstance();

  // 监听私信消息
  ybot.on('message.private', async (e, cxt) => {
    const messageInfo = cxt as IPrivateMessage;
    // 1.管理员用户，先处理管理员命令
    if (yoruConfig.admin.indexOf(messageInfo.user_id) > -1) {
      if (handleAdminCommand(messageInfo)) {
        return;
      }
    }
    // 2.通用命令处理
    if (handleCommon(messageInfo)) {
      return;
    }
    // last.默认返回
    ybot.sendPrivateMsg(messageInfo.user_id, REPLYTEXT.defaultReply());
  });

  // 监听群聊@bot的消息
  ybot.on('message.group.@.me', (e, cxt) => {
    const messageInfo = cxt as IGroupMessage;
    if (handleCommon(messageInfo)) {
      return;
    }
    ybot.sendGroupMsg(messageInfo.group_id, REPLYTEXT.defaultReply(), messageInfo.user_id);
  });

  // 监听群消息
  ybot.on('message.group', (e, cxt) => {
    const messageInfo = cxt as IGroupMessage;
    handleGroup(messageInfo);
  });
}
