import { MessageType } from "@/types/event";


export default class YoruModuleBase<T extends MessageType> {

  /** 模块唯一名称 */
  static NAME = '';

  /** 消息数据 */
  protected data: T;

  /** 结束标志，如设定为true，将中止调用链（下个Module不会调用） */
  protected finished = false;

  /** 调用链上共享的额外数据 */
  protected extraData: Record<string, string>;

  constructor(data: T, extraData: Record<string, string>) {
    this.data = data;
    this.extraData = extraData;
  }

  /** 检查是否命中条件，如命中返回true */
  async checkConditions() {
    return false;
  };

  /** 命中条件后具体操作方法
   * 如有需要传递给后续Module的信息，请修改 this.extraData;
   * 如需要运行完后中止调用链，请设定结束标志 this.finished = true;
   */
  async run() { };

  /** 处理后续数据 */
  processingNextData() {
    return { finished: this.finished, extraData: this.extraData }
  }

}

