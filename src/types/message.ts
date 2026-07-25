export interface FormattedMessage {
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 消息的userId */
  userId: number;
  /** 是否提到了bot */
  isMentionMe: boolean;
  /** 文本消息 */
  message: string;
  /** 图片URL */
  imgUrl?: string;
  /** 是否添加缓存标记 */
  cacheControl?: boolean;
  /** bot 群聊发言的触发方式：true 为主动插话，false 为被 @ / 被回复后的应答 */
  initiative?: boolean;
  /** 主动插话当次实际使用的触发概率 */
  chance?: number;
  /** 这次回复注入了几条「旧账」历史发言，0 或未注入时不带此字段 */
  historyHits?: number;
  /** 这次回复额外认出并注入了几位被提到但没发言的群友，0 或未注入时不带此字段 */
  mentionHits?: number;
}
