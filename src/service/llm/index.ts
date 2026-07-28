import Axios from 'axios';
import { botConfig } from '@/core/nnkConfig';
import { printError } from '@/utils/print';
import type { FormattedMessage } from '@/types/message';

/**
 * LLM 这里只负责把请求转发给 nonoka API 服务
 */

// 服务端 claude 单次 35s，超时会重试一次，最坏 70s，留足余量
const REPLY_TIMEOUT = 90000;
const COMMON_TIMEOUT = 50000;

function getServiceUrl(path: string) {
  const { baseUrl, apiKey } = botConfig.nonokaService;
  return `${baseUrl}${path}?apikey=${apiKey}`;
}

/** context 为当前群聊环境描述，服务端会作为 system 附加段落注入 */
export async function getLLMReply(
  formattedMessage: FormattedMessage[],
  context?: string,
): Promise<string | null> {
  const messages = formattedMessage.map(({
    role, message, imgUrl, cacheControl,
  }) => ({
    role, message, imgUrl, cacheControl,
  }));

  const ret = await Axios.post(getServiceUrl('/llm/reply'), { messages, context }, {
    timeout: REPLY_TIMEOUT,
  }).catch((e) => {
    printError(`[LLM reply error] ${e.message}`);
    return null;
  });

  return ret?.data?.text ?? null;
}

export interface MemoryOpDTO {
  op: 'ADD' | 'UPDATE' | 'DELETE';
  id?: number;
  kind?: string;
  text?: string;
  confidence?: number;
}

/**
 * 抽取新记忆并与已有条目调和，返回对档案的增删改操作。
 *
 * 失败返回 null，和「确实没有变化」的空数组区分开——
 * 前者要把这批消息放回缓冲区重试，后者不能重试
 */
export async function extractMemory(
  nickName: string,
  messages: string[],
  existing: { id: number, kind: string, text: string, pinned: boolean }[],
): Promise<MemoryOpDTO[] | null> {
  const ret = await Axios.post(getServiceUrl('/llm/memory/extract'), {
    nickName, messages, existing,
  }, {
    timeout: COMMON_TIMEOUT,
  }).catch((e) => {
    printError(`[LLM memory extract error] ${e.message}`);
    return null;
  });

  const ops = ret?.data?.ops;
  return Array.isArray(ops) ? ops : null;
}

/**
 * 文本向量化。维度不写死，由调用方从返回值推断
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];

  const ret = await Axios.post(getServiceUrl('/llm/embed'), { texts }, {
    timeout: COMMON_TIMEOUT,
  }).catch((e) => {
    printError(`[LLM embed error] ${e.message}`);
    return null;
  });

  const vectors = ret?.data?.vectors;
  return Array.isArray(vectors) && vectors.length === texts.length ? vectors : null;
}

/** 调用LLM翻译 */
export async function translateText(text: string, lang = 'cn'): Promise<string | null> {
  const ret = await Axios.post(getServiceUrl('/llm/translate'), { text, lang }, {
    timeout: COMMON_TIMEOUT,
  }).catch((e) => {
    printError(`[LLM translate error] ${e.message}`);
    return null;
  });

  return ret?.data?.text ?? null;
}
