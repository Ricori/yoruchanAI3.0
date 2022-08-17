/** websocket连接配置 */
const wsConfig = {
  host: '127.0.0.1',
  // host: '123.207.7.202',
  port: 6700, // ws端口
  enableAPI: true, // 启用 /api 连线
  enableEvent: true, // 启用 /event 连线
  access_token: '', // 访问密钥
  reconnection: true, // 错误自动重连
  reconnectionAttempts: 8, // 错误重连最大次数
  reconnectionDelay: 8000, // 重连延迟
};

/** 夜夜酱配置 */
const yoruConfig = {
  /** 开启调试模式 */
  debugMode: false,
  /** 管理员qq数组 */
  admin: [515302066],
  /** 是否同意自动添加好友 */
  autoAddFriend: false,
  /** 复读机功能 */
  repeater: {
    /** 打开复读机 */
    enable: true,
    /** 几次重复后复读 */
    times: 3,
  },
  /** B站动态推送 */
  biliDynamicPush: {
    /** 是否开启功能 */
    enable: true,
    /** 推送到的群号 */
    group: [498888010],
  },
  /** 瑟图功能 */
  hPic: {
    /** 是否开启瑟图功能 */
    enable: true,
    /** 是否只允许白名单群 */
    whiteOnly: false,
    /** 白名单群数组，whiteOnly为true时生效 */
    whiteGroup: [829349264],
    /** 白名单群拥有的最高瑟图等级, 0=全年龄,1=混合,2=r18Only */
    whiteGroupLimit: 2,
  },
};

export { wsConfig, yoruConfig };
