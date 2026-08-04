import http from 'http';
import nnkbot from '@/core/nnkBot';
import {
  SEARCH_TOOLS, isSearchEnabled, isSearchTool, runSearchTool,
} from '@/modules/aiReply/search/tools';

/**
 * 联网搜索工具的冒烟测试：`npx tsx ./test/search.ts`
 *
 * 自带一个假的 nonoka 服务，所以不会真的去烧 Tavily 的免费额度。
 * config.json 里的配置一概不参与
 */

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;

const GROUP = 10001;

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

/** 假服务端的返回模式 */
let mode: 'ok' | 'empty' | 'noAnswer' | 'fail' = 'ok';

/** 最近一次收到的请求体，用来验实际发出去的参数 */
let lastBody: any = null;

/** 收到过几次请求，用来验额度耗尽后是不是真的没再打上游 */
let hits = 0;

/** 超长摘要，用来验截断 */
const LONG_SNIPPET = '这是一段很长的摘要'.repeat(40);

function startStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (url.pathname !== '/search') {
        res.writeHead(404);
        res.end();
        return;
      }
      hits += 1;
      lastBody = JSON.parse(Buffer.concat(chunks).toString());

      if (mode === 'fail') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'search failed' }));
        return;
      }
      if (mode === 'empty') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results: [] }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        answer: mode === 'noAnswer' ? undefined : '东京今天多云，最高气温 31 度。',
        results: [
          {
            title: '东京都天气预报',
            url: 'https://www.jma.go.jp/bosai/forecast/',
            snippet: LONG_SNIPPET,
            date: '2026-08-04',
            site: 'jma.go.jp',
          },
          {
            title: 'Tokyo Weather Today',
            url: 'https://weather.com/tokyo',
            snippet: '多云转晴，降水概率 20%。',
          },
        ],
      }));
    });
  });
  server.listen(PORT, '127.0.0.1');
  return server;
}

/** 恢复默认的测试配置。每段测试都会改配置，不重置的话会污染后面的段落 */
function resetConfig() {
  nnkbot.config.aiReply.search = {
    enable: true, whiteGroupIds: [], dailyLimit: 20, count: 5,
  };
}

function testToolDef() {
  console.log('\n[tooldef] 工具定义');

  check('只下发一个 web_search', SEARCH_TOOLS.map((t) => t.name).join(',') === 'web_search');
  check('isSearchTool 认得自己', isSearchTool('web_search'));
  check('isSearchTool 不误伤别的工具', !isSearchTool('recall_chat') && !isSearchTool('draw_image'));

  // 描述要说清「什么时候该调」，只说功能的话模型不知道何时触发
  const desc = SEARCH_TOOLS[0].description;
  check('描述里写了该用的场合', desc.includes('新闻') && desc.includes('过期'), desc.slice(0, 60));
  check('描述里写了不该用的场合', desc.includes('不要用它查'), desc.slice(0, 60));
  // 群友的事和群里聊过的话各有专门的工具，说清楚免得它拿搜索去查群友
  check('描述里划清了和召回工具的界限', desc.includes('recall_memory') && desc.includes('recall_chat'));
}

async function testSwitch() {
  console.log('\n[switch] 开关与白名单');
  resetConfig();

  const saved = nnkbot.config.aiReply.search;
  nnkbot.config.aiReply.search = undefined;
  check('省略 search 配置 -> 默认开启', isSearchEnabled(50005));
  nnkbot.config.aiReply.search = { enable: false };
  check('显式 enable:false -> 关闭', !isSearchEnabled(50005));
  check('关闭时调用 -> 拒绝', (await runSearchTool(50005, 'web_search', { query: 'x' })).includes('现在查不了'));

  nnkbot.config.aiReply.search = { enable: true, whiteGroupIds: [GROUP] };
  check('在白名单内 -> 开启', isSearchEnabled(GROUP));
  check('不在白名单 -> 关闭', !isSearchEnabled(30003));
  nnkbot.config.aiReply.search = saved;
}

async function testSearch() {
  console.log('\n[search] 正常搜索与结果格式化');
  resetConfig();
  mode = 'ok';

  check('缺 query -> 拒绝', (await runSearchTool(GROUP, 'web_search', {})).includes('缺少 query'));
  check('空白 query -> 拒绝', (await runSearchTool(GROUP, 'web_search', { query: '   ' })).includes('缺少 query'));

  const out = await runSearchTool(GROUP, 'web_search', { query: '东京 天气' });
  check('带上概要', out.includes('【概要】') && out.includes('多云'), out.slice(0, 60));
  check('列出了每条结果', out.includes('东京都天气预报') && out.includes('Tokyo Weather Today'), out.slice(0, 80));
  check('带上日期与站点', out.includes('2026-08-04') && out.includes('jma.go.jp'), out.slice(0, 80));

  // 不加约束它会把 URL 整条贴进群里，和画图工具那边是同一个道理
  check('明确禁止贴网址', out.includes('不要贴网址'), out.slice(-80));
  check('结果里没有裸 URL', !out.includes('https://'), out);

  // 一次搜索的全文会在后续每轮里继续算 token，长度必须收得住
  check('超长摘要被截断', out.includes('…') && out.length < 700, `len=${out.length}`);

  mode = 'noAnswer';
  const noAnswer = await runSearchTool(GROUP, 'web_search', { query: '东京 天气' });
  check('上游没给概要也能用', !noAnswer.includes('【概要】') && noAnswer.includes('东京都天气预报'), noAnswer.slice(0, 60));
  mode = 'ok';
}

async function testParams() {
  console.log('\n[params] 参数透传');
  resetConfig();
  mode = 'ok';

  await runSearchTool(GROUP, 'web_search', { query: '原神 5.3', recency: 'week', topic: 'news' });
  check('query 透传', lastBody?.query === '原神 5.3', JSON.stringify(lastBody));
  check('recency -> timeRange', lastBody?.timeRange === 'week', JSON.stringify(lastBody));
  check('topic 透传', lastBody?.topic === 'news', JSON.stringify(lastBody));
  check('count 走配置', lastBody?.count === 5, JSON.stringify(lastBody));

  // 不填就不该带上，带了反而会把不随时间变的知识过滤掉
  await runSearchTool(GROUP, 'web_search', { query: '光合作用 原理' });
  check('不填 recency -> 不带 timeRange', lastBody?.timeRange === undefined, JSON.stringify(lastBody));
  check('不填 topic -> 不带 topic', lastBody?.topic === undefined, JSON.stringify(lastBody));

  nnkbot.config.aiReply.search!.count = 3;
  await runSearchTool(GROUP, 'web_search', { query: '测试' });
  check('count 可配', lastBody?.count === 3, JSON.stringify(lastBody));
}

async function testFailure() {
  console.log('\n[failure] 上游异常与空结果');
  resetConfig();

  mode = 'empty';
  const empty = await runSearchTool(GROUP, 'web_search', { query: '一个不存在的东西' });
  check('没搜到 -> 如实说', empty.includes('没搜到'), empty);
  check('没搜到 -> 明确不许硬编', empty.includes('别硬编'), empty);

  mode = 'fail';
  const failed = await runSearchTool(GROUP, 'web_search', { query: '东京 天气' });
  check('上游 502 -> 报查询出错', failed.includes('搜索出错'), failed);
  // 这句不能省：不说死的话它会顺着人设编一个「我查到了」出来
  check('上游 502 -> 明确不许装作查到', failed.includes('别装作查到了'), failed);
  mode = 'ok';
}

async function testQuota() {
  console.log('\n[quota] 每群每日额度');
  resetConfig();

  const g = 70007;
  nnkbot.config.aiReply.search!.dailyLimit = 2;

  check('第一次 -> 放行', (await runSearchTool(g, 'web_search', { query: 'a' })).includes('【概要】'));
  check('第二次 -> 放行', (await runSearchTool(g, 'web_search', { query: 'b' })).includes('【概要】'));

  hits = 0;
  const third = await runSearchTool(g, 'web_search', { query: 'c' });
  check('超日额 -> 拒绝', third.includes('今天查得太多了'), third);
  check('超日额 -> 明确不许提搜索', third.includes('别提搜索的事'), third);
  check('超日额 -> 根本没打上游', hits === 0, `hits=${hits}`);

  // 额度是按群算的，一个群刷爆不能影响别的群
  check('额度按群隔离', (await runSearchTool(80008, 'web_search', { query: 'd' })).includes('【概要】'));

  // 上游失败也要记账，否则一直失败等于把额度当成无限的往上游打
  const g2 = 90009;
  mode = 'fail';
  await runSearchTool(g2, 'web_search', { query: 'a' });
  await runSearchTool(g2, 'web_search', { query: 'b' });
  mode = 'ok';
  const afterFail = await runSearchTool(g2, 'web_search', { query: 'c' });
  check('失败也计入额度', afterFail.includes('今天查得太多了'), afterFail);
}

// 全部指向假服务端，config.json 里的真配置不参与
nnkbot.config.nonokaService = { baseUrl: BASE, apiKey: 'testkey', cdnHost: '' };
resetConfig();

const stub = startStub();

testToolDef();
await testSwitch();
await testSearch();
await testParams();
await testFailure();
await testQuota();

stub.close();
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
