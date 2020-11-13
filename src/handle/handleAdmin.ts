import YBot from '../core/yBot';
import {
  interceptorsType,
  doInterceptor,
  testInterceptor,
  actionParamType
} from '../core/interceptor';
import { IPrivateMessage } from '../core/MessageType';

export default function handleAdminCommand(messageInfo: IPrivateMessage) {

  const interceptors: interceptorsType = [
    {
      name: 'ApproveGroupInvite',
      doRule: approveGroupRule,
      doAction: approveGroupAction
    },
  ];

  return testInterceptor(interceptors, messageInfo);
  //return doInterceptor(interceptors, message);
}


function approveGroupRule(message: string) {
  const exec = /--approve-group=([0-9]+)/.exec(message);
  return {
    hit: exec !== null,
    param: {
      approveId: exec ? exec[1] : null
    }
  }
}
async function approveGroupAction(param: actionParamType) {
  const { senderId, resultParam } = param;
  const approveId = resultParam?.approveId;
  const ybot = YBot.getInstance();
  ybot.once('request.group.invite' as any, (inviteMsg: any) => {
    if (inviteMsg.group_id && inviteMsg.group_id == approveId) {
      ybot.setGroupAddRequest(inviteMsg.flag, true);
      //发送处理结果消息
      ybot.sendPrivateMsg(senderId, `已成功进入群${inviteMsg.group_id}`);
      return true;
    }
    return false;
  });
}