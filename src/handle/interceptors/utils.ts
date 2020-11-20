import YBot from '../../core/YBot';
import { actionParamType } from '../../core/Interceptor';

export function hasText(text: string, findText: string) {
  return text.search(findText) !== -1;
}
export function hasImage(msg: string) {
  return msg.indexOf("[CQ:image") !== -1;
}
export function replyMessage(param: actionParamType, msg: string, at = false) {
  const ybot = YBot.getInstance();
  const { senderId, groupId } = param;
  if (groupId) {
    ybot.sendGroupMsg(groupId, msg, at ? senderId : undefined);
  } else {
    ybot.sendPrivateMsg(senderId, msg)
  }
};