interface WSConfig {
  /** host地址 */
  host: string;
  /** ws端口 */
  port: number;
  /** 启用 /api 连线 */
  enableAPI: boolean;
  /** 启用 /event 连线 */
  enableEvent: boolean;
  /** 访问密钥 */
  access_token?: string;
  /** 错误自动重连 */
  reconnection?: boolean;
  /** 错误重连最大次数 */
  reconnectionAttempts?: number;
  /** 重连延迟 */
  reconnectionDelay?: number;
}

export interface BotConfig {
  /** 管理员qq数组 */
  admin: number[];
  /** 是否同意自动添加好友 */
  autoAddFriend: boolean;
  /** 复读机功能 */
  repeater: {
    /** 打开复读机 */
    enable: boolean;
    /** 几次重复后复读 */
    times: number;
  },
  /** B站动态推送 */
  biliDynamicPush: {
    /** 是否开启功能 */
    enable: boolean;
    /** 推送到的群号 */
    group: number[];
  },
  /** openAI */
  openAi: {
    /** 是否开启chatGPT回复 */
    enable: boolean;
    /** openAI key */
    apiKey: string;
  },
  /** 瑟图功能 */
  hPic: {
    /** 是否开启瑟图功能 */
    enable: boolean;
    /** 是否只允许白名单群发图 */
    whiteGroupOnly: boolean;
    /** 白名单群号 */
    whiteGroupIds: number[];
    /** 白名单群色图定制等级, 0=全年龄,1=r18Only,2=混合 */
    whiteGroupCustomLimit: number,
  },
}

export interface YoruConfig {
  wsConfig: WSConfig;
  botConfig: BotConfig;
}
