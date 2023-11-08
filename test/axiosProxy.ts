import Axios from 'axios';
import tunnel from 'tunnel';

Axios.defaults.proxy = false;

// 本地代理服务器
Axios.defaults.httpsAgent = tunnel.httpsOverHttp({
  proxy: {
    host: '127.0.0.1',
    port: 7890,
  }
});

