import YBot from '../core/YBot';
import YData from '../core/YData';
import {
  interceptorsType,
  doInterceptor,
  actionParamType
} from '../core/Interceptor';
import { IPrivateMessage } from '../core/MessageType';

export default function handleAdminCommand(messageInfo: IPrivateMessage) {

  const interceptors: interceptorsType = [
    {
      name: 'ApproveFriendInvite',
      doRule: approveFriendRule,
      doAction: approveFriendAction
    },
    /****
    {
      name: 'ApproveGroupInvite',
      doRule: approveGroupRule,
      doAction: approveGroupAction
    },
    ****/
  ];

  return doInterceptor(interceptors, messageInfo);
}


function approveFriendRule(message: string) {
  const exec = /--approve=([0-9]+)/.exec(message);
  return {
    hit: exec !== null,
    param: {
      approveId: exec ? exec[1] : null
    }
  }
}
async function approveFriendAction(param: actionParamType) {
  const { senderId, resultParam } = param;
  const approveId = resultParam?.approveId;
  const ybot = YBot.getInstance();
  const ydata = YData.getInstance();
  ybot.sendPrivateMsg(senderId, `已记录${approveId}至好友白名单`);
  ydata.addApproveFriendIds(parseInt(approveId));
}


//同意加群操作已经不再需要，因为新版QQ被拉会自动同意进群
/***********************
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
***********************/