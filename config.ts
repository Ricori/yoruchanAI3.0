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


    searchLimit: 30,
    textMode: false,
    repeater: {
      enable: true,
      times: 3
    },
    setu: {
      enable: true,
      allowPM: true,
      cd: 5,
      deleteTime: 0,
      limit: 30,
      whiteGroup: [],
      whiteOnly: false,
      whiteCd: 5,
      whiteDeleteTime: 60
    }
  },

}

export default config;
