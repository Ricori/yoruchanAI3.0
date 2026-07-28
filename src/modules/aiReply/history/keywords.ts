import { BOT_NAME_ALIASES } from '@/constants';
import { stripSpeakerPrefix } from '../memory/segment';

/**
 * 靠虚词硬切词的旧关键词抽取，已被 memory/segment.ts 的 jieba + TF-IDF 取代。
 * 这里只剩 generateReply.ts 的旧账通道还在用，等它改成工具召回后整个文件删掉
 */

/**
 * 虚词与高频字。它们自己不能当关键词，同时充当切词的分隔符——
 * 没有分词器，靠虚词把「我周末要去爬山」切成「周末」「爬山」，
 * 否则整句会变成一个 7 字片段，检索永远命不中。
 *
 * 「吃买看玩做」这类轻动词也放进来是有意的：切掉动词剩下的名词才是好检索词
 * （吃拉面→拉面、看电影→电影）。宁可切碎，反正最后按长度取最长的三个。
 */
const STOP_CHARS = '的了是在有我你他她它们这那什么怎就都也和跟把被给会要去来吗吧呢啊个不没很还上下'
  + '吃喝买看玩做用想说打过里到从但而然后因所以能可对着又才只再多少好';
const STOP_RE = new RegExp(`[${STOP_CHARS}]`, 'g');

/**
 * 切出来了但没有检索价值的词，两类：
 * 一是 CQ 码转成的占位符（[图片] [表情]），拿去检索只会捞回一堆同样发过图的记录；
 * 二是泛用动词和时间词，什么话题都沾边，命中的基本都是不相关的旧账
 */
const USELESS_WORDS = new Set([
  '图片', '表情', '视频', '语音', '记录', '聊天', '卡片', '消息', '分享', '文章', '之前',
  '记得', '知道', '觉得', '感觉', '时候', '这样', '那样', '现在', '今天', '明天', '昨天',
  '一样', '真的', '其实', '而且', '虽然', '如果', '为什', '怎样',
]);

/** 太短没有区分度，太长基本是整句，两头都命不中 */
const MIN_LEN = 2;
const MAX_LEN = 6;
/** 英文另算：两字母词（ai、pc）在群聊里满地都是，噪音远大于信息 */
const EN_MIN_LEN = 3;
const MAX_KEYWORDS = 3;

/**
 * 从一条群友消息里切出用于检索历史的关键词，按长度降序取前 3 个
 * （越长越具体，误命中越少）。bot 自己的名字会被排除，否则几乎每条都命中。
 */
export function extractKeywords(message: string): string[] {
  const body = stripSpeakerPrefix(message);
  const aliases = new Set<string>(BOT_NAME_ALIASES);

  const cnFragments = (body.match(/[一-龥]+/g) ?? [])
    .flatMap((run) => run.replace(STOP_RE, ' ').split(' '))
    .filter((w) => w.length >= MIN_LEN && !USELESS_WORDS.has(w));
  const enFragments = (body.match(/[a-zA-Z]+/g) ?? [])
    .map((word) => word.toLowerCase())
    .filter((w) => w.length >= EN_MIN_LEN);

  return [...new Set([...cnFragments, ...enFragments])]
    .filter((w) => w.length <= MAX_LEN && !aliases.has(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_KEYWORDS);
}
