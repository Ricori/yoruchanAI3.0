import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { GroupMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import { getImgCode } from '@/utils/msgCode';
import {
  getImgs, getReplyMsgId, hasImage, hasReply,
} from '@/utils/function';
import { printError, printLog } from '@/utils/print';

const PICTURE_DIR = path.resolve('data/picture');

/** 缓存的关键词列表 */
let cachedKeywords: string[] | null = null;

/** 获取所有已注册的关键词（即 data/picture 下的子目录名），带缓存 */
function getKeywords(): string[] {
  if (cachedKeywords !== null) return cachedKeywords;
  if (!fs.existsSync(PICTURE_DIR)) return [];
  cachedKeywords = fs.readdirSync(PICTURE_DIR).filter((f) => fs.statSync(path.join(PICTURE_DIR, f)).isDirectory());
  return cachedKeywords;
}

/** 加图后刷新关键词缓存 */
function refreshKeywords(): void {
  cachedKeywords = null;
}

/** 从指定关键词目录中随机取一张图片，返回绝对路径 */
function getRandomPicture(keyword: string): string | null {
  const dir = path.join(PICTURE_DIR, keyword);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f));
  if (files.length === 0) return null;
  const file = files[Math.floor(Math.random() * files.length)];
  return path.resolve(dir, file);
}

/** 下载图片到本地 (随机文件名) */
async function downloadImage(url: string, destDir: string): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });
  const ext = '.jpg';
  const filename = `${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;
  const destPath = path.join(destDir, filename);
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  fs.writeFileSync(destPath, response.data);
  return destPath;
}


export default class LocalPictureModule extends YoruModuleBase<GroupMessageData> {
  static NAME = 'LocalPictureModule';

  private isAddCommand = false;

  private matchedKeyword: string | null = null;

  async checkConditions() {
    const { message } = this.data;

    // 检查是否是 /加图 命令
    if (message.includes('/加图')) {
      this.isAddCommand = true;
      return true;
    }

    // 检查消息是否包含已注册的关键词
    const plainText = message.replace(/\[CQ:[^\]]+\]/g, '').trim();
    if (!plainText) return false;

    const keywords = getKeywords();
    for (const keyword of keywords) {
      if (plainText === keyword) {
        this.matchedKeyword = keyword;
        return true;
      }
    }

    return false;
  }


  async run() {
    const { message, group_id: groupId, user_id: userId } = this.data;

    if (this.isAddCommand) {
      await this.handleAddPicture(message, groupId, userId);
    } else if (this.matchedKeyword) {
      await this.handleSendPicture(groupId);
    }
  }

  /** 处理 /加图 命令 */
  private async handleAddPicture(message: string, groupId: number, userId: number) {
    // 解析关键词：/加图 xxx
    const match = message.replace(/\[CQ:[^\]]+\]/g, '').match(/\/加图\s+(\S+)/);
    if (!match) {
      yorubot.sendGroupMsg(groupId, '格式：/加图 nsy名', userId);
      return;
    }
    const keyword = match[1];

    const imgs = [] as { file: string, url: string }[];
    if (hasReply(message)) {
      const replyMsgId = getReplyMsgId(message);
      const replyMsgData = await yorubot.getMessageFromId(replyMsgId);
      if (replyMsgData && hasImage(replyMsgData.message)) {
        imgs.push(...getImgs(replyMsgData.message));
      }
    }
    imgs.push(...getImgs(message));

    if (imgs.length === 0) {
      return;
    }

    const destDir = path.join(PICTURE_DIR, keyword);
    let successCount = 0;

    for (const img of imgs) {
      try {
        await downloadImage(img.url, destDir);
        successCount++;
      } catch (e: any) {
        printError(`[LocalPic] Download picture error: ${e.message}`);
      }
    }

    if (successCount > 0) {
      refreshKeywords();
      yorubot.sendGroupMsg(groupId, `已添加 ${successCount} 张图片到「${keyword}」`);
      printLog(`[LocalPic] ${userId} 添加了 ${successCount} 张图片到 ${keyword}`);
    } else {
      yorubot.sendGroupMsg(groupId, '图片保存失败，请重试', userId);
    }
  }

  /** 处理关键词匹配，发送随机图片 */
  private async handleSendPicture(groupId: number) {
    const picPath = getRandomPicture(this.matchedKeyword!);
    if (!picPath) return;

    const fileUri = `file:///${picPath.replace(/\\/g, '/')}`;
    yorubot.sendGroupMsg(groupId, getImgCode(fileUri));
  }
}
