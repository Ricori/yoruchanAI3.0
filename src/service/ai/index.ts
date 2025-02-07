import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import yorubot from '@/core/yoruBot';
import { printError } from '@/utils/print';
import yoruStorage from '@/core/yoruStorage';
import Axios from 'axios';
import FormData from 'form-data';
import { newSystemPrompt } from './systemText';
import { trimChar } from '@/utils/function';

let openai: OpenAI;
let model: string;
let thinkingChain = false;

export function generateAiObj(useDeepSeek: boolean) {
  //const baseURL = useDeepSeek ? 'https://api.deepseek.com' : 'https://api.openai-proxy.com/v1';
  const baseURL = useDeepSeek ? 'https://api.siliconflow.cn/v1' : 'https://api.openai-proxy.com/v1';
  const apiKey = useDeepSeek ? yorubot.config.aiReply.deepSeekKey : yorubot.config.aiReply.openAiKey;
  //model = useDeepSeek ? 'deepseek-reasoner' : 'gpt-4o';
  model = useDeepSeek ? 'Pro/deepseek-ai/DeepSeek-R1' : 'gpt-4o';

  yoruStorage.cleanGroupChatConversations();
  openai = new OpenAI({
    apiKey,
    baseURL,
  });
}
export function switchThinkingChainDisplay(display: boolean) {
  thinkingChain = display;
}

generateAiObj(yorubot.config.aiReply.useDeepSeek);


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

  if (imgUrl) {
    if (model !== 'gpt-4o') {
      return '看不得图，找管理切下chatgpt';
    };
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

  const chatCompletion = await openai.chat.completions.create({
    model,
    messages: commitMessages,
    temperature: 0.6,
  }, {
    timeout: 45000,
  }).catch((e) => printError(`[AiModule Error] ${e}`));

  if (chatCompletion?.choices?.[0]?.message) {
    const { message } = chatCompletion.choices[0];
    let newContent = trimChar(message.content, "\"")?.replace(/\（.*?\）/g, '').replace(/\(.*?\)/g, '');
    const newMsg = {
      role: message.role,
      content: newContent
    };
    yoruStorage.setGroupChatConversations(userId, [...messages, newMsg]);
    if (thinkingChain) {
      newContent = `---[夜夜的思考]---\n${(message as any).reasoning_content}\n----------------\n\n${newContent}`;
    }
    return newContent;
  }
  return undefined;
}

