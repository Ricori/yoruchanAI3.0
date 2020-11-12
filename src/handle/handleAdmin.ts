import YBot from '../core/yBot';
import {interceptorsType , doInterceptor} from '../core/interceptor';

export default function handleAdminCommand(context) {
  const message = context.message;
  const interceptors = [
    {
      doRule: () => Boolean(getGroupId(message)),
      doAction: () => setApproveGroup(getGroupId(message))
    },
  ] as interceptorsType;

  return doInterceptor(interceptors);
}


function getGroupId(message) {
  return /--approve-group=([0-9]+)/.exec(message)[1]
}
function setApproveGroup(groupId: string) {
  const ybot = YBot.getInstance();
  ybot.once('request.group.invite', (cxt) => {
    if (cxt.group_id === groupId) {
      ybot.setGroupAddRequest(cxt.flag, true);
      //发送处理结果消息
      ybot.replyMsg(cxt, `已成功进入群${cxt.group_id}`);
      return true;
    }
    return false;
  });
}