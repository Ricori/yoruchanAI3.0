import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import yoruStorage from '@/core/yoruStorage';
import Axios from 'axios';
import { trimChar } from '@/utils/function';
import { systemPrompt } from './prompt';

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
    const response = await Axios.get(imgUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
    }).catch((e) => {
      printError(`[AiModule Error] Can't fetch image. Error: ${e.message}`);
      return null;
    });

    if (!response) return null;
    const base64Img = Buffer.from(response.data).toString('base64');

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: text || '这张图里有什么内容？' },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Img}`,
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
    { timeout: 40000 },
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

