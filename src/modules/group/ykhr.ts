
import path from 'path';
import { unlink } from 'fs/promises';
import { GroupMessageData } from '@/types/event';
import YoruModuleBase from '@/modules/base';
import yorubot from '@/core/yoruBot';
import { getCQCodesFromStr } from '@/utils/msgCode';
import { downloadFile } from '@/utils/io';
import { printError } from '@/utils/print';
import { OneDriveAuthManager, uploadLargeFileToOneDrive } from '@/utils/oneDrive';


let ykhrOneDriveAuth: OneDriveAuthManager;
function startOneDriveAuthApp() {
  try {
    ykhrOneDriveAuth = new OneDriveAuthManager('./ykhr_onedrive.json');
  } catch (err) {
    printError('[OneDrive Error] Failed to start app: ', err.message);
  }
}
startOneDriveAuthApp();


export default class ykhrOnedriveModule extends YoruModuleBase<GroupMessageData> {
  static NAME = 'YkhrOnedriveModule';

  async checkConditions() {
    const { message, group_id: groupId } = this.data;

    // 只在 YKHR 群和测试群生效
    if (groupId !== 829349264) return false;

    // 检查文件消息
    if (message.includes('[CQ:file,file=')) {
      if (message.includes('待轴') || message.includes('熟肉')) {
        return true;
      }
    }

    return false;
  }


  async run() {
    const { message, group_id: groupId, user_id: userId } = this.data;

    const cqObjs = getCQCodesFromStr(message);
    const fileObj = cqObjs.find((cq) => cq.type === 'file');
    if (fileObj) {
      const file = fileObj.data.get('file') as string;
      const fileSize = fileObj.data.get('file_size');
      const url = fileObj.data.get('url') as string;

      if (fileSize && (Number(fileSize) > 1024 * 1024 * 1024)) {
        yorubot.sendGroupMsg(groupId, `文件 ${file}(${(Number(fileSize) / (1024 * 1024)).toFixed(2)} MB) 过大，无法处理`, userId);
        return;
      }

      yorubot.sendGroupMsg(groupId, `检测到文件 ${file} (${(Number(fileSize) / (1024 * 1024)).toFixed(2)} MB)，正在处理...`, userId);

      const localPath = await downloadFile(
        url,
        path.resolve('./temp'),
        file,
      ).catch((err) => {
        printError(`[Download] Error downloading ${file}:`, err);
      });

      if (!localPath) {
        yorubot.sendGroupMsg(groupId, `下载文件 ${file} 失败，请联系管理员。`, userId);
        return;
      }

      try {
        const token = await ykhrOneDriveAuth.getAccessToken();
        if (!token) {
          yorubot.sendGroupMsg(groupId, 'Onedrive 授权失败，请联系管理员。', userId);
          return;
        }

        const parentPath = file.includes('待轴') ? '/剪辑' : '/全熟已压';

        const progressCallback = (text: string) => {
          yorubot.sendGroupMsg(groupId, `${file} 上传进度：${text}`, userId);
        };
        const item = await uploadLargeFileToOneDrive(token, localPath, parentPath, progressCallback);
        if (!item) {
          yorubot.sendGroupMsg(groupId, `[OneDrive] 上传 ${file} 到 OneDrive 失败。`, userId);
          return;
        }

        yorubot.sendGroupMsg(groupId, `已上传 ${file} 至 OneDrive\nURL: ${item.webUrl}`, userId);
      } finally {
        await unlink(localPath).catch((err) => {
          printError(`[Cleanup] Error deleting ${localPath}:`, err);
        });
      }
    }
  }
}
