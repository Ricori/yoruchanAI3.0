export interface RequestFirendEventData {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'request', // 上报类型
  request_type: 'friend', // 请求类型
  user_id: number, // 发送请求的 QQ 号
  comment: number, // 验证信息
  flag: number, // 请求 flag, 在调用处理请求的 API 时需要传入
}

interface PrivateSender {
  user_id?: number, // 发送者 QQ 号
  nickname?: string, // 昵称
  sex?: 'male' | 'female' | 'unknown', // 性别
  age?: number // 年龄
}

interface GroupSender extends PrivateSender {
  card?: string, // 群名片／备注
  area?: string, // 地区
  level?: string, // 成员等级
  role?: string, // 角色, owner 或 admin 或 member
  title?: string, // 专属头衔
}
interface Anonymous {
  id: number; // 匿名用户 ID
  name: string; // 匿名用户名称
  flag: string; // 匿名用户 flag, 在调用禁言 API 时需要传入
}

export interface PrivateMessageEventData {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'message', // 上报类型
  message_type: 'private', // 消息类型
  sub_type: 'friend' | 'group' | 'other', // 消息子类型,好友=friend,群临时会话=group
  temp_source: number, // 临时会话来源
  message_id: number, // 消息ID
  user_id: number, // 发送者QQ号
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
  font: number, // 字体
  sender: PrivateSender // 发送者信息
}

export interface GroupMessageEventData {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'message', // 上报类型
  message_type: 'group', // 消息类型
  sub_type: 'normal' | 'anonymous' | 'notice', // 正常消息=normal,匿名消息=anonymous,系统提示=notice
  message_id: number, // 消息ID
  group_id: number, // 群号
  user_id: number, // 发送者QQ号
  anonymous: Anonymous | null, // 匿名信息, 如果不是匿名消息则为 null
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
  font: number, // 字体
  sender: GroupSender // 发送者信息
}

export interface SimpleMessageData {
  message_id: number, // 消息ID
  real_id: number, // 消息真实id
  time: number, // 事件发生的时间戳
  sender: GroupSender // 发送者信息
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
}