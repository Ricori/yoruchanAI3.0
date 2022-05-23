import YBot from './core/YBot';
import YTime from './core/YTime';
import { requestFirendListener } from './listener/request/requestFriend';
import { adminMessageListener } from './listener/message/admin';
import { commonMessageListener, defalutMessageListener } from './listener/message/common';
import { groupMessageListener } from './listener/message/group';
import BilibiliNewSharedJob from './tasks/bilibili';
// import initProxy from './proxy';
// import '../test/axiosProxy.ts';

// https://docs.go-cqhttp.org/event/
// https://12.onebot.dev/interface/event/notice/
// https://github.com/momocow/node-cq-websocket/blob/master/docs/api/EventListener.md#eventlistener

export default function init() {
  const ybot = YBot.getInstance();
  const ytime = YTime.getInstance();

  // 绑定好友请监听
  ybot.bindRequestFirendListener(requestFirendListener);

  // 绑定私聊消息监听
  ybot.bindPrivateMessageListeners([
    adminMessageListener,
    commonMessageListener,
    defalutMessageListener,
  ]);

  // 绑定群@消息监听
  ybot.bindGroupAtBotMessageListeners([
    commonMessageListener,
    defalutMessageListener,
  ]);

  // 绑定群所有消息默认监听
  ybot.bindGroupCommonMessageListeners([
    groupMessageListener,
  ]);

  // 启动本地代理
  // initProxy();

  // 启动 Bot 连接
  ybot.connect();

  // 初始化并启动定时任务
  ytime.initJobList([
    BilibiliNewSharedJob
  ]);

}
