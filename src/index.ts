
import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import { requestFirendListener } from './listener/request/requestFriend';
import { adminMessageListener } from './listener/message/admin';
import { commonMessageListener, defalutMessageListener } from './listener/message/common';
import { groupMessageListener } from './listener/message/group';
import BilibiliNewSharedJob from './tasks/bilibili';


// 绑定好友请监听
yorubot.bindRequestFirendListener(requestFirendListener);

// 绑定私聊消息监听
yorubot.bindPrivateMessageListeners([
  adminMessageListener,
  commonMessageListener,
  defalutMessageListener,
]);

// 绑定群@消息监听
yorubot.bindGroupAtBotMessageListeners([
  commonMessageListener,
  defalutMessageListener,
]);

// 绑定群所有消息默认监听
yorubot.bindGroupCommonMessageListeners([
  groupMessageListener,
]);

// 启动 Bot 连接
yorubot.start();

// 初始化并启动定时任务
yoruSchedule.initJobList([
  BilibiliNewSharedJob,
]);

