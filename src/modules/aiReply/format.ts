import { getImgs, hasImage } from '@/utils/function';
import { hasAtUser, transformCQCodes } from '@/utils/msgCode';
import { BOT_NAME_ALIASES } from '@/constants';
import { SimpleMessageData } from '@/types/event';
import { FormattedMessage } from '../../types/message';

/** 将消息中的CQ码转换为对 LLM 友好的占位文本 */
function clean(rawText: string, cleanImage = false) {
  const text = transformCQCodes(rawText, (cq) => {
    switch (cq.type) {
      case 'face': return '[表情]';
      case 'video': return '[视频]';
      case 'record': return '[语音]';
      case 'forward': return '[聊天记录]';
      case 'json': {
        const desc = (cq.data.get('data') || '').match(/"desc"\s*:\s*"([^"]+)"/);
        return desc ? `分享了文章《${desc[1]}》` : '[卡片消息]';
      }
      case 'at':
      case 'reply':
        return '';
      case 'image':
        // 非 cleanImage 时保留原始图片CQ码，由后续逻辑决定去留
        return cleanImage ? '[图片]' : null;
      default:
        return null;
    }
  });
  return text.trimStart();
}


/** 动画表情、以及小于 60kb 的小图都当表情看待，不算「图片」 */
function isStickerImg(img: { file_size?: string, summary?: string }) {
  return img.summary === '[动画表情]' || Number(img.file_size || 0) < 60 * 1024;
}

/** 取被引用消息里的图片URL。改图要拿它当底图，正文里那句 `[之前的图片]` 只是给模型看的占位 */
function getRefImgUrl(replyMessage?: SimpleMessageData): string | undefined {
  if (!replyMessage || !hasImage(replyMessage.message)) return undefined;
  const img = getImgs(replyMessage.message, true)[0];
  return isStickerImg(img) ? undefined : img.url;
}

export function formatMessage(
  params: {
    selfId: number,
    userId: number,
    nickName: string,
    rawMessage: string,
    replyMessage?: SimpleMessageData,
    cleanImage: boolean
  },
): FormattedMessage {
  const {
    selfId, userId, nickName, rawMessage, replyMessage, cleanImage = false,
  } = params;

  let isMentionMe = hasAtUser(rawMessage, selfId);

  // 包含名字（或别名）也算被提到
  if (BOT_NAME_ALIASES.some((alias) => rawMessage.includes(alias))) {
    isMentionMe = true;
  }

  let prefix = '';

  // 四个 return 分支都要带上，别只加在其中一个
  const ref = getRefImgUrl(replyMessage);
  const refImgUrl = ref ? { refImgUrl: ref } : {};

  if (replyMessage) {
    const isBot = replyMessage.sender.user_id === selfId; // 是否引用自己的消息
    if (isBot) {
      isMentionMe = true;
    }
    prefix = `[${nickName}]回复了${isBot ? '我' : replyMessage.sender.nickname || ''}的消息`;
    const rtext = transformCQCodes(clean(replyMessage.message), (cq) => (cq.type === 'image' ? '[之前的图片]' : null));
    prefix += `(${rtext.slice(0, 90)})，说：`;
  } else {
    prefix = `[${nickName}]${isMentionMe ? '提到我' : ''}说：`;
  }


  if (!hasImage(rawMessage)) {
    return {
      role: 'user', userId, isMentionMe, message: prefix + clean(rawMessage), ...refImgUrl,
    };
  }

  if (cleanImage) {
    return {
      role: 'user', userId, isMentionMe, message: prefix + clean(rawMessage, true), ...refImgUrl,
    };
  }

  const img = getImgs(rawMessage, true)[0];

  if (isStickerImg(img)) {
    // 动画表情或小于60kb的图片视为表情，降成纯文本
    const text = transformCQCodes(clean(rawMessage), (cq) => (cq.type === 'image' ? '[表情]' : null)).trim();
    return {
      role: 'user', userId, isMentionMe, message: prefix + text, ...refImgUrl,
    };
  }

  return {
    role: 'user',
    userId,
    isMentionMe,
    message: prefix + clean(rawMessage, true),
    imgUrl: img.url,
    ...refImgUrl,
  };
}


export function formatAssistantMessage(
  text: string,
  initiative?: boolean,
  chance?: number | null,
  toolCalls = 0,
  mentionHits = 0,
): FormattedMessage {
  return {
    role: 'assistant',
    userId: 0,
    isMentionMe: false,
    message: text,
    ...(initiative === undefined ? {} : { initiative }),
    // 概率是浮点乘出来的，截断到 4 位免得日志里全是长尾数
    ...(chance === undefined || chance === null ? {} : { chance: Number(chance.toFixed(4)) }),
    ...(toolCalls > 0 ? { toolCalls } : {}),
    ...(mentionHits > 0 ? { mentionHits } : {}),
  };
}

export function formatInitiativePromptMessage(): FormattedMessage {
  return {
    role: 'user',
    userId: 0,
    isMentionMe: false,
    message: '（System：群友并没有@你，请根据上面的对话自然地随机插一句嘴，刷一下存在感）',
  };
}


/**
 * 出图状态提示（还在画 / 已发出 / 画崩了），正文由 imageGen/tools.ts 的 getDrawNotice 给出。
 * 不写死回复文案，交给模型自己用乃乃香的语气说
 */
export function formatDrawNoticeMessage(notice: string): FormattedMessage {
  return {
    role: 'user',
    userId: 0,
    isMentionMe: false,
    message: `（System：${notice}）`,
  };
}

export function formatUserMemoryPromptMessage(userMemoryContext: string): FormattedMessage | null {
  if (userMemoryContext === '') return null;
  return {
    role: 'user',
    userId: 0,
    isMentionMe: false,
    message: `（System：【群友档案】以下是你对这几位群友的印象，回复时自然运用即可，不要提及档案、资料、情报的存在，也不要逐条复述：\n${userMemoryContext}\n请继续回复上面对话中最后一条群友的消息）`,
  };
}
