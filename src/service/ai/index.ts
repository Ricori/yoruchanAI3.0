import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import yoruStorage from '@/core/yoruStorage';
import Axios from 'axios';
import FormData from 'form-data';
import { trimChar } from '@/utils/function';
import { systemPrompt } from './systemText';

const client = new OpenAI({
  apiKey: yorubot.config.aiReply.moonshotKey,
  baseURL: 'https://api.moonshot.cn/v1',
});

export async function getAiReply(userId: number, text: string, imgUrl?: string) {
  const messages = [] as ChatCompletionMessageParam[];
  const systemMsg: ChatCompletionMessageParam = {
    role: 'system',
    content: systemPrompt,
  };

  const temp = yoruStorage.getGroupChatConversations(userId);
  if (temp.length > 0) {
    messages.push(...temp);
  }

  if (imgUrl) {
    // 图片转存 (QQ -> imgbb)
    const imgBuffer = await Axios.get(imgUrl, { responseType: 'arraybuffer' }).then((r) => r.data).catch((e) => {
      printError(`[AiModule Error] Can't fetch QQ img. Error: ${e.message}`);
      return null;
    });
    if (!imgBuffer) return undefined;
    const form = new FormData();
    form.append('image', imgBuffer, 'image');
    const ret = await Axios.post('https://api.imgbb.com/1/upload', form, {
      params: {
        key: 'a8a68ddaf156ea21809cf39d6c7481c8',
        expiration: 86400 * 7,
      },
    }).catch((e) => {
      printError(`[AiModule Error] Cant't upload file to imgbb. Error: ${e.message}`);
      return null;
    });
    if (!ret || !ret?.data?.success || !ret?.data?.data?.url) return undefined;
    const convertedImgUrl = ret.data.data.url;
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text },
        {
          type: 'image_url',
          image_url: {
            url: convertedImgUrl,
          },
        },
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: text,
    });
  }

  const commitMessages = [systemMsg, ...messages];

  const completion = await client.chat.completions.create(
    {
      model: 'kimi-k2.5',
      messages: commitMessages,
    },
    { timeout: 20000 },
  ).catch((e) => printError(`[AiModule Error] ${e}`));

  if (completion?.choices?.[0]?.message) {
    const { message } = completion.choices[0];
    const newContent = trimChar(message.content, '"')?.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');

    yoruStorage.setGroupChatConversations(
      userId,
      [
        ...messages,
        {
          role: message.role,
          content: newContent,
        },
      ],
    );
    return newContent;
  }
  return undefined;
}

