const config = {

  wsConfig: {
    host: "127.0.0.1",
    port: 6700,
    enableAPI: true,
    enableEvent: true,
    access_token: "",
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 8000,
  },

  yoruConfig: {
    admin: [515302066],       //管理员qq数组
    autoAddFriend: false,     //自动添加好友

    repeater: {
      enable: true,          //打开复读机
      times: 3               //几次重复后复读
    },


    searchLimit: 30,
    textMode: false,

    hPic: {                         //瑟图功能
      enable: true,                 //是否开启
      whiteOnly: false,             //只允许白名单群
      whiteGroup: [829349264],      //白名单群
      whiteGroupLimit: 2,           //白名单群拥有的权限,0=全年龄,1=混合,2=r18Only

    }
  },

}

export default config;
