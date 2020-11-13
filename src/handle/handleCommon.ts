import YBot from '../core/yBot';
import {
  interceptorsType,
  actionParamType,
  doInterceptor,
  testInterceptor
} from '../core/interceptor';
import { IPrivateMessage, IGroupMessage, IAllMessage } from '../core/MessageType';
import REPLYTEXT from '../replyTextConfig';

export default function handleCommon(messageInfo: IPrivateMessage | IGroupMessage) {

  const interceptors: interceptorsType = [
    {
      name: 'helpText',
      doRule: helpTextRule,
      doAction: helpTextAction
    },
  ];

  return testInterceptor(interceptors, messageInfo);
  //return doInterceptor(interceptors, message);
}


function hasText(text: string, findText: string) {
  return text.search(findText) != -1;
}
function replyMessage(param: actionParamType, msg: string, at = false) {
  const ybot = YBot.getInstance();
  const { senderId, senderGroupId } = param;
  if (senderGroupId) {
    ybot.sendGroupMsg(senderGroupId, msg, at ? senderId : undefined);
  } else {
    ybot.sendPrivateMsg(senderId, msg)
  }
};

function helpTextRule(message: string) {
  return {
    hit: hasText(message, 'help') || hasText(message, '帮助')
  }
}
async function helpTextAction(param: actionParamType) {
  replyMessage(param, REPLYTEXT.helptext, true)
}