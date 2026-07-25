import fs from 'fs';
import path from 'path';
import { CHAT_BACKUP_DIR, backupDateKey } from '@/modules/aiReply/storage/message';
import { matchAlias, normalizeAlias, normalizeText } from '@/modules/aiReply/history/nameMatch';
import aliasIndex from '@/modules/aiReply/history/aliasIndex';
import { getMentionedUserIds } from '@/modules/aiReply/history/mention';
import userMemoryStorage from '@/modules/aiReply/storage/userMemory';
import type { FormattedMessage } from '@/types/message';

/** 用绝不会撞上真实群的号造样本，跑完就删 */
const FAKE_GROUP = 88888887;
const OTHER_GROUP = 88888886;
const DAY_MS = 24 * 60 * 60 * 1000;

let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      期望 ${e}\n      实际 ${a}`);
  }
}

/** 消息里有没有叫到这个昵称 */
function hit(message: string, nickName: string): boolean {
  return matchAlias(normalizeText(message), normalizeAlias(nickName)) > 0;
}

/** 昵称 A 比昵称 B 更像被叫到的那个 */
function better(message: string, a: string, b: string): boolean {
  const text = normalizeText(message);
  return matchAlias(text, normalizeAlias(a)) > matchAlias(text, normalizeAlias(b));
}

function testMatch() {
  console.log('matchAlias');

  check('原名完整叫到', hit('雨漫是谁', '雨漫'), true);
  check('省略英文后缀（爱丽丝 → 爱丽丝offical）', hit('爱丽丝是谁', '爱丽丝offical'), true);
  check('省略下划线后缀（日志里的真实用户）', hit('古今東西最近在干啥', '古今東西_Official'), true);
  check('昵称带零宽字符也能对上', hit('高达吉士双牛堡好吃吗', '高达吉士双牛堡‌'), true);
  check('昵称带 emoji 装饰', hit('茶嘉维尔学历怎么样', '茶嘉维尔学历🍵'), true);
  check('纯英文昵称', hit('esperanta 还在吗', 'Esperanta'), true);
  check('英文大小写归一', hit('AZU 是谁', 'azu'), true);
  check('句子式昵称里的核心名（关于莉莉娅的一切 → 莉莉娅）', hit('莉莉娅是谁', '关于莉莉娅的一切'), true);
  check('谚文昵称', hit('미야코 在吗', '미야코'), true);

  // 首尾的系词/语气词不算名字的一部分，覆盖率要按核心名算，否则两字核心永远够不到阈值
  check('剥掉首尾语气词后的核心名（流逝 → 是流逝啊啊啊）', hit('流逝是谁', '是流逝啊啊啊'), true);
  check('同一个人，完整昵称也要认得', hit('是流逝啊啊啊在吗', '是流逝啊啊啊'), true);
  check('带系词叫也认得', hit('是流逝是谁', '是流逝啊啊啊'), true);
  check('核心名以语气词结尾时不误杀（呀酱 → 呀酱啊）', hit('呀酱在吗', '呀酱啊'), true);

  console.log('matchAlias 误命中防护');

  check('bot 自己的名字不能认成群友', hit('乃乃香你好', '乃乃香'), false);
  check('昵称含 bot 名时，只叫 bot 不算叫他', hit('乃乃香你好', '乃乃香爸爸'), false);
  check('整段叫全了才算叫他', hit('乃乃香爸爸你好', '乃乃香爸爸'), true);
  check('句子式昵称不该被日常对话蹭中', hit('今天好热', '有一种下班的预感'), false);
  check('时间词蹭不中句子式昵称', hit('今天好热啊', '今天不想上班'), false);
  check('系统默认名忽略', hit('我的设备坏了', '我的设备'), false);
  check('英文昵称要求词边界（azu 不该被 azusa 蹭中）', hit('azusa 唱得好', 'azu'), false);
  check('英文昵称要求词边界（alice 不该被 malicious 蹭中）', hit('malicious code', 'alice'), false);
  check('两字母英文昵称不参与匹配', hit('ai 很强', 'ai'), false);
  check('单字昵称不参与匹配', hit('水好喝', '水'), false);
  check('完全无关的话不命中', hit('今天吃什么', '雨漫'), false);
  check('只共一个字不算命中', hit('漫画好看', '雨漫'), false);
  // 以下五条都来自真实日志里抓到的误命中，别放宽
  check('latin 碎片不算叫人：off 只是 official 的中段', hit('off会来不来', '古今東西_Official'), false);
  check('latin 碎片不算叫人：live 只是 lovelive 的中段', hit('好想看live', '宜昌LoveLive!同好会'), false);
  check('latin 碎片不算叫人：san 只是 sanjen 的中段', hit('喝杯咖啡回下san值', 'sanjen'), false);
  check('片段不能以助词结尾（最后的 / 最后的绿色）', hit('33就剩最后的枪决了', '最后的绿色'), false);
  check('片段不能以助词开头（的一切 / 关于莉莉娅的一切）', hit('一切的一切都变了', '关于莉莉娅的一切'), false);
  check('链接里的字母串不算叫人', hit('https://www.lovelive-anime.jp/special/live', '宜昌LoveLive!同好会'), false);
  check('链接之外的正文照常认人', hit('智乃看 https://x.com/abc', '千野智乃'), true);

  console.log('matchAlias 真实日志里该命中的');

  check('省略姓（智乃 → 千野智乃）', hit('智乃老师又开始了吗', '千野智乃'), true);
  check('省略姓（雏子 → 朔洇雏子）', hit('雏子比我厉害多了', '朔洇雏子'), true);
  check('省略前缀（小雏 → 丈育小雏）', hit('小雏说话', '丈育小雏'), true);
  check('名字相近的两人不能串（小雏 不该命中 朔洇雏子）', hit('小雏说话', '朔洇雏子'), false);
  check('latin 昵称成词时照常命中（hina → hina酱真可爱）', hit('昨天hina那个核子四杀好帅', 'hina酱真可爱'), true);
  check('省略名只留姓（伊波 → 伊波千果）', hit('伊波佬到底捣鼓出了什么', '伊波千果'), true);
  check('省略后缀（咖啡店 → 芝士咖啡店）', hit('咖啡店前辈快说说话', '芝士咖啡店'), true);

  console.log('matchAlias 误命中防护（补充）');

  // 下面两条是同一条规则的两面：句子式昵称只被叫到两个字时，
  // 证据太弱（占比不到一半），认了就等于让日常对话随便蹭中长昵称
  check('日常词不该蹭中句子式昵称', hit('下班了好累', '有一种下班的预感'), false);
  check('句子式昵称只叫两个字认不出来（已知取舍）', hit('ブキ 说的对', '是ブキ不是バカ啊'), false);

  console.log('matchAlias 排序');

  check('完整命中优于只命中前缀一截', better('古今東西_Official 来了', '古今東西_Official', '古今東西'), true);
  check('叫核心名时，核心名本身排在带后缀的前面', better('雨漫在吗', '雨漫', '雨漫的小号'), true);
}

const TODAY = backupDateKey();
const YESTERDAY = backupDateKey(new Date(Date.now() - DAY_MS));

const FIXTURES: Record<string, string> = {
  // 同一个人改过名：旧名只在 3 天前的日志里出现过
  [`${FAKE_GROUP}_${backupDateKey(new Date(Date.now() - 3 * DAY_MS))}.txt`]:
    '[111][爱丽丝offical]说：大家好\n[0][被动]你好\n',
  // 撞名：222 和 333 都叫过 azu，333 更近活跃
  [`${FAKE_GROUP}_${YESTERDAY}.txt`]:
    '[111][爱丽丝]说：改名了\n[222][azu]说：我是老的那个\n',
  [`${FAKE_GROUP}_${TODAY}.txt`]:
    '[333][azu]说：我是新的那个\n[444][无档案的人]说：路过\n',
  // 另一个群里的同名者，不该被本群的提问认出来
  [`${OTHER_GROUP}_${TODAY}.txt`]:
    '[555][爱丽丝]说：我在别的群\n',
};

/** 造一份临时档案，让 hasMemory 能过；resolve 本身不看档案，这里只为 fixture 完整 */
function testIndex() {
  console.log('aliasIndex.resolve');

  check(
    '叫旧名也能认出改名后的人',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：爱丽丝是谁'),
    [111],
  );

  check(
    '叫核心名（省略 offical 后缀）同样认得',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：爱丽丝offical 还在吗').includes(111),
    true,
  );

  check(
    '撞名取最近活跃的那个人',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：azu 在吗')[0],
    333,
  );

  check(
    '撞名的两个人都会被列出来，只是排序不同',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：azu 在吗').sort(),
    [222, 333],
  );

  check(
    '不认别的群的同名者',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：爱丽丝是谁').includes(555),
    false,
  );

  check(
    '说话人自己的昵称不算被提到（前缀已剥掉）',
    aliasIndex.resolve(FAKE_GROUP, '[爱丽丝]说：今天吃什么'),
    [],
  );

  check(
    '没提到任何人时返回空',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：今天天气不错'),
    [],
  );

  check(
    '叫 bot 的名字不会认成群友',
    aliasIndex.resolve(FAKE_GROUP, '[某人]提到我说：乃乃香在吗'),
    [],
  );

  check(
    '实时 note 的新昵称立刻生效',
    (() => {
      aliasIndex.note(FAKE_GROUP, 666, '刚改的新名字');
      return aliasIndex.resolve(FAKE_GROUP, '[某人]说：刚改的新名字 你好');
    })(),
    [666],
  );
}

const MEMORY_DIR = path.resolve(process.cwd(), 'data/memory/user');
/** 这几个假号要有档案，hasMemory 才会放行 */
const FAKE_PROFILES = [111, 222, 333];
/** 777 只有档案、日志里从没出现过，用来验证「没露过面的人不硬加进索引」 */
const ORPHAN_PROFILE = 777;
/** 人工别名：和 111 的昵称「爱丽丝offical」毫无字面关系，自动派生不可能拿到 */
const MANUAL_ALIAS = '桃子姐';

function testManualAlias() {
  console.log('人工别名（档案里的 aliases）');

  check(
    '人工别名能认出人（自动派生拿不到这个叫法）',
    aliasIndex.resolve(FAKE_GROUP, `[某人]说：${MANUAL_ALIAS}是谁`),
    [111],
  );

  check(
    '加了人工别名，原本自动派生的昵称照样认得',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：爱丽丝是谁'),
    [111],
  );

  check(
    '只有档案、日志里没露过面的人不进索引（无从判断在哪个群）',
    aliasIndex.resolve(FAKE_GROUP, '[某人]说：孤儿档案是谁'),
    [],
  );

  // 认出人只是一半：叫法不跟着注入，LLM 就不知道这份档案对应问句里的哪个外号
  check(
    '人工别名会写进注入的档案行',
    userMemoryStorage.getMemoryContext([111]),
    `[测试111]（也叫：${MANUAL_ALIAS}） 测试用档案`,
  );

  check(
    '没填别名的人档案行不变',
    userMemoryStorage.getMemoryContext([222]),
    '[测试222] 测试用档案',
  );
}

function userMsg(userId: number, message: string): FormattedMessage {
  return { role: 'user', userId, isMentionMe: false, message };
}

function testMention() {
  console.log('getMentionedUserIds');

  // bot 要回的是最后那条，它提到的人必须先占名额，否则会被前面的旧消息挤掉
  const crowded = [
    userMsg(999, '[路人]说：azu 在吗'),
    userMsg(999, '[路人]说：爱丽丝是谁'),
  ];
  check(
    '最新一条提到的人优先占名额，不被旧消息挤掉',
    getMentionedUserIds(FAKE_GROUP, crowded, new Set()).includes(111),
    true,
  );
  check(
    '名额上限 2 生效',
    getMentionedUserIds(FAKE_GROUP, crowded, new Set()).length,
    2,
  );
  check(
    '已经会注入的人不再占名额',
    getMentionedUserIds(FAKE_GROUP, [userMsg(999, '[路人]说：爱丽丝是谁')], new Set([111])),
    [],
  );
  check(
    '没有档案的人认出来也不注入',
    getMentionedUserIds(FAKE_GROUP, [userMsg(999, '[路人]说：无档案的人在吗')], new Set()),
    [],
  );
  check(
    '扫描窗口只看最近 5 条群友发言',
    getMentionedUserIds(FAKE_GROUP, [
      userMsg(999, '[路人]说：爱丽丝是谁'),
      ...Array.from({ length: 5 }, () => userMsg(999, '[路人]说：今天天气不错')),
    ], new Set()),
    [],
  );
}

export function testNameResolve() {
  fs.mkdirSync(CHAT_BACKUP_DIR, { recursive: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const files = Object.keys(FIXTURES).map((f) => path.join(CHAT_BACKUP_DIR, f));
  const profiles = [...FAKE_PROFILES, ORPHAN_PROFILE].map((id) => path.join(MEMORY_DIR, `${id}.json`));

  const existing = [...files, ...profiles].filter((f) => fs.existsSync(f));
  if (existing.length > 0) {
    console.error(`样本文件已存在，先手动清理再跑：\n${existing.join('\n')}`);
    return;
  }

  try {
    Object.entries(FIXTURES).forEach(([name, content]) => {
      fs.writeFileSync(path.join(CHAT_BACKUP_DIR, name), content, 'utf-8');
    });
    FAKE_PROFILES.forEach((id) => {
      const data = {
        userId: id,
        nickName: `测试${id}`,
        traits: ['测试用档案'],
        // 只给 111 配人工别名
        ...(id === 111 ? { aliases: [MANUAL_ALIAS] } : {}),
        updatedAt: Date.now(),
      };
      fs.writeFileSync(path.join(MEMORY_DIR, `${id}.json`), JSON.stringify(data), 'utf-8');
    });
    fs.writeFileSync(path.join(MEMORY_DIR, `${ORPHAN_PROFILE}.json`), JSON.stringify({
      userId: ORPHAN_PROFILE, nickName: '孤儿档案', traits: ['没在日志里出现过'], aliases: ['孤儿档案'], updatedAt: Date.now(),
    }), 'utf-8');

    testMatch();
    testIndex();
    testManualAlias();
    testMention();
    console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项未通过`);
  } finally {
    [...files, ...profiles].forEach((f) => fs.rmSync(f, { force: true }));
  }
}

testNameResolve();
