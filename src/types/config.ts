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
    /** 推送配置 {b站uid : 要推送的群号列表 } */
    config: Record<string, number[]>;
    /** 因近期B站API增加鉴权，需要配置自己账号的cookie */
    cookie: string;
  },
  /** AI回复*/
  aiReply: {
    /** 是否开启AI回复 */
    enable: boolean;
    /** 使用deepSeek模型，启用时请配置deepSeek key*/
    useDeepSeek: boolean;
    /** openAI key */
    openAiKey: string;
    /** deepSeek key */
    deepSeekKey: string;
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
