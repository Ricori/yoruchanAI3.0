import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import { getImgs, hasImage } from '@/utils/function';
import { GROUP_SYSTEM_PROMPT, PRIVATE_SYSTEM_PROMPT } from './prompt';

const client = new OpenAI({
  apiKey: yorubot.config.aiReply.apiKey,
  baseURL: yorubot.config.aiReply.baseUrl,
});


export function generateUserMessageParam(rawText: string, shouldCleanImg = false): ChatCompletionMessageParam {
  const text = rawText.replace(/\[CQ:face,.*\]/g, '[表情]')
    .replace(/\[CQ:json,data=\{[\s\S]*?"title":"([^"]+)"[\s\S]*?\}\]/, '分享了文章《$1》')
    .replace(/\[CQ:forward,.*\]/g, '[聊天记录]');
  if (hasImage(text)) {
    if (shouldCleanImg) {
      // 需要清理图片
      const cleanText = text.replace(/\[CQ:image,[^\]]+\]/g, '[图片]').trim();
      return {
        role: 'user',
        content: cleanText,
      };
    }
    const img = getImgs(text, true)[0];
    const imgUrl = img.url || '';
    const imgSize = Number(img.file_size || 0);
    if (img.summary === '[动画表情]' || imgSize < 120 * 1024) {
      // 包含表情标签，或者图片小于120kb认为是表情，降成纯文本
      const cleanText = text.replace(/\[CQ:image,[^\]]+\]/g, '[表情]').trim();
      return {
        role: 'user',
        content: cleanText,
      };
    }
    const plainText = text.replace(/\[CQ:image,.*\]/g, '[图片]');
    return {
      role: 'user',
      content: [
        { type: 'text', text: plainText || '[图片]' },
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
