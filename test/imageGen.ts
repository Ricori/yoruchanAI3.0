import http from 'http';
import nnkbot from '@/core/nnkBot';
import { formatMessage } from '@/modules/aiReply/format';
import {
  getImageTools, isDrawing, isImageGenEnabled, runImageTool,
} from '@/modules/aiReply/imageGen/tools';
import { editImage, generateImage } from '@/service/imageGen';
import { sleep } from '@/utils/function';

/**
 * 画图工具的冒烟测试：`npx tsx ./test/imageGen.ts`
 *
 * 自带一个假的 nonoka API 服务，跑之前把 nonokaService.baseUrl 指过去，
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

/** 假上游。generations 按 mode 分别返 b64_json 和 url，两条归一化分支都要走到 */
let mode: 'b64' | 'url' = 'b64';

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
  check('返 b64_json -> base64://', !!generated?.startsWith('base64://'), String(generated).slice(0, 40));

  mode = 'url';
  const fromUrl = await generateImage('一只兔耳朵的动漫女孩', '1024x1024');
  check('只返 url -> 下载后转 base64://', !!fromUrl?.startsWith('base64://'), String(fromUrl).slice(0, 40));
  mode = 'b64';

  const edited = await editImage(`${BASE}/src.png`, '改成夜景', '1024x1024');
  check('editImage -> base64://', !!edited?.startsWith('base64://'), String(edited).slice(0, 40));

  const badSrc = await editImage(`${BASE}/404.png`, '改成夜景', '1024x1024');
  check('底图拉不到 -> null', badSrc === null, String(badSrc));
}

async function testTools() {
  console.log('\n[tools] 工具下发与限流');

  check('无底图 -> 只下发 draw_image', getImageTools(false).map((t) => t.name).join(',') === 'draw_image');
  check('有底图 -> 两个工具都下发', getImageTools(true).map((t) => t.name).join(',') === 'draw_image,edit_image');

  check('缺 prompt -> 拒绝', (await runImageTool(GROUP, 'draw_image', {})).includes('缺少 prompt'));
  check('edit 无底图 -> 拒绝', (await runImageTool(GROUP, 'edit_image', { prompt: 'x' })).includes('没有拿到要改的那张图'));
  check('拒绝时未上锁', !isDrawing(GROUP));

  const first = await runImageTool(GROUP, 'draw_image', { prompt: '一只兔子' });
  check('第一次 -> 开始画', first.includes('已经开始画了'), first);
  check('出图期间 isDrawing 为真', isDrawing(GROUP));

  const second = await runImageTool(GROUP, 'draw_image', { prompt: '再来一只' });
  check('在画时再调 -> 拒绝', second.includes('上一张图还在画'), second);

  // 等后台那一轮跑完（含发图前 5s 的最小延迟）
  await sleep(7000);
  check('出图完成后解锁', !isDrawing(GROUP));

  // dailyLimit=2 / cooldownSec=0：第二张还能画，第三张该被日额挡下
  const third = await runImageTool(GROUP, 'draw_image', { prompt: '第二张' });
  check('第二张 -> 开始画', third.includes('已经开始画了'), third);
  await sleep(7000);

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

// 全部指向假上游，config.json 里的真配置不参与
nnkbot.config.nonokaService.baseUrl = BASE;
nnkbot.config.nonokaService.apiKey = 'testkey';
nnkbot.config.aiReply.imageGen = {
  enable: true, whiteGroupIds: [], dailyLimit: 2, cooldownSec: 0, size: '1024x1024',
};

const stub = startStub();

testFormat();
await testService();
await testTools();

stub.close();
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
