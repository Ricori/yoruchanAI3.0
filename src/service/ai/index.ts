import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import { getImgs, hasImage } from '@/utils/function';

import { imgTransferToImgbb } from '@/utils/imgbb';
import { GROUP_SYSTEM_PROMPT, PRIVATE_SYSTEM_PROMPT } from './prompt';

const client = new OpenAI({
  apiKey: yorubot.config.aiReply.apiKey,
  baseURL: yorubot.config.aiReply.baseUrl,
});


export function generateUserMessageParam(rawText: string, imgClean = false): ChatCompletionMessageParam {
  const text = rawText.replace(/\[CQ:face,.*\]/g, '[表情]')
    .replace(/\[CQ:json,data=\{[\s\S]*?"title":"([^"]+)"[\s\S]*?\}\]/, '分享了文章《$1》')
    .replace(/\[CQ:forward,.*\]/g, '[聊天记录]');
  if (hasImage(text)) {
    if (imgClean) {
      const cqImageRegex = /\[CQ:image,[^\]]+\]/g;
      const cleanText = text.replace(cqImageRegex, '[图片]').trim();
      return {
        role: 'user',
        content: cleanText,
      };
    }
    const imgUrl = getImgs(text)[0].url || '';
    const plainText = text.replace(/\[CQ:image,.*\]/g, '').replace(/\[CQ:face,.*\]/g, '');
    return {
      role: 'user',
      content: [
        { type: 'text', text: plainText || '看看这张图' },
        {
          type: 'image_url',
          image_url: {
            url: imgUrl,
          },
        },
      ],
    };
  }
  return {
    role: 'user',
    content: text,
  };
}


async function generateUserMessageParamWithTransfer(rawText: string): Promise<ChatCompletionMessageParam | null> {
  if (hasImage(rawText)) {
    let imgUrl: string | null = getImgs(rawText)[0].url;
    const plainText = rawText.replace(/\[CQ:image,.*\]/g, '');
    imgUrl = await imgTransferToImgbb(imgUrl);
    if (!imgUrl) return null;
    return {
      role: 'user',
      content: [
        { type: 'text', text: plainText || '看看这张图' },
        {
          type: 'image_url',
          image_url: {
            url: imgUrl,
          },
        },
      ],
    };
  }
  return {
    role: 'user',
    content: rawText,
  };
}


export function generateAssistantMessageParam(text: string): ChatCompletionMessageParam {
  return {
    role: 'assistant',
    content: text,
  };
}

export async function getAiReply(messageParam: ChatCompletionMessageParam[], isGroup = true) {
  const systemMsg: ChatCompletionMessageParam = {
    role: 'system',
    content: isGroup ? GROUP_SYSTEM_PROMPT : PRIVATE_SYSTEM_PROMPT,
  };

  const messagesToAPI: ChatCompletionMessageParam[] = [systemMsg, ...messageParam];

  const response = await client.chat.completions.create(
    {
      model: 'kimi-k2.5',
      messages: messagesToAPI,
      temperature: 0.8,
      max_tokens: 100,
    },
    { timeout: 30000 },
  ).catch((e) => printError(`[AiReply Error] ${e}`));

  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content as string;
  }

  return null;
}
