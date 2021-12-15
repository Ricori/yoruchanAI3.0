export interface IPrivateMessage {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'message', // 上报类型
  message_type: 'private', // 消息类型
  sub_type: 'friend' | 'group' | 'other', // 消息子类型,好友=friend,群临时会话=group
  message_id: number, // 消息ID
  user_id: number, // 发送者QQ号
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
  font: number, // 字体
  sender: { // 发送者信息
    user_id: number, // 发送者 QQ 号
    nickname: string, // 昵称
    sex: 'male' | 'female' | 'unknown', // 性别
    age: number // 年龄
  }
}

export interface IGroupMessage {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'message', // 上报类型
  message_type: 'group', // 消息类型
  sub_type: 'normal' | 'anonymous' | 'notice', // 正常消息=normal,匿名消息=anonymous,系统提示=notice
  message_id: number, // 消息ID
  group_id: number, // 群号
  user_id: number, // 发送者QQ号
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
  font: number, // 字体
  sender: { // 发送者信息
    user_id: number, // 发送者 QQ 号
    nickname: string, // 昵称
    card: string, // 群名片／备注
    sex: 'male' | 'female' | 'unknown', // 性别
    age: number, // 年龄
    area: string, // 地区
    level: string, // 成员等级
    role: 'owner' | 'admin' | 'member', // 角色
    title: string // 专属头衔
  }
}

export interface IAllMessage {
  time: number, // 事件发生的时间戳
  self_id: number, // 收到事件的机器人 QQ 号
  post_type: 'message', // 上报类型
  message_id: number, // 消息ID
  user_id: number, // 发送者QQ号
  message: string, // 消息内容
  raw_message: string, // 原始消息内容
  font: number, // 字体
  [propName: string]: any
}
