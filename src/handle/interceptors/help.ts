import { actionParamType } from '../../core/Interceptor';
import { hasText, replyMessage } from './utils';
import { helpText } from '../../customize/replyTextConfig';

function helpTextRule(message: string) {
  return {
    hit: hasText(message, 'help') || hasText(message, '帮助')
  }
}
function helpTextAction(param: actionParamType) {
  replyMessage(param, helpText, true)
}

export default {
  name: 'helpText',
  doRule: helpTextRule,
  doAction: helpTextAction
}