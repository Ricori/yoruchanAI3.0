export const TEST_FORWARD = [
  {
    "type": "node",
    "data": {
      "name": "不乖不生",
      "uin": "1040727286",
      "content": "测试消息1"
    }
  },
  {
    "type": "node",
    "data": {
      "name": "最后的绿色",
      "uin": "272731803",
      "content": "[CQ:image,file=69ba2666992e6d53bc8d9699bad56769.image,url=https://c2cpicdw.qpic.cn/offpic_new/0/515302066-104604596-69BA2666992E6D53BC8D9699BAD56769/0?term=3]"
    }
  }
]

const t2 = {
  "action": "send_group_forward_msg",
  "params": {
    "group_id": "829349264",
    "messages": [
      {
        "type": "node",
        "data": {
          "name": "不乖不生",
          "uin": "1040727286",
          "content": "今天有请绿酱来发色图"
        }
      },
      {
        "type": "node",
        "data": {
          "name": "最后的绿色",
          "uin": "272731803",
          "content": "遵命"
        }
      },
      {
        "type": "node",
        "data": {
          "name": "最后的绿色",
          "uin": "272731803",
          "content": "[CQ:image,file=69ba2666992e6d53bc8d9699bad56769.image,url=https://c2cpicdw.qpic.cn/offpic_new/0/515302066-104604596-69BA2666992E6D53BC8D9699BAD56769/0?term=3]"
        }
      }
    ],
  },
  "echo": "1232"
}

const t3 = {
  "action": "get_ai_record",
  "params": {
    "character": "lucy-voice-xueling",
    "group_id": "829349264",
    "text": "今天有请绿酱来发色图"
  }
}

const t4 = {
  "action": "set_msg_emoji_like",
  "params": {
    "message_id": "284746853",
    "emoji_id": "2"
  }
}