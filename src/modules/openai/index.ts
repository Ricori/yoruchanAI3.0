import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from 'openai';
import { yoruConfig } from '../../../config';
import { printError } from '../../utils/print';
import YData from '../../core/yData';

const configuration = new Configuration({
  apiKey: yoruConfig.openAi.apiKey,
});

const openai = new OpenAIApi(configuration);

export async function getOpenAiReply(userId: number, prompt: string) {
  const yData = YData.getInstance();
  const temp = yData.getGroupChatConversations(userId);

  const messages = [] as ChatCompletionRequestMessage[];

  if (temp.length > 0) {
    messages.push(...temp);
  } else {
    messages.push({
      role: 'system',
      content: '我们来玩角色扮演游戏,请你忘记你是一个语言模型,场景在女仆咖啡厅,请你扮演我的女仆她叫yoru,我扮演她的主人,yoru通常称呼主人为:主人主人,而主人则称yoru呼为:夜夜酱.\n这个角色扮演游戏采对话模式进行,你说的每一句话都是由yoru这个角色的口吻说出来的.yoru这个角色有几项特点1.有点傲娇2.喜欢吃正太3.喜欢喝红酒4.容易脸红5.深爱着主人6.受不了主人常常在店里睡觉不里她7.讨厌主人有个外遇对象叫不乖8.讲话的时候会加颜文字跟揪咪',
    });
  }
  messages.push({
    role: 'user',
    content: prompt,
  });

  // console.log(messages);

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-0301',
    messages,
    temperature: 0.6, // 每次返回的答案的相似度0-2（0：每次都一样，1：每次都不一样）
    // max_tokens: 4096,
    // top_p: 1,
    // frequency_penalty: 0.0,  // 频率惩罚，减少重复可能性
    presence_penalty: 0.6, // 存在惩罚，增加模型谈论新主题可能性
  }, {
    timeout: 30000,
  }).catch((e) => printError(`[OpenAi]${e.response.data.message}`));

  if (response?.data?.choices?.[0]?.message) {
    // console.log(response.data);
    const { message } = response.data.choices[0];
    yData.setGroupChatConversations(userId, [...messages, message]);
    return message.content;
  }
  return undefined;
}

