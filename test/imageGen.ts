import http from 'http';
import nnkbot from '@/core/nnkBot';
import { formatMessage } from '@/modules/aiReply/format';
import {
  getDrawNotice, getImageTools, isDrawing, isImageGenEnabled, runImageTool,
} from '@/modules/aiReply/imageGen/tools';
import messageStorage from '@/modules/aiReply/storage/message';
import { editImage, generateImage, sanitizePrompt } from '@/service/imageGen';
import { sleep } from '@/utils/function';

/**
 * 画图工具的冒烟测试：`npx tsx ./test/imageGen.ts`
 *
 * 自带一个假的上游，跑之前把 apiKeys.imageGen.baseUrl 指过去，
 * 所以不会真的去烧上游的出图额度。config.json 里的配置一概不参与。
 * 「发到群里」那步会因为没连 WS 而打一行 WS Call Error，是预期内的
 */

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;

/** 1x1 透明 png */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const GROUP = 10001;
const SELF = 999;

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

/**
 * 假上游。generations 按 mode 分别返 b64_json 和 url，两条归一化分支都要走到；
 * fail 用来模拟线上那个 524（上游出图卡在网关超时线上）
 */
let mode: 'b64' | 'url' | 'fail' | 'blocked' = 'b64';

/** 上游内容审核拒收时的真实返回 */
const BLOCK_BODY = JSON.stringify({
  error: {
    message: '您的请求无法用于生成图像。该请求可能因安全政策被拦截，或不适合进行图像生成。',
    type: 'invalid_request_error',
    param: '',
    code: 400,
  },
});

/** 最近一次 generations 收到的请求体，用来验 prompt 到底是怎么发出去的 */
let lastGenBody = '';

function startStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', BASE);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (url.pathname === '/src.png' || url.pathname === '/remote.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from(PNG_B64, 'base64'));
        return;
      }
      if (url.pathname === '/v1/images/generations') {
        if (mode === 'fail') {
          res.writeHead(524);
          res.end();
          return;
        }
        if (mode === 'blocked') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(BLOCK_BODY);
          return;
        }
        lastGenBody = Buffer.concat(chunks).toString();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mode === 'url'
          ? { data: [{ url: `${BASE}/remote.png` }] }
          : { data: [{ b64_json: PNG_B64 }] }));
        return;
      }
      if (url.pathname === '/v1/images/edits') {
        const text = Buffer.concat(chunks).toString('latin1');
        // 底图和 prompt 得真的进了 multipart，不然改图请求是空的
        check('edits 请求带上了底图与 prompt', text.includes('name="image"') && text.includes('name="prompt"'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  server.listen(PORT, '127.0.0.1');
  return server;
}

function replyMsg(message: string) {
  return {
    message_id: 1, self_id: SELF, user_id: 2, sender: { user_id: 2, nickname: '张三' }, message,
  } as any;
}

const IMG_CQ = `[CQ:image,file=a.png,url=${BASE}/src.png,file_size=200000]`;
const STICKER_CQ = `[CQ:image,file=b.png,url=${BASE}/src.png,file_size=1000,summary=&#91;动画表情&#93;]`;

/** 底图只认「提到 bot 的那条消息」自己带的图或它引用的图 */
function testFormat() {
  console.log('\n[format] 底图来源');

  const own = formatMessage({
    selfId: SELF, userId: 2, nickName: '张三', rawMessage: `乃乃香 ${IMG_CQ} 改成夜景`, cleanImage: false,
  });
  check('自己带图 -> imgUrl', own.imgUrl === `${BASE}/src.png`, String(own.imgUrl));
  check('自己带图 -> 无 refImgUrl', own.refImgUrl === undefined, String(own.refImgUrl));

  const quoted = formatMessage({
    selfId: SELF,
    userId: 3,
    nickName: '李四',
    rawMessage: '乃乃香 把这张改成夜景',
    replyMessage: replyMsg(IMG_CQ),
    cleanImage: false,
  });
  check('引用带图 -> refImgUrl', quoted.refImgUrl === `${BASE}/src.png`, String(quoted.refImgUrl));
  check('引用带图 -> 正文无 imgUrl', quoted.imgUrl === undefined, String(quoted.imgUrl));

  const quotedSticker = formatMessage({
    selfId: SELF,
    userId: 3,
    nickName: '李四',
    rawMessage: '乃乃香 改一下',
    replyMessage: replyMsg(STICKER_CQ),
    cleanImage: false,
  });
  check('引用的是表情 -> 不算底图', quotedSticker.refImgUrl === undefined, String(quotedSticker.refImgUrl));

  const plain = formatMessage({
    selfId: SELF, userId: 4, nickName: '王五', rawMessage: '乃乃香 在吗', cleanImage: false,
  });
  check('纯文本 -> 无 refImgUrl', plain.refImgUrl === undefined, String(plain.refImgUrl));
}

async function testService() {
  console.log('\n[service] 上游返回归一化');

  const generated = await generateImage('一只兔耳朵的动漫女孩', '1024x1024');
  check('返 b64_json -> base64://', !!generated.file?.startsWith('base64://'), String(generated.file).slice(0, 40));

  mode = 'url';
  const fromUrl = await generateImage('一只兔耳朵的动漫女孩', '1024x1024');
  check('只返 url -> 下载后转 base64://', !!fromUrl.file?.startsWith('base64://'), String(fromUrl.file).slice(0, 40));
  mode = 'b64';

  const edited = await editImage(`${BASE}/src.png`, '改成夜景', '1024x1024');
  check('editImage -> base64://', !!edited.file?.startsWith('base64://'), String(edited.file).slice(0, 40));

  const badSrc = await editImage(`${BASE}/404.png`, '改成夜景', '1024x1024');
  check('底图拉不到 -> null', badSrc.file === null, String(badSrc.file));
  check('底图拉不到不算内容拦截', badSrc.blocked === false);
}

/**
 * prompt 里的年龄/年级要在送到上游之前抹掉。
 *
 * 人设是高中生，模型写自画像时几乎每次都会带上「15岁高一」，
 * 而这正是内容审核最容易卡的点，线上已经因此翻过车
 */
async function testSanitize() {
  console.log('\n[sanitize] 年龄与年级清理');

  check('抹掉岁数与年级', sanitizePrompt('动画风格，15岁高一少女，金色双马尾') === '动画风格，少女，金色双马尾', sanitizePrompt('动画风格，15岁高一少女，金色双马尾'));
  check('抹掉「高中生」', sanitizePrompt('一个高中生，站在天台') === '一个，站在天台', sanitizePrompt('一个高中生，站在天台'));
  check('抹掉 JK 与初中', sanitizePrompt('JK 制服，初二女生') === '制服', sanitizePrompt('JK 制服，初二女生'));
  check('不含年龄的 prompt 原样不动', sanitizePrompt('夜晚的便利店门口，少女') === '夜晚的便利店门口，少女');

  // 模型是随机挑语言写 prompt 的，只拦中文等于没拦——线上就是栽在整段英文上
  const en = sanitizePrompt('A cute 15-year-old anime girl with twin-tails, wearing a high school uniform. Soft lighting.');
  check('抹掉 15-year-old', !/15|year[\s-]?old/i.test(en), en);
  check('抹掉 high school', !/high[\s-]?school/i.test(en), en);
  check('英文主体没被误伤', en.includes('anime girl') && en.includes('uniform') && en.includes('Soft lighting'), en);
  check('英文不留多余空格', !/\s{2,}|\s[,.]/.test(en), en);
  check('抹掉 teenage / schoolgirl', sanitizePrompt('a teenage schoolgirl in a park') === 'a in a park', sanitizePrompt('a teenage schoolgirl in a park'));

  // 光测纯函数不够，要确认它真的接在了发请求的路上
  await generateImage('15岁高一少女，金色双马尾，水手服', '1024x1024');
  check('清理后的 prompt 才发给上游', !/15岁|高一/.test(lastGenBody), lastGenBody.slice(0, 100));
  check('prompt 主体没被误伤', lastGenBody.includes('金色双马尾') && lastGenBody.includes('水手服'), lastGenBody.slice(0, 100));
}

/** 后台出图那一轮跑完要多久：发图前 5s 最小延迟 + 配图文案的分段打字延迟 */
const DELIVER_WAIT = 9000;

/** 恢复默认的测试配置。每段测试都会改配置，不重置的话会污染后面的段落 */
function resetConfig() {
  nnkbot.config.aiReply.imageGen = {
    enable: true, whiteGroupIds: [], dailyLimit: 2, cooldownSec: 0, size: '1024x1024',
  };
}

async function testTools() {
  console.log('\n[tools] 工具下发与限流');
  resetConfig();

  check('无底图 -> 只下发 draw_image', getImageTools(false).map((t) => t.name).join(',') === 'draw_image');
  check('有底图 -> 两个工具都下发', getImageTools(true).map((t) => t.name).join(',') === 'draw_image,edit_image');

  check('缺 prompt -> 拒绝', (await runImageTool(GROUP, 'draw_image', {})).includes('缺少 prompt'));
  check('edit 无底图 -> 拒绝', (await runImageTool(GROUP, 'edit_image', { prompt: 'x' })).includes('没有拿到要改的那张图'));
  check('拒绝时未上锁', !isDrawing(GROUP));

  const first = await runImageTool(GROUP, 'draw_image', { prompt: '一只兔子' });
  check('第一次 -> 开始画', first.includes('已经开始画了'), first);
  // 工具返回值必须把「现在还没画完」说死，否则模型被追问几轮就会自己宣布画好了
  check('返回值声明图还没出来', first.includes('还没出来'), first);
  check('出图期间 isDrawing 为真', isDrawing(GROUP));

  const second = await runImageTool(GROUP, 'draw_image', { prompt: '再来一只' });
  check('在画时再调 -> 拒绝', second.includes('上一张图还在画'), second);

  // 等后台那一轮跑完（含发图前 5s 的最小延迟，以及配图文案的打字延迟）
  await sleep(DELIVER_WAIT);
  check('出图完成后解锁', !isDrawing(GROUP));

  // dailyLimit=2 / cooldownSec=0：第二张还能画，第三张该被日额挡下
  const third = await runImageTool(GROUP, 'draw_image', { prompt: '第二张' });
  check('第二张 -> 开始画', third.includes('已经开始画了'), third);
  await sleep(DELIVER_WAIT);

  const fourth = await runImageTool(GROUP, 'draw_image', { prompt: '第三张' });
  check('超日额 -> 拒绝', fourth.includes('今天画得太多了'), fourth);
  check('超日额时未上锁', !isDrawing(GROUP));

  nnkbot.config.aiReply.imageGen!.enable = false;
  check('关闭开关 -> 拒绝', (await runImageTool(20002, 'draw_image', { prompt: 'x' })).includes('现在画不了图'));
  nnkbot.config.aiReply.imageGen!.enable = true;

  nnkbot.config.aiReply.imageGen!.whiteGroupIds = [GROUP];
  check('不在白名单 -> 拒绝', (await runImageTool(30003, 'draw_image', { prompt: 'x' })).includes('现在画不了图'));

  // 整块配置省略时默认开启，要关得显式写 enable: false
  const saved = nnkbot.config.aiReply.imageGen;
  nnkbot.config.aiReply.imageGen = undefined;
  check('省略 imageGen 配置 -> 默认开启', isImageGenEnabled(50005));
  nnkbot.config.aiReply.imageGen = { enable: false };
  check('显式 enable:false -> 关闭', !isImageGenEnabled(50005));
  nnkbot.config.aiReply.imageGen = saved;
}

/**
 * 出图状态注入与历史回写。
 *
 * 线上翻过的车：图 04:25:18 才落地，模型 04:23:19 就喊「画好了！」。
 * 根因是后台发图和翻车文案都不走 generateReply，模型的上下文里
 * 只看得到「还在画」，另外两个终局全丢了，被追问几轮就只能自己编
 */
async function testNotice() {
  console.log('\n[notice] 出图状态注入与历史回写');
  resetConfig();

  const g = 40004;
  check('没画过 -> 无提示', getDrawNotice(g) === null, String(getDrawNotice(g)));

  await runImageTool(g, 'draw_image', { prompt: '一只兔子' });
  const drawingNotice = getDrawNotice(g) ?? '';
  check('画的过程中 -> 提示还在画', drawingNotice.includes('还在画'), drawingNotice);
  check('画的过程中 -> 明确禁止说画好了', drawingNotice.includes('画好了'), drawingNotice);

  await sleep(DELIVER_WAIT);

  // 图交了之后模型必须知道，否则它会接着说「还在画」或者再画一张
  const doneNotice = getDrawNotice(g) ?? '';
  check('图发出后 -> 提示已发到群里', doneNotice.includes('已经发到群里'), doneNotice);
  check('图发出后 -> 提示里带上画的是什么', doneNotice.includes('一只兔子'), doneNotice);

  // 配图文案要进历史：这是模型下一轮判断「图已经交了」的第二重凭据
  const history = messageStorage.getGroupChatConversations(g);
  const lastSaid = history[history.length - 1];
  check('配图文案写回了会话历史', lastSaid?.role === 'assistant' && lastSaid.message.length > 0, JSON.stringify(lastSaid));
  check('配图文案不是裸图', !lastSaid?.message.includes('CQ:image'), String(lastSaid?.message));

  // 翻车路径：524 之后模型同样不能假装图已经交了
  const failGroup = 40005;
  mode = 'fail';
  await runImageTool(failGroup, 'draw_image', { prompt: '一只猫' });
  await sleep(DELIVER_WAIT);
  mode = 'b64';

  const failNotice = getDrawNotice(failGroup) ?? '';
  check('出图失败 -> 提示画崩了', failNotice.includes('画崩了'), failNotice);
  check('出图失败 -> 解锁', !isDrawing(failGroup));

  const failHistory = messageStorage.getGroupChatConversations(failGroup);
  check('翻车文案写回了会话历史', failHistory.length === 1 && failHistory[0].role === 'assistant', JSON.stringify(failHistory));

  // 内容拦截跟画崩了不是一回事：原样重画一定还是被拦，提示必须让模型换说法
  const blockGroup = 40006;
  mode = 'blocked';
  await runImageTool(blockGroup, 'draw_image', { prompt: '一只兔子' });
  await sleep(DELIVER_WAIT);
  mode = 'b64';

  const blockNotice = getDrawNotice(blockGroup) ?? '';
  check('内容拦截 -> 提示不能画', blockNotice.includes('不能画'), blockNotice);
  check('内容拦截 -> 要求换说法', blockNotice.includes('换个画面') || blockNotice.includes('换种描述'), blockNotice);
  check('内容拦截 -> 不说成画崩了', !blockNotice.includes('画崩了'), blockNotice);
  check('内容拦截 -> 解锁', !isDrawing(blockGroup));

  // 上游抽风不该吃掉日额度：dailyLimit=2，失败退回后还能连画两张
  const retry = await runImageTool(failGroup, 'draw_image', { prompt: '再来一只猫' });
  check('失败退还日额度', retry.includes('已经开始画了'), retry);
  await sleep(DELIVER_WAIT);
  const retry2 = await runImageTool(failGroup, 'draw_image', { prompt: '第三只猫' });
  check('退还后仍按 dailyLimit 计数', retry2.includes('已经开始画了'), retry2);
  await sleep(DELIVER_WAIT);
  const retry3 = await runImageTool(failGroup, 'draw_image', { prompt: '第四只猫' });
  check('额度用满 -> 拒绝', retry3.includes('今天画得太多了'), retry3);
}

/** 冷却要从图落地算起，不是从开始画算起 */
async function testCooldown() {
  console.log('\n[cooldown] 冷却从图落地重新计时');
  resetConfig();

  const g = 60006;
  // 线上正是 cooldownSec=120 撞上出图耗时 124s：按开始画算的话，
  // 图刚发出来就能立刻再画一张，等于没有冷却
  nnkbot.config.aiReply.imageGen!.cooldownSec = 30;

  await runImageTool(g, 'draw_image', { prompt: '一只狗' });
  await sleep(DELIVER_WAIT);

  const next = await runImageTool(g, 'draw_image', { prompt: '再来一只狗' });
  check('图落地后仍在冷却内 -> 拒绝', next.includes('刚画完一张还没缓过来'), next);
}

// 全部指向假上游，config.json 里的真配置不参与
nnkbot.config.apiKeys.imageGen = { baseUrl: BASE, apiKey: 'testkey', model: 'gpt-image-2' };
nnkbot.config.aiReply.imageGen = {
  enable: true, whiteGroupIds: [], dailyLimit: 2, cooldownSec: 0, size: '1024x1024',
};

const stub = startStub();

testFormat();
await testService();
await testSanitize();
await testTools();
await testNotice();
await testCooldown();

stub.close();
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
