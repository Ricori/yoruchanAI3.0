import fs from 'fs';
import path from 'path';
import { CHAT_BACKUP_DIR, backupDateKey } from '@/modules/aiReply/storage/message';
import { searchGroupHistory } from '@/modules/aiReply/history/search';
import { extractKeywords } from '@/modules/aiReply/history/keywords';

/** 用一个绝不会撞上真实群的号来造样本，跑完就删 */
const FAKE_GROUP = 88888888;
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

function fixtureFile(daysAgo: number) {
  const key = backupDateKey(new Date(Date.now() - daysAgo * DAY_MS));
  return path.join(CHAT_BACKUP_DIR, `${FAKE_GROUP}_${key}.txt`);
}

const FIXTURES: Record<number, string> = {
  20: '[111][雨漫]说：很久以前也去爬山\n',
  3: '[111][雨漫]说：我周末要去爬山\n[0][主动 0.12]爬山啊，注意别摔了\n[222][hina]说：爬山好累\n',
  1: '[111][雨漫]说：昨天爬山累死了\n[111][雨漫]说：今天吃拉面\n',
  0: '[333][路人]说：随便说说\n',
};

function texts(hits: { text: string }[]) {
  return hits.map((h) => h.text);
}

function run() {
  console.log('searchGroupHistory');

  check(
    'userId + keyword：只留 111 说过的爬山，倒序，窗口外的 20 天前不算',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [111], keywords: ['爬山'] })),
    ['[雨漫]说：昨天爬山累死了', '[雨漫]说：我周末要去爬山'],
  );

  check(
    'limit 生效，且留下的是最近那条',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [111], keywords: ['爬山'], limit: 1 })),
    ['[雨漫]说：昨天爬山累死了'],
  );

  check(
    '只给 keyword：跨用户命中，bot 自己的 [0] 行被排除',
    texts(searchGroupHistory(FAKE_GROUP, { keywords: ['爬山'] })),
    ['[雨漫]说：昨天爬山累死了', '[hina]说：爬山好累', '[雨漫]说：我周末要去爬山'],
  );

  check(
    '只给 userId：该用户全部发言，按时间倒序',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [111] })),
    ['[雨漫]说：今天吃拉面', '[雨漫]说：昨天爬山累死了', '[雨漫]说：我周末要去爬山'],
  );

  check(
    'days 放宽到 25 天才能捞到最早那条',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [111], keywords: ['爬山'], days: 25 })).slice(-1),
    ['[雨漫]说：很久以前也去爬山'],
  );

  check(
    '当日文件也在检索范围内',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [333] })),
    ['[路人]说：随便说说'],
  );

  check(
    'fromDaysAgo:1 跳过当天，当天说的话不再被当成旧账',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [333], fromDaysAgo: 1 })),
    [],
  );

  check(
    'fromDaysAgo:1 不影响更早的记录，且窗口跟着后移',
    texts(searchGroupHistory(FAKE_GROUP, { userIds: [111], fromDaysAgo: 1 })),
    ['[雨漫]说：今天吃拉面', '[雨漫]说：昨天爬山累死了', '[雨漫]说：我周末要去爬山'],
  );

  check('两个条件都不给直接返回空', searchGroupHistory(FAKE_GROUP, {}), []);
  check('没有备份文件的群返回空', searchGroupHistory(12345, { keywords: ['爬山'] }), []);

  check(
    'date 取自文件名',
    searchGroupHistory(FAKE_GROUP, { userIds: [333] })[0].date,
    backupDateKey().slice(4, 6) + '-' + backupDateKey().slice(6, 8),
  );

  console.log('extractKeywords');

  check(
    '剥掉说话人前缀，虚词切成短词，按长度倒序',
    extractKeywords('[雨漫]说：我周末要去爬山'),
    ['周末', '爬山'],
  );

  check(
    '提到我说前缀 + bot 别名不能当关键词',
    extractKeywords('[雨漫]提到我说：乃乃香你吃拉面吗'),
    ['拉面'],
  );

  check(
    '回复引文前缀也要剥掉，时间词「明天」不算关键词',
    extractKeywords('[雨漫]回复了我的消息(上次那个拉面)，说：明天去秋叶原'),
    ['秋叶原'],
  );

  check(
    '图片占位符不能当关键词',
    extractKeywords('[雨漫]回复了我的消息([之前的图片])，说：[图片]'),
    [],
  );

  check(
    '泛用动词不能当关键词，否则命中一堆不相关的旧账',
    extractKeywords('[雨漫]提到我说：乃乃香你不记得我了吗'),
    [],
  );

  check('英文小写归一', extractKeywords('[某人]说：在跑 Docker 和 K8S'), ['docker']);
  check('全是虚词就没有关键词', extractKeywords('[某人]说：是不是啊'), []);
  check(
    '轻动词切开长句，最多留 3 个，长的优先',
    extractKeywords('[某人]说：明天去秋叶原买手办然后吃拉面看电影'),
    ['秋叶原', '手办', '拉面'],
  );
}

export function testHistorySearch() {
  fs.mkdirSync(CHAT_BACKUP_DIR, { recursive: true });
  const files = Object.keys(FIXTURES).map((d) => fixtureFile(Number(d)));

  const existing = files.filter((f) => fs.existsSync(f));
  if (existing.length > 0) {
    console.error(`样本文件已存在，先手动清理再跑：\n${existing.join('\n')}`);
    return;
  }

  try {
    Object.entries(FIXTURES).forEach(([daysAgo, content]) => {
      fs.writeFileSync(fixtureFile(Number(daysAgo)), content, 'utf-8');
    });
    run();
    console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项未通过`);
  } finally {
    files.forEach((f) => fs.rmSync(f, { force: true }));
  }
}

testHistorySearch();
