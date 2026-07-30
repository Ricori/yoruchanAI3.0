import nnkbot from '@/core/nnkBot';
import { printLog } from '@/utils/print';
import { getImgCode } from '@/utils/msgCode';
import { randomText, sleep } from '@/utils/function';
import { editImage, generateImage } from '@/service/imageGen';
import type { ToolDef } from '@/service/llm';
import { sendSegmentedReply } from '../replySender';

/**
 * 给模型用的画图工具。
 *
 * 出一张图要 20~90s，而群聊回复链路是同步阻塞的，所以这里**不等图**：
 * 工具立刻返回「已经开始画了」，模型照常出一句文字回复先发出去，
 * 后台画完再单独发一条图片消息。
 */

/** 默认出图尺寸 */
const DEFAULT_SIZE = '1024x1024';

/** 每群每日出图上限 */
const DEFAULT_DAILY_LIMIT = 5;

/** 同群两次出图之间的冷却（秒） */
const DEFAULT_COOLDOWN_SEC = 120;

/**
 * 图最早也要等这么久才发。
 *
 * 文字回复要先经过工具轮的网络往返、再经过 replySender 的打字延迟才发得完，
 * 万一哪天出图快得离谱，图先于文字落地就前言不搭后语了
 */
const MIN_DELIVER_DELAY = 5000;

const DRAW_IMAGE_TOOL: ToolDef = {
  name: 'draw_image',
  description: '画一张图发到群里。群友让你画点什么、或者话题聊到某个画面你想画给大家看的时候用。'
    + '图会在稍后自动发到群里，你不需要也不可以自己描述图的内容或者贴链接，'
    + '正常说一句话让对方稍等一下就行。',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '要画什么，尽量具体地描述画面内容、构图和风格，用中文或英文都可以',
      },
    },
    required: ['prompt'],
  },
};

const EDIT_IMAGE_TOOL: ToolDef = {
  name: 'edit_image',
  description: '以刚才那位群友发给你的那张图为底做修改，改完发到群里。'
    + '群友把图发给你（或者引用了一张图）并让你改点什么的时候用。'
    + '底图由系统自动带上，你不用管是哪张。改完的图会自动发出来，'
    + '你不需要也不可以自己描述图的内容或者贴链接。',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '要怎么改，描述改完之后画面应该是什么样子',
      },
    },
    required: ['prompt'],
  },
};

/** 有底图时才把 edit_image 一起下发；没底图就只给 draw_image */
export function getImageTools(hasSrcImg: boolean): ToolDef[] {
  return hasSrcImg ? [DRAW_IMAGE_TOOL, EDIT_IMAGE_TOOL] : [DRAW_IMAGE_TOOL];
}

/** 这个工具名是不是画图工具（generateReply 里分派用） */
export function isImageTool(name: string): boolean {
  return name === DRAW_IMAGE_TOOL.name || name === EDIT_IMAGE_TOOL.name;
}

function getConfig() {
  return nnkbot.config.aiReply.imageGen ?? {};
}

/** 这个群能不能画图。整块配置省略时默认开启，要关得显式写 enable: false */
export function isImageGenEnabled(groupId: number): boolean {
  const { enable = true, whiteGroupIds } = getConfig();
  if (!enable) return false;
  // 白名单留空即不启用白名单机制，与 hPic 的写法一致
  return !whiteGroupIds?.length || whiteGroupIds.includes(groupId);
}

/** 各群的出图额度，与 nnkStorage 一样只放内存，重启清零 */
const quota = new Map<number, { date: string, count: number, lastAt: number }>();

/** 正在出图的群。图没发出来之前不再接新的画图请求，也不主动插话 */
const drawing = new Set<number>();

/** 这个群的图是不是还在画 */
export function isDrawing(groupId: number): boolean {
  return drawing.has(groupId);
}

function today(): string {
  return new Date().toLocaleDateString();
}

/** 额度与冷却检查，通过返回 null，不通过返回给模型看的理由 */
function checkQuota(groupId: number): string | null {
  const { dailyLimit = DEFAULT_DAILY_LIMIT, cooldownSec = DEFAULT_COOLDOWN_SEC } = getConfig();
  const now = Date.now();
  const record = quota.get(groupId);

  // 跨天了就重新开始算
  if (!record || record.date !== today()) {
    quota.set(groupId, { date: today(), count: 0, lastAt: 0 });
    return null;
  }

  if (record.count >= dailyLimit) {
    return '今天画得太多了，已经画不动了，让对方明天再来。';
  }
  if (now - record.lastAt < cooldownSec * 1000) {
    return '刚画完一张还没缓过来，让对方等一会儿再说。';
  }
  return null;
}

/** 真的发起了一次出图才记账 */
function noteQuotaUsed(groupId: number) {
  const record = quota.get(groupId) ?? { date: today(), count: 0, lastAt: 0 };
  quota.set(groupId, { date: today(), count: record.count + 1, lastAt: Date.now() });
}

/** 出图失败时发的话。用人设的语气翻个车，比一声不吭强 */
const FAIL_TEXTS = [
  '呜哇 画到一半手滑了 || 这张不算',
  '欸 画崩了 || 乃乃香就当没画过',
  '呜呜 画不出来 || 下次一定',
];

/** 走 sendSegmentedReply 而不是直接发：翻车文案里的 `||` 是气泡分隔符，直接发会露出来 */
function sendFailText(groupId: number) {
  return sendSegmentedReply(randomText(FAIL_TEXTS), (msg) => nnkbot.sendGroupMsg(groupId, msg));
}

/** 后台跑的出图任务：画完发图，失败发翻车文案，无论如何都要解锁 */
async function deliverImage(groupId: number, task: Promise<string | null>, label: string) {
  const startedAt = Date.now();
  try {
    const file = await task;

    // 图不能比文字回复先到，不够 MIN_DELIVER_DELAY 就补上
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_DELIVER_DELAY) await sleep(MIN_DELIVER_DELAY - elapsed);

    if (!file) {
      printLog(`[ImageTool] ${label} 出图失败 (${groupId})`);
      await sendFailText(groupId);
      return;
    }

    printLog(`[ImageTool] ${label} 出图完成 (${groupId})，耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`);
    nnkbot.sendGroupMsg(groupId, getImgCode(file));
  } catch (e) {
    printLog(`[ImageTool] ${label} 出图异常 (${groupId}): ${e}`);
    await sendFailText(groupId);
  } finally {
    // 一定要解锁，否则一次失败就把这个群永久锁死
    drawing.delete(groupId);
  }
}

/**
 * 本地执行一次画图工具。任何情况都返回一段给模型看的文本，不抛异常。
 *
 * srcImgUrl 是改图的底图，只来自「提到 bot 的那条消息」本身或它引用的消息，
 * 没有就不会下发 edit_image
 */
export async function runImageTool(
  groupId: number,
  name: string,
  rawInput: unknown,
  srcImgUrl?: string,
): Promise<string> {
  const input = (rawInput ?? {}) as { prompt?: string };
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) {
    printLog(`[ImageTool] ${name} -> 缺少 prompt`);
    return '缺少 prompt 参数。';
  }

  if (!isImageGenEnabled(groupId)) {
    printLog(`[ImageTool] ${name} -> 本群未开启画图`);
    return '现在画不了图，告诉对方画不了就行。';
  }

  if (drawing.has(groupId)) {
    printLog(`[ImageTool] ${name} -> 上一张还在画`);
    return '上一张图还在画，画完才能画下一张，让对方先等等。';
  }

  const rejectReason = checkQuota(groupId);
  if (rejectReason) {
    printLog(`[ImageTool] ${name} -> ${rejectReason}`);
    return rejectReason;
  }

  if (name === 'edit_image' && !srcImgUrl) {
    // 正常情况下没底图就不会下发这个工具，走到这里说明模型硬调了
    printLog('[ImageTool] edit_image -> 没有底图');
    return '没有拿到要改的那张图，让对方把图重新发一遍。';
  }

  drawing.add(groupId);
  noteQuotaUsed(groupId);

  const { size = DEFAULT_SIZE } = getConfig();
  const task = name === 'edit_image'
    ? editImage(srcImgUrl!, prompt, size)
    : generateImage(prompt, size);

  printLog(`[ImageTool] ${name}(${prompt}) -> 开始出图 (${groupId})`);
  // 故意不 await：出图要 20~90s，等下去整条回复链路都得卡住
  deliverImage(groupId, task, name);

  return '已经开始画了，画完会自动发到群里。现在回一句话让对方稍等一下，不要描述图的内容。';
}
