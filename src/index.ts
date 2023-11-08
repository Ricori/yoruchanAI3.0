
import yorubot from '@/core/yoruBot';
import yoruSchedule from '@/core/yoruSchedule';
import BilibiliNewSharedJob from '@/tasks/bilibili';
import RequestFriendModule from '@/modules/request/requestFriend';
import AdminModule from '@/modules/admin/admin';
import ImageSearchModule from '@/modules/general/imageSearch';
import HPicModule from '@/modules/general/hPic';
import DefaultReplyModule from '@/modules/general/default';
import RepeaterModule from '@/modules/group/repeater';

// 加载好友请求模块
yorubot.loadModule('request', [RequestFriendModule]);

// 加载私聊消息模块
yorubot.loadModule('private', [
  AdminModule,
  ImageSearchModule,
  HPicModule,
  DefaultReplyModule
]);

// 加载群@消息模块
yorubot.loadModule('groupAt', [
  ImageSearchModule,
  HPicModule,
  DefaultReplyModule
]);

// 加载群消息默认监听
yorubot.loadModule('group', [
  HPicModule,
  RepeaterModule
]);

// 加载定时任务
yoruSchedule.loadJob([
  BilibiliNewSharedJob,
]);

// 夜夜酱，启 —— 动 ！！
yorubot.start();