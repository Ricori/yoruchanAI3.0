const wsConfig = {
  host: "123.207.7.202",  // 127.0.0.1
  port: 6700,             // ws端口
  enableAPI: true,        // 启用 /api 连线
  enableEvent: true,      // 启用 /event 连线
  access_token: "",       // 访问密钥
  reconnection: true,     // 错误自动重连
  reconnectionAttempts: 8,   // 错误重连最大次数
  reconnectionDelay: 8000,   // 重连延迟
}

const yoruConfig = {
  admin: [515302066],       //管理员qq数组
  autoAddFriend: false,     //自动添加好友

  repeater: {
    enable: true,          //打开复读机
    times: 3,              //几次重复后复读
  },
  hPic: {                         //瑟图功能
    enable: true,                 //是否开启
    whiteOnly: false,             //只允许白名单群
    whiteGroup: [829349264],      //白名单群
    whiteGroupLimit: 2,           //白名单群拥有的权限,0=全年龄,1=混合,2=r18Only
    useSmallPic: true,            //开启图片压缩，可以降低上传错误率
  }
}


export { wsConfig, yoruConfig };