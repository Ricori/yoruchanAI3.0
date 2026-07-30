import Axios from 'axios';
import FormData from 'form-data';
import { botConfig } from '@/core/nnkConfig';
import { printError } from '@/utils/print';

/**
 * 图片生成，同样只是把请求转发给 nonoka API 服务（上游是 gpt-image-2）
 */

/** 实测出图 60~130s，留到 140s：再久基本是上游卡住了，等下去也等不到 */
const IMAGE_TIMEOUT = 140000;

/** 拉底图/取回成品图的超时，只是普通下载 */
const FETCH_TIMEOUT = 30000;

function getServiceUrl(path: string) {
  const { baseUrl, apiKey } = botConfig.nonokaService;
  return `${baseUrl}${path}?apikey=${apiKey}`;
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

/** 文生图。成功返回 `base64://xxx`，失败返回 null */
export async function generateImage(prompt: string, size: string): Promise<string | null> {
  const ret = await Axios.post(getServiceUrl('/v1/images/generations'), {
    prompt, size, n: 1,
  }, {
    timeout: IMAGE_TIMEOUT,
  }).catch((e) => {
    printError(`[ImageGen] 生成失败: ${e.message}`);
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

  const ret = await Axios.post(getServiceUrl('/v1/images/edits'), form, {
    headers: form.getHeaders(),
    timeout: IMAGE_TIMEOUT,
  }).catch((e) => {
    printError(`[ImageGen] 改图失败: ${e.message}`);
    return null;
  });

  if (!ret) return null;
  return normalizeToBase64(ret.data);
}
