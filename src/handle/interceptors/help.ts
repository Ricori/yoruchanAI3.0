import { actionParamType } from '../../core/Interceptor';
import { hasText, replyMessage } from './utils';
import { helpText } from '../../customize/replyTextConfig';
import YBot from '../../core/YBot';

function helpTextRule(message: string) {
  return {
    hit: hasText(message, 'help') || hasText(message, '帮助')
  }
}
function helpTextAction(param: actionParamType) {
  //replyMessage(param, helpText, true);

  const ybot = YBot.getInstance();
  param.groupId && ybot.sendForwardMsg(param.groupId, [
    {
      "type": "node",
      "data": {
        "name": "消息发送者A",
        "uin": "10086",
        "content": [
          {
            "type": "text",
            "data": { "text": "测试消息1" }
          }
        ]
      }
    },
    {
      "type": "node",
      "data": {
        "name": "消息发送者B",
        "uin": "10087",
        "content": "测试消息2"
      }
    }
  ])
}

export default {
  name: 'helpText',
  doRule: helpTextRule,
  doAction: helpTextAction
}