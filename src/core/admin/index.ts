import http from 'http';
import crypto from 'crypto';
import { printError, printLog } from '@/utils/print';
import { NonokaCore } from '../nnkCore';
import { handleConfigRoute } from './config';
import { handleMemoryRoute } from './memory';

export class NonokaAdmin {
  private server?: http.Server;

  constructor(private readonly bot: NonokaCore) {}

  start() {
    const port = Number(process.env.ADMIN_PORT || 9616);
    const host = process.env.ADMIN_HOST || '127.0.0.1';
    const envToken = process.env.ADMIN_TOKEN;
    const isLocal = host === '127.0.0.1' || host === 'localhost';

    if (!envToken && !isLocal) {
      printError('[AdminPanel] 拒绝启动：绑定非本地地址时必须通过 ADMIN_TOKEN 环境变量设置固定令牌。');
      return;
    }

    const token = envToken || crypto.randomBytes(16).toString('hex');
    if (!envToken) {
      printLog(`[AdminPanel] 未设置 ADMIN_TOKEN，已生成临时令牌（重启后失效）: ${token}`);
    }

    this.server = http.createServer((req, res) => {
      this.handle(req, res, token).catch((error) => {
        printError('[AdminPanel Error]', error);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      });
    });
    this.server.listen(port, host, () => {
      printLog(`[AdminPanel] http://${host}:${port}/?token=${token}`);
    });
  }

  stop() {
    this.server?.close();
  }

  private checkAuth(req: http.IncomingMessage, url: URL, token: string) {
    const headerToken = req.headers['x-admin-token'];
    const queryToken = url.searchParams.get('token');
    return headerToken === token || queryToken === token;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse, token: string) {
    const url = new URL(req.url || '/', 'http://x');

    if (!this.checkAuth(req, url, token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    if (await handleConfigRoute(req, res, url, this.bot)) return;
    if (await handleMemoryRoute(req, res, url)) return;

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
}
