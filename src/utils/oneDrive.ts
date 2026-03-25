import fs from 'fs';
import path from 'path';
import oneDriveAPI from 'onedrive-api';
import axios from 'axios';
import qs from 'qs';
import { printError, printLog } from './print';

export interface OneDriveConfig {
  client_id: string;
  client_secret: string;
  access_token: string;
  refresh_token: string;
  updated_at: number;
}

export class OneDriveAuthManager {
  private configPath: string;

  public config: OneDriveConfig;

  constructor(storagePath: string) {
    this.configPath = path.resolve(storagePath);
    this.config = this.loadConfig();
  }

  private loadConfig(): OneDriveConfig {
    if (fs.existsSync(this.configPath)) {
      const data = fs.readFileSync(this.configPath, 'utf-8');
      printLog('[OneDrive] Config loaded from file.');
      return JSON.parse(data);
    }
    throw new Error(`[OneDrive Error] Config file not found at path: ${this.configPath}`);
  }

  private saveConfig() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    printLog('[OneDrive] Config saved to file.');
  }

  private isTokenExpired(): boolean {
    const now = Date.now();
    const expiresInMs = 3600 * 1000;
    const bufferMs = 10 * 60 * 1000;
    return now > (this.config.updated_at + (expiresInMs - bufferMs));
  }

  async refreshTokens(): Promise<string> {
    const url = 'https://login.microsoftonline.com/common/oauth2/token';

    const requestBody = {
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      redirect_uri: 'http://localhost',
      refresh_token: this.config.refresh_token,
      grant_type: 'refresh_token',
      // resource: this.config.resource,
    };

    try {
      const response = await axios.post(url, qs.stringify(requestBody), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      this.config.access_token = response.data.access_token;
      this.config.refresh_token = response.data.refresh_token;
      this.config.updated_at = Date.now();

      this.saveConfig();

      return this.config.access_token!;
    } catch (error: any) {
      const errorDetail = error.response?.data || error.message;
      printError('[OneDrive Error] Failed to refresh tokens: ', errorDetail);
      throw error;
    }
  }

  async getAccessToken() {
    if (!this.isTokenExpired()) {
      return this.config.access_token;
    }
    printLog('[OneDrive] Refresh Token...');
    let newToken: string;
    try {
      newToken = await this.refreshTokens();
    } catch (err) {
      return;
    }
    return newToken;
  }
}


export async function uploadLargeFileToOneDrive(token: string, localFilePath: string, parentPath: string, progressCallback?: (text: string) => void) {
  if (!token) {
    printError('[OneDrive Error] No access token available.');
    return undefined;
  }
  if (!fs.existsSync(localFilePath)) {
    printError(`[OneDrive Error] LocalFile not found: ${localFilePath}`);
    return undefined;
  }
  const stats = fs.statSync(localFilePath);
  const fileSize = stats.size;
  const filename = path.basename(localFilePath);
  const readableStream = fs.createReadStream(localFilePath);

  printLog(`[OneDrive] Start Upload: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

  let nextThreshold = 0.2;

  try {
    const item = await oneDriveAPI.items.uploadSession(
      {
        accessToken: token,
        filename,
        fileSize,
        readableStream,
        parentPath,
        drive: 'me',
        chunksToUpload: 50, // 每次请求上传的块数，增加此值可提速但增加内存占用
      },
      (bytesUploaded: number) => {
        const currentProgress = bytesUploaded / fileSize;

        if (currentProgress >= nextThreshold) {
          const percentageLabel = Math.round(nextThreshold * 100);
          const mb = (bytesUploaded / 1024 / 1024).toFixed(2);
          printLog(`[OneDrive] ${filename} Upload Progress: ${percentageLabel}% (${mb} MB)`);
          progressCallback?.(`${percentageLabel}% (${mb} MB)`);
          nextThreshold += 0.2;
        }
      },
    );

    printLog(`[OneDrive] Upload Completed: ${filename}`);
    return item;
  } catch (error) {
    printError(`[OneDrive Error] Upload Failed: ${filename} - `, error.message || error);
    return undefined;
  }
}


