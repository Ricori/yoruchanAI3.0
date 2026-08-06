import Axios from 'axios';
import { BOT_NAME } from '@/constants';
import { botConfig } from '@/core/nnkConfig';
import { printError } from '@/utils/print';
import type { FormattedMessage } from '@/types/message';

/**
 * LLM 这里只负责把请求转发给 nonoka API 服务
 */

// 服务端 claude 单次 35s，超时会重试一次，最坏 70s，留足余量
const REPLY_TIMEOUT = 90000;
const COMMON_TIMEOUT = 50000;

/**
 * 工具决策轮的超时。这一轮模型只吐一个工具调用、输出极短，不该等满 90s；
 * 但也不能短过服务端「一次 35s + 超时重试一次」，否则 bot 会在服务端还在重试时先放弃。
 * 带工具时最坏耗时 = 这一轮 + 最终出文本那一轮
 */
const TOOL_ROUND_TIMEOUT = 75000;

function getServiceUrl(path: string) {
  const { baseUrl, apiKey } = botConfig.nonokaService;
  return `${baseUrl}${path}?apikey=${apiKey}`;
}

/** 只保留服务端认的字段，别把 userId、isMentionMe 这些本地状态发出去 */
function toDTO(formattedMessage: FormattedMessage[]) {
  return formattedMessage.map(({ role, message, imgUrl }) => ({ role, message, imgUrl }));
}

/** context 为当前群聊环境描述，服务端会作为 system 附加段落注入 */
export async function getLLMReply(
  formattedMessage: FormattedMessage[],
  context?: string,
): Promise<string | null> {
  const data = await postReply({ messages: toDTO(formattedMessage), context }, REPLY_TIMEOUT);
  return data?.text ?? null;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: object;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

interface ToolRound {
  use: ToolUse[];
  results: { id: string, content: string }[];
}

/** 本地执行一次工具调用，返回给模型看的文本 */
export type ToolRunner = (name: string, input: unknown) => Promise<string>;

/** 发一次 /llm/reply，可能拿到文本，也可能拿到「要调工具」 */
async function postReply(body: object, timeout: number) {
  const ret = await Axios.post(getServiceUrl('/llm/reply'), body, { timeout }).catch((e) => {
    printError(`[LLM reply error] ${e.message}`);
    return null;
  });
  return ret?.data ?? null;
}

/**
 * 带工具的回复。工具循环跑在 bot 这边——记忆数据都在本地，
 * 不能让服务端反向依赖 bot。
 *
 * 服务端无状态，所以每轮都要把之前的 tool_use 和执行结果一起带回去重建对话。
 * maxRounds 为 0 时只发一轮且不许调工具
 */
export async function getLLMReplyWithTools(
  formattedMessage: FormattedMessage[],
  context: string | undefined,
  tools: ToolDef[],
  runTool: ToolRunner,
  maxRounds: number,
): Promise<string | null> {
  const messages = toDTO(formattedMessage);
  const rounds: ToolRound[] = [];

  for (let round = 0; round <= maxRounds; round++) {
    const canUseTools = round < maxRounds;
    const data = await postReply({
      messages,
      context,
      // tools 每轮都照发：它排在缓存前缀最前面，末轮抽掉会让整段人设全价重算，
      // 省下的 1500 token 远不抵重写的 8000。改用 allowTools 逼模型出文本
      tools,
      allowTools: canUseTools,
      ...(rounds.length ? { toolRounds: rounds } : {}),
    }, canUseTools ? TOOL_ROUND_TIMEOUT : REPLY_TIMEOUT);

    if (!data) return null;
    if (data.stopReason !== 'tool_use') return data.text ?? null;

    const toolUse: ToolUse[] = Array.isArray(data.toolUse) ? data.toolUse : [];
    if (toolUse.length === 0) return null;

    // 模型一轮可能要调多个工具，全部执行完再一起回传
    const results = await Promise.all(toolUse.map(async (u) => ({
      id: u.id,
      content: await runTool(u.name, u.input).catch(() => '查询出错了，这次没有拿到结果。'),
    })));
    rounds.push({ use: toolUse, results });
  }

  return null;
}

export interface TopicSegment {
  summary: string;
  userIds: number[];
  lineFrom: number;
  lineTo: number;
}

/** 送去切话题的一行 */
export interface TopicLine {
  id: number;
  userId: number;
  /** 群友昵称，bot 自己的行是 null */
  nick: string | null;
  /** 已剥掉 `[昵称]说：` 前缀的正文 */
  body: string;
}

/** 单行正文的长度上限。转发的长公告整段发过去不划算，截断不影响概括 */
const MAX_LINE_CHARS = 200;

/**
 * 这一段被上游内容审核拒收了。和 null（暂时失败）区分开：
 * 拒收是确定性的，重试多少次都一样，调用方跳过这段继续即可
 */
export const TOPIC_REJECTED = Symbol('topicRejected');

/**
 * 把日志切成话题片段，每段一句概括，供每日巩固任务向量化。
 *
 * 行号和 QQ 号在 prompt 里换成这一段内的局部编号，昵称抽成一张表只出现一次：
 * 原样发的话它们要占掉六成字符，而正文长度的中位数只有八个字
 */
export async function segmentTopics(
  lines: TopicLine[],
): Promise<TopicSegment[] | typeof TOPIC_REJECTED | null> {
  if (lines.length === 0) return [];

  const userIds: number[] = [];
  const speakers: string[] = [];
  const payload = lines.map((l): [number, string] => {
    let s = userIds.indexOf(l.userId);
    if (s < 0) {
      s = userIds.push(l.userId) - 1;
      // bot 自己的行没有昵称，用本名而不是「你自己」：概括是拿去做语义检索的，
      // 写「你自己」的话问「乃乃香说过什么」就检索不到了
      speakers.push(l.userId === 0 ? BOT_NAME : l.nick || String(l.userId));
    }
    return [s, l.body.slice(0, MAX_LINE_CHARS)];
  });

  const ret = await Axios.post(getServiceUrl('/llm/topic'), { speakers, lines: payload }, {
    timeout: COMMON_TIMEOUT * 2,
  }).catch((e) => {
    printError(`[LLM topic error] ${e.message}`);
    return null;
  });

  if (ret?.data?.rejected) return TOPIC_REJECTED;

  const topics = ret?.data?.topics;
  if (!Array.isArray(topics)) return null;

  // 局部编号映射回真实的行 id 和 QQ 号
  return topics.flatMap((t): TopicSegment[] => {
    // 服务端还没更新到新协议时会返回真实行号，越界的丢掉，别把 undefined 写进库
    if (!lines[t.lineFrom] || !lines[t.lineTo]) return [];
    const ids = Array.isArray(t.speakers) ? t.speakers : [];
    return [{
      summary: t.summary,
      userIds: ids.map((s: number) => userIds[s]).filter((u: number) => u !== undefined),
      lineFrom: lines[t.lineFrom].id,
      lineTo: lines[t.lineTo].id,
    }];
  });
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
