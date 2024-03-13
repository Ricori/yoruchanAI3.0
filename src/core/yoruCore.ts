import { CQWebSocket } from 'cq-websocket';
import { printError, printLog } from '@/utils/print';
import { GroupMessageData, PrivateMessageData, RequestFirendMessageData } from '@/types/event';
import { BotConfig, YoruConfig } from '@/types/config';
import { loadConfigFile } from '@/utils/io';
import YoruModuleBase from '@/modules/base';

const debugMode = process.env.YDEBUG === 'true';

type Module = typeof YoruModuleBase<RequestFirendMessageData> |
  typeof YoruModuleBase<PrivateMessageData> |
  typeof YoruModuleBase<GroupMessageData>;


export class YoruCore {
  /** CQWebSocket Object */
  protected cqs: CQWebSocket;

  /** Bot connection status */
  protected connectState = {
    '/event': false,
    '/api': false,
  };

  /** Is in debug mode */
  readonly debugMode = debugMode;

  /** Bot configs */
  readonly config: BotConfig;

  /** Request modules currently loaded */
  requestMessageModuleList: typeof YoruModuleBase<RequestFirendMessageData>[] = [];

  /** private message modules currently loaded  */
  privateMessageModuleList: typeof YoruModuleBase<PrivateMessageData>[] = [];

  /** group message currently loaded  */
  groupAtMessageModuleList: typeof YoruModuleBase<GroupMessageData>[] = [];

  /** Request modules currently loaded  */
  groupMessageModuleList: typeof YoruModuleBase<GroupMessageData>[] = [];

  constructor() {
    // If you use debug mode, you need to create the `config_debug.json` manually
    const configFileName = debugMode ? 'config_debug.json' : 'config.json';
    const config = loadConfigFile(configFileName) as YoruConfig;

    // config
    this.debugMode = debugMode;
    this.config = config.botConfig;

    // create cqs object
    this.cqs = new CQWebSocket(config.wsConfig);
  }

  /** Loaded request message type modules */
  loadModule(type: 'request', ModuleList: typeof YoruModuleBase<RequestFirendMessageData>[]): void;
  /** Loaded private message type modules */
  loadModule(type: 'private', ModuleList: typeof YoruModuleBase<PrivateMessageData>[]): void;
  /** Loaded private message type modules, support common modules */
  loadModule(type: 'private', ModuleList: typeof YoruModuleBase<(PrivateMessageData | GroupMessageData) >[]): void;
  /** Loaded groupAt message type modules */
  loadModule(type: 'groupAt', ModuleList: typeof YoruModuleBase<GroupMessageData>[]): void;
  /** Loaded groupAt message type modules, support common modules */
  loadModule(type: 'groupAt', ModuleList: typeof YoruModuleBase<(PrivateMessageData | GroupMessageData) >[]): void;
  /** Loaded group message type modules */
  loadModule(type: 'group', ModuleList: typeof YoruModuleBase<GroupMessageData>[]): void;
  /** Loaded group message type modules, support common modules  */
  loadModule(type: 'group', ModuleList: typeof YoruModuleBase<(PrivateMessageData | GroupMessageData) >[]): void;
  /** Loaded modules in different message type */
  loadModule(type: 'request' | 'private' | 'groupAt' | 'group', ModuleList: typeof YoruModuleBase[]) {
    this[`${type}MessageModuleList`]?.push(...ModuleList);
  }

  /** Module flow */
  async flow(ModuleList: Module[], data: any) {
    let extra = {};
    for (const Module of ModuleList) {
      const obj = new Module(data, extra);
      try {
        // check conditions
        const hit = await obj.checkConditions();
        if (hit) {
          // run
          await obj.run();
          // get res
          const { finished, extraData } = obj.processingNextData();
          // check finished
          if (finished) return;
          // extraData
          extra = extraData;
        }
      } catch (error) {
        printLog(`[${Module.NAME || 'MODULE'} Error] ${error}`);
      }
    }
  }

  /** Start bot */
  start() {
    // register connection-related listening events
    this.cqs.on('socket.connecting', (type) => { printLog(`[WS Connect] ${type} start connenct..`); });
    this.cqs.on('socket.error', (type, err) => {
      printLog(`[WS Connect] ${type} connect fail,Error: ${err}`);
      this.connectState[type] = false;
    });
    this.cqs.on('socket.connect', (type) => {
      printLog(`[WS Connect] ${type} connect successfully`);
      this.connectState[type] = true;
    });
    // Bind request firend event listener
    this.cqs.on('request.friend', async (data: Record<string, any>) => {
      this.flow(this.requestMessageModuleList, data);
    });
    // Bind private message listener
    this.cqs.on('message.private', async (_, data: any) => {
      this.flow(this.privateMessageModuleList, data);
    });
    // Bind group at bot message listener
    this.cqs.on('message.group.@.me', async (_, data: any) => {
      this.flow(this.groupAtMessageModuleList, data);
    });
    // Bind group common message listener
    this.cqs.on('message.group', async (_, data: any) => {
      this.flow(this.groupMessageModuleList, data);
    });
    // ws connect
    this.cqs.connect();
  }

  /** Get bot connecting status */
  getIsBotConnecting() {
    if (this.connectState['/api'] && this.connectState['/event']) {
      return true;
    }
    return false;
  }

  /** Check connection status */
  checkBotState() {
    if (!this.getIsBotConnecting()) {
      printError('[Error] Bot already disconnected, unable to perform action.');
    }
  }
}
