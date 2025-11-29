import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import yoruStorage from '@/core/yoruStorage';
import Axios from 'axios';
import FormData from 'form-data';
import { newSystemPrompt } from './systemText';
import { trimChar } from '@/utils/function';

// 双模型应对不同场景
const deepseekObj = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: yorubot.config.aiReply.deepSeekKey,
});;
const chatgptObj = new OpenAI({
  baseURL: 'https://api.openai-proxy.com/v1',
  apiKey: yorubot.config.aiReply.openAiKey,
});;

// 主回复 model
let useModel = 'deepseek';  // deepseek, chatgpt
let modelName = 'deepseek-reasoner';  // deepseek-reasone, gpt-5.1
const hasOpenAiKey = yorubot.config.aiReply.openAiKey !== '';
export function changeModel(model: 'deepseek' | 'chatgpt') {
  yoruStorage.cleanGroupChatConversations();
  useModel = model;
}
export async function getAiReply(userId: number, text: string, imgUrl?: string) {

  const messages = [] as ChatCompletionMessageParam[];
  const systemMsg: ChatCompletionMessageParam = {
    role: 'system',
    content: newSystemPrompt,
  };

  const temp = yoruStorage.getGroupChatConversations(userId);
  if (temp.length > 0) {
    messages.push(...temp);
  }

  let nowUse = useModel;
  let nowUseModelName = modelName;

  if (imgUrl) {
    // 有图的情况下，临时使用chatgpt model
    if (hasOpenAiKey) {
      nowUse = 'chatgpt';
      nowUseModelName = 'gpt-5.1'
    } else {
      return '未配置openai key，无法解析图片';
    }
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
        expiration: 86400 * 7
      }
    }).catch((e) => {
      printError(`[AiModule Error] Cant't upload file to imgbb. Error: ${e.message}`);
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
  };

  const commitMessages = [systemMsg, ...messages];

  let chatCompletion: OpenAI.Chat.Completions.ChatCompletion | void;
  const config = {
    model: nowUseModelName,
    messages: commitMessages,
    temperature: 1.3,
  }
  if (nowUse === 'chatgpt') {
    chatCompletion = await chatgptObj.chat.completions.create(config, { timeout: 20000 })
      .catch((e) => printError(`[AiModule Error] ${e}`));
  } else {
    chatCompletion = await deepseekObj.chat.completions.create(config, { timeout: 20000 })
      .catch((e) => printError(`[AiModule Error] ${e}`));
  }

  if (chatCompletion?.choices?.[0]?.message) {
    const { message } = chatCompletion.choices[0];
    let newContent = trimChar(message.content, "\"")?.replace(/\（.*?\）/g, '').replace(/\(.*?\)/g, '');
    const newMsg = {
      role: message.role,
      content: newContent
    };
    yoruStorage.setGroupChatConversations(userId, [...messages, newMsg]);
    return newContent;
  }
  return undefined;
}

