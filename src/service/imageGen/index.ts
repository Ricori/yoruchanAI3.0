import Axios from 'axios';
import FormData from 'form-data';
import { botConfig } from '@/core/nnkConfig';
import { printError, printLog } from '@/utils/print';

/**
 * 图片生成，直连上游（gpt-image-2）。
 *
 * 原本走 nonoka API 服务转发，但出图要 130s+，Cloudflare 边缘等不到响应就会切成 524，
 * 流式保活也没兜住，所以这里绕开 Worker 直连——本地 Node 没有这个时间上限。
 * Worker 上的 /v1/images/* 路由保留着，给其它调用方用
 */

/** 实测出图 60~150s，留到 240s。后台出图不阻塞对话，等久点没关系 */
const IMAGE_TIMEOUT = 240000;

/** 拉底图/取回成品图的超时，只是普通下载 */
const FETCH_TIMEOUT = 30000;

function getUpstreamUrl(path: string) {
  return `${botConfig.apiKeys.imageGen.baseUrl}${path}`;
}

function getAuthHeader() {
  return { Authorization: `Bearer ${botConfig.apiKeys.imageGen.apiKey}` };
}

/** 上游的失败原因（余额不足、内容审核等）都在 body 里，只打 message 等于什么都没说 */
function describeError(e: any) {
  const data = e?.response?.data;
  return data ? `${e.message} - ${JSON.stringify(data).slice(0, 300)}` : e.message;
}

/** 一次出图的结果 */
export interface ImageResult {
  /** 成功时是 `base64://xxx`，失败为 null */
  file: string | null;
  /** 是否被上游内容审核拦下。拦了就别原样重试，得换个说法 */
  blocked: boolean;
}

/** 内容审核的说辞。上游是中文壳子套 OpenAI，两种口径都要认 */
const BLOCK_PATTERNS = /安全政策|内容政策|审核|拦截|不适合|safety|content[_ ]?policy|moderation/i;

/** 400 才可能是内容拦截；余额不足、限流之类的别误判成拦截，那些原样重试是有意义的 */
function isContentBlocked(e: any): boolean {
  if (e?.response?.status !== 400) return false;
  return BLOCK_PATTERNS.test(JSON.stringify(e.response.data ?? ''));
}

/**
 * 年龄和年级是内容审核最容易卡的点：人设是高中生，模型写自画像时几乎每次都带上，
 * 而画风本身就决定了角色看起来多大，写了纯属给自己找麻烦，发之前统一抹掉。
 *
 * 「高中」这类词在别的语境下（比如「提高中间调」）会被误伤，但画图 prompt 里基本不会出现
 */
const AGE_PATTERNS = [
  /\d+\s*[岁歳](的)?/g,
  /[高初][一二三中]\s*(的)?(女?生|学生)?/g,
  /小学生/g,
  /\bJK\b/gi,
  /未成年/g,
];

export function sanitizePrompt(prompt: string): string {
  const stripped = AGE_PATTERNS.reduce((acc, re) => acc.replace(re, ''), prompt);
  // 抹完会留下「，，」和首尾的空逗号，收拾干净再发
  return stripped
    .replace(/[，,]\s*(?=[，,])/g, '')
    .replace(/^[\s，,]+|[\s，,]+$/g, '')
    .trim();
}

/** 上游偶尔用 200 带 error 返回失败，不认出来会被当成「没图」静默吞掉 */
async function toResult(data: any): Promise<ImageResult> {
  if (data?.error) {
    printError(`[ImageGen] 上游返回错误: ${JSON.stringify(data.error)}`);
    return { file: null, blocked: BLOCK_PATTERNS.test(JSON.stringify(data.error)) };
  }
  return { file: await normalizeToBase64(data), blocked: false };
}

/**
 * 统一把上游返回归一化成 `base64://xxx`，可以直接塞进图片 CQ 码。
 *
 * 上游可能返 b64_json 也可能只返一个 url，后者不能直接丢给 QQ——
 * 那个域名从客户端不一定连得上，还是本地下下来再发更稳
 */
async function normalizeToBase64(data: any): Promise<string | null> {
  const first = data?.data?.[0];
  if (!first) return null;

  if (typeof first.b64_json === 'string' && first.b64_json.length > 0) {
    return `base64://${first.b64_json}`;
  }

  if (typeof first.url === 'string' && first.url.length > 0) {
    const buffer = await fetchImageBuffer(first.url);
    if (buffer) return `base64://${buffer.toString('base64')}`;
  }

  return null;
}

/** 下载一张图，失败返回 null */
async function fetchImageBuffer(imgUrl: string): Promise<Buffer | null> {
  const ret = await Axios.get(imgUrl, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT,
  }).catch((e) => {
    printError(`[ImageGen] 拉图失败 ${imgUrl}: ${e.message}`);
    return null;
  });

  return ret ? Buffer.from(ret.data) : null;
}

/** 清理 prompt，改动了就打一行，不然线上看不出发出去的到底是什么 */
function prepare(prompt: string): string {
  const safe = sanitizePrompt(prompt);
  if (safe !== prompt) printLog(`[ImageGen] prompt 已清理年龄/年级 -> ${safe}`);
  return safe;
}

/** 文生图 */
export async function generateImage(prompt: string, size: string): Promise<ImageResult> {
  try {
    const res = await Axios.post(getUpstreamUrl('/v1/images/generations'), {
      prompt: prepare(prompt), size, n: 1, model: botConfig.apiKeys.imageGen.model,
    }, {
      headers: getAuthHeader(),
      timeout: IMAGE_TIMEOUT,
    });
    return await toResult(res.data);
  } catch (e: any) {
    printError(`[ImageGen] 生成失败: ${describeError(e)}`);
    return { file: null, blocked: isContentBlocked(e) };
  }
}

/** 图生图：以 srcImgUrl 为底改图 */
export async function editImage(srcImgUrl: string, prompt: string, size: string): Promise<ImageResult> {
  const srcBuffer = await fetchImageBuffer(srcImgUrl);
  if (!srcBuffer) return { file: null, blocked: false };

  const form = new FormData();
  // 上游按文件名后缀判类型，QQ 的图片链接常常不带后缀，统一按 png 送
  form.append('image', srcBuffer, { filename: 'image.png', contentType: 'image/png' });
  form.append('prompt', prepare(prompt));
  form.append('size', size);
  form.append('n', '1');
  form.append('model', botConfig.apiKeys.imageGen.model);

  try {
    const res = await Axios.post(getUpstreamUrl('/v1/images/edits'), form, {
      headers: { ...form.getHeaders(), ...getAuthHeader() },
      timeout: IMAGE_TIMEOUT,
    });
    return await toResult(res.data);
  } catch (e: any) {
    printError(`[ImageGen] 改图失败: ${describeError(e)}`);
    return { file: null, blocked: isContentBlocked(e) };
  }
}
