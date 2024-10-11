import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import yoruStorage from '@/core/yoruStorage';
import Axios from 'axios';
import FormData from 'form-data';
import { systemContent } from './systemText';

const openai = new OpenAI({
  apiKey: yorubot.config.openAi.apiKey,
  baseURL: 'https://api.openai-proxy.com/v1',
});


export async function getOpenAiReply(userId: number, text: string, imgUrl?: string) {

  const messages = [] as ChatCompletionMessageParam[];
  const systemMsg: ChatCompletionMessageParam = {
    role: 'system',
    content: systemContent,
  };

  const temp = yoruStorage.getGroupChatConversations(userId);
  if (temp.length > 0) {
    messages.push(...temp);
  }

  if (imgUrl) {
    // 图片转存 (QQ -> imgbb)
    const imgBuffer = await Axios.get(imgUrl, { responseType: 'arraybuffer' }).then((r) => r.data).catch((e) => {
      printError(`[OpenAi Error] Can't fetch QQ img. Error: ${e.message}`);
      return null;
    });
    if (!imgBuffer) return undefined;
    const form = new FormData();
    form.append('image', imgBuffer, 'image');
    const ret = await Axios.post('https://api.imgbb.com/1/upload', form, {
      params: {
        key: 'a8a68ddaf156ea21809cf39d6c7481c8',
        expiration: 86400 * 7
      }
    }).catch((e) => {
      printError(`[OpenAi Error] Cant't upload file to imgbb. Error: ${e.message}`);
      return null;
    });
    if (!ret || !ret?.data?.success || !ret?.data?.data?.url) return undefined;
    const convertedImgUrl = ret.data.data.url;
    messages.push({
      role: 'user',
      content: [
        { type: "text", text },
        {
          type: "image_url",
          image_url: {
            "url": convertedImgUrl,
          },
        }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: text,
    });
  }

  const commitMessages = [systemMsg, ...messages];
  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: commitMessages,
    temperature: 0.7, // 每次返回的答案的相似度0-2（0：每次都一样，1：每次都不一样）
    presence_penalty: 0.7, // 存在惩罚，增加模型谈论新主题可能性
  }, {
    timeout: 25000,
  }).catch((e) => printError(`[OpenAi Error] ${e}`));

  if (chatCompletion?.choices?.[0]?.message) {
    const { message } = chatCompletion.choices[0];
    yoruStorage.setGroupChatConversations(userId, [...messages, message]);
    return message.content?.replace('夜夜酱：', '');
  }
  return undefined;
}

