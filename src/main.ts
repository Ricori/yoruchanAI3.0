import YBot from './core/YBot';
import initProxy from './proxy';
import { requestFirendListener } from './listener/request/requestFriend';
import { adminMessageListener } from './listener/message/admin';
import { commonMessageListener, defalutMessageListener } from './listener/message/common';
import { groupMessageListener } from './listener/message/group';

// https://docs.go-cqhttp.org/event/
// https://12.onebot.dev/interface/event/notice/
// https://github.com/momocow/node-cq-websocket/blob/master/docs/api/EventListener.md#eventlistener

export default function init() {
  const ybot = YBot.getInstance();

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

  // 启动连接
  ybot.connect();
}
