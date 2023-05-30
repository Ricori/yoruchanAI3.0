// import { randomText } from '../utils/function';

// 不在功能范围时默认回复
export function getDefaultReply() {
  return '夜夜酱受到了特殊电波干扰，暂时没法回答主人的问题呢，主人可以过会儿重新询问夜夜酱哦';
  // return randomText([
  //   '渣滓主人请不要提过分的要求',
  //   '你说你🐎呢',
  // ]);
}
// 色图回复
export const hPicReplyText = {
  noAuth: '暂时不能为绿色健康的群提供色图功能呢', // 无权限群索要色图时回复
  serverError: '色图服务器爆炸啦，请帮忙联系下主人呢', // 服务器爆炸
  error: '发送色图错误，请主人等等再试试？', // 未知错误
};
// 搜图回复
export const searchImageText = {
  error: '搜索图片发生错误，请主人等等再试试？', // 未知错误
  whatAnimeToLarge: '图片过大，无法搜索动画',
  whatAnimeLimit: '搜索动画超限制',
  r18warn: '[R18 Waring]',
};

// 帮助文本
export const helpText = '有问题请联系开发者takamichikan，本帮助最后更新于2019年4月8日。';
