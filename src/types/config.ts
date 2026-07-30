export interface WSConfig {
  /** host地址 */
  host: string;
  /** ws端口 */
  port: number;
}

export interface BotConfig {
  /** 管理员qq数组 */
  admin: number[];
  /** 是否同意自动添加好友 */
  autoAddFriend: boolean;
  /** nonoka API服务 */
  nonokaService: {
    /** API服务地址 */
    baseUrl: string;
    /** API服务密钥 */
    apiKey: string;
    /** 媒体反代 CDN 域名（如 cdn.nonoka.online），留空则不做域名替换 */
    cdnHost: string;
  };
  /** 第三方服务 API 密钥（不通过管理面板读取或修改，直接编辑 config.json） */
  apiKeys: {
    /** lolicon 瑟图接口 */
    lolicon: string;
    /** saucenao 搜图接口 */
    saucenao: string;
  };
  /** 复读机功能 */
  repeater: {
    /** 打开复读机 */
    enable: boolean;
    /** 黑名单群号 */
    blackList: number[];
  },
  /** B站动态推送 */
  biliDynamicPush: {
    /** 是否开启功能 */
    enable: boolean;
    /** 推送配置 {b站uid : 要推送的群号列表 } */
    config: Record<string, number[]>;
    /** 因近期B站API增加鉴权，需要配置自己账号的cookie */
    cookie: string;
  },
  /** 推特动态推送 */
  tweetPush: {
    /** 是否开启功能 */
    enable: boolean;
    /** 推送配置 {推特用户名 : 要推送的群号列表 } */
    config: Record<string, number[]>;
  },
  /** YouTube 开播推送 */
  ytLivePush: {
    /** 是否开启功能 */
    enable: boolean;
    /** 推送配置 {YouTube 频道名 : 要推送的群号列表 } */
    config: Record<string, number[]>;
  },
  /** AI回复 */
  aiReply: {
    /** 是否开启AI回复 */
    enable: boolean;
    /** 黑名单，黑名单内的群不会触发任何回复 */
    blackList: number[];
    /** 主动发起对话的群名单 */
    initiativeList: number[];
    /** 记忆系统。整块可省略，省略时按代码里的默认值走 */
    memory?: {
      /**
       * 每次回复允许模型调几轮召回工具。
       * 主动插话默认 0：本来就是随口一句，不值得多花一次网络往返
       */
      toolRounds?: {
        mention?: number;
        initiative?: number;
      };
    };
    /** 画图工具。整块可省略，省略时按代码里的默认值走（默认开启） */
    imageGen?: {
      /** 是否允许模型调用画图工具，默认 true，要关得显式写 false */
      enable?: boolean;
      /** 白名单群号，留空则所有开了 AI 回复的群都能画 */
      whiteGroupIds?: number[];
      /** 每群每日出图上限，默认 5。出图要花钱，别不设上限 */
      dailyLimit?: number;
      /** 同群两次出图之间的冷却秒数，默认 120 */
      cooldownSec?: number;
      /** 出图尺寸，默认 1024x1024 */
      size?: string;
    };
  },
  /** YKHR OneDrive 文件转存功能 */
  ykhrOneDrive: {
    /** 生效的群号 */
    groupIds: number[];
  },
  /** 瑟图功能 */
  hPic: {
    /** 是否开启瑟图功能 */
    enable: boolean;
    /** 白名单群号，非空时启动白名单机制（只允许在白名单群发图） */
    whiteGroupIds: number[];
    /** 是否允许发送 R18 图片 */
    enableR18: boolean,
  },
}

export interface NonokaConfig {
  wsConfig: WSConfig;
  botConfig: BotConfig;
}
