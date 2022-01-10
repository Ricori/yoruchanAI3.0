import { randomText } from '../utils/function';

// 不在功能范围时默认回复
export function getDefaultReply() {
  return randomText([
    '渣滓主人请不要提过分的要求',
    '你说你🐎呢',
  ]);
}

const replyText = {
  // 番剧日程
  serchScheduleOk(date: string) { return `这是${date}的番剧日程，才不是特意为你找的哦\n`; },
  setuLimit: '真是恶心！你难道是性欲的集合体吗？', // 索要色图限制
  setuAbnormal: '没有色图了,再问自杀', // 色图功能出现Bug
  // 拒绝服务
  debugMode: '维护什么的真是讨厌啊！！！！！', // debug模式对普通用户回复
  refuse: '你是谁啊？！快滚啊！', // 拒绝为黑名单用户服务
  limitGroup: '主人没有允许的话，是不会帮你找东西的哦..', // 拒绝为非白名单群服务
} as any;

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
  r18warn: '!!!R18 Waring!!!',
};

// 帮助文本
export const helpText = '以下是一些夜夜酱的使用提示：\n'
  + '1.@夜夜酱并附带图片可以全网检索图片来源，加上“限定pixiv/danbooru/book/anime”关键词可以限定搜索来源；\n'
  + '2.@夜夜酱附带文本“开启/关闭搜图模式”，搜图模式下，群内所有图片都会被检索。'
  + '在此模式下可以直接发送pixiv/danbooru/book/anime来限定搜索来源。'
  + '手动未关闭情况下，该模式一段时间后将自动关闭，防止打扰群内正常聊天；\n'
  + '3.@夜夜酱附带关键词，如“我要看新番销量”、“1月番销量”、“19年4月番销量”等，可以查询各期番剧销量数据；\n'
  + '4.@夜夜酱附带关键词，如“今天有什么番”、“明天什么番”、“这周日什么番”、“20190411什么番”等，可以查询番剧日程；\n'
  + '5.附带关键词，如“我要瑟图”、“夜夜酱发瑟图”、“我想要一份瑟图”等，会有二次元福利。'
  + '图片已经过R18过滤，请不用太过担心。另外任何用户都可以发送“撤回”关键词撤回图片;\n'
  + '6.夜夜酱支持私聊，限制会有所放开；\n'
  + '7.如有问题请联系开发者takamichikan，本帮助最后更新于2019年4月8日。';

export default replyText;
