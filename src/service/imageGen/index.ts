import Axios from 'axios';
import FormData from 'form-data';
import { botConfig } from '@/core/nnkConfig';
import { printError } from '@/utils/print';

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

/**
 * 统一把上游返回归一化成 `base64://xxx`，可以直接塞进图片 CQ 码。
 *
 * 上游可能返 b64_json 也可能只返一个 url，后者不能直接丢给 QQ——
 * 那个域名从客户端不一定连得上，还是本地下下来再发更稳
 */
async function normalizeToBase64(data: any): Promise<string | null> {
  // 上游偶尔用 200 带 error 返回失败，不拦住的话会当成「没图」静默吞掉
  if (data?.error) {
    printError(`[ImageGen] 上游返回错误: ${JSON.stringify(data.error)}`);
    return null;
  }

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

/** 文生图。成功返回 `base64://xxx`，失败返回 null */
export async function generateImage(prompt: string, size: string): Promise<string | null> {
  const ret = await Axios.post(getUpstreamUrl('/v1/images/generations'), {
    prompt, size, n: 1, model: botConfig.apiKeys.imageGen.model,
  }, {
    headers: getAuthHeader(),
    timeout: IMAGE_TIMEOUT,
  }).catch((e) => {
    printError(`[ImageGen] 生成失败: ${describeError(e)}`);
    return null;
  });

  if (!ret) return null;
  return normalizeToBase64(ret.data);
}

/** 图生图：以 srcImgUrl 为底改图。成功返回 `base64://xxx`，失败返回 null */
export async function editImage(srcImgUrl: string, prompt: string, size: string): Promise<string | null> {
  const srcBuffer = await fetchImageBuffer(srcImgUrl);
  if (!srcBuffer) return null;

  const form = new FormData();
  // 上游按文件名后缀判类型，QQ 的图片链接常常不带后缀，统一按 png 送
  form.append('image', srcBuffer, { filename: 'image.png', contentType: 'image/png' });
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', '1');
  form.append('model', botConfig.apiKeys.imageGen.model);

  const ret = await Axios.post(getUpstreamUrl('/v1/images/edits'), form, {
    headers: { ...form.getHeaders(), ...getAuthHeader() },
    timeout: IMAGE_TIMEOUT,
  }).catch((e) => {
    printError(`[ImageGen] 改图失败: ${describeError(e)}`);
    return null;
  });

  if (!ret) return null;
  return normalizeToBase64(ret.data);
}
