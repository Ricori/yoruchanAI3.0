import { extractMemory } from '@/service/llm';
import { printError, printLog } from '@/utils/print';
import { getMemoryDb } from './db';
import { enqueueEmbedding } from './embedQueue';
import memoryStore from './store';
import type { EvidenceMessage } from './store';

/**
 * 记忆写入流水线：攒够一批消息就让 LLM 抽取，再与已有条目调和成增删改操作。
 *
 * 取代原来「整体重生成 6 条 trait」的做法——那样每次都要把旧印象重写一遍，
 * 长期事实和短期热点抢同样的格子，挤掉就再也回不来
 */

/** 每攒够 30 句触发一次 */
const EXTRACT_THRESHOLD = 30;

/** 抽取持续失败时缓冲区最多保留的消息数，避免无限增长 */
const MAX_BUFFER = EXTRACT_THRESHOLD * 3;

interface PendingBuffer {
  messages: EvidenceMessage[];
  nickName: string;
  isExtracting: boolean;
}

class MemoryExtractor {
  /** 已@过bot、需要追踪的用户ID集合 */
  private trackedUsers = new Set<number>();

  private pendingBuffers = new Map<number, PendingBuffer>();

  private loaded = false;

  /** 已经有记忆的人继续追踪。懒加载，避免 import 时就去建库 */
  private ensureTracked() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows = getMemoryDb().prepare(
        "SELECT DISTINCT owner_id FROM memory WHERE scope = 'user' AND superseded_by IS NULL",
      ).all() as { owner_id: number }[];
      rows.forEach((r) => this.trackedUsers.add(r.owner_id));
      printLog(`[MemoryExtract] 已加载 ${this.trackedUsers.size} 个用户记忆`);
    } catch (e) {
      printError(`[MemoryExtract] 加载用户列表失败: ${e}`);
    }
  }

  /**
   * 处理群消息：
   * - 若该消息 @了bot，将该用户加入追踪
   * - 若已追踪，累积消息；达到阈值后异步触发抽取
   */
  onMessage(
    groupId: number,
    userId: number,
    nickName: string,
    message: string,
    isMentionMe: boolean,
    messageId: number,
    observedAt: number,
  ) {
    this.ensureTracked();
    memoryStore.noteNickName(groupId, userId, nickName);

    if (isMentionMe) this.trackedUsers.add(userId);
    if (!this.trackedUsers.has(userId)) return;

    if (!this.pendingBuffers.has(userId)) {
      this.pendingBuffers.set(userId, {
        messages: [], nickName, isExtracting: false,
      });
    }

    const buffer = this.pendingBuffers.get(userId)!;
    buffer.nickName = nickName; // 保持最新昵称
    buffer.messages.push({
      groupId, messageId, observedAt, text: message,
    });

    if (buffer.messages.length >= EXTRACT_THRESHOLD && !buffer.isExtracting) {
      const batch = buffer.messages.splice(0, EXTRACT_THRESHOLD);
      this.triggerExtract(userId, buffer.nickName, batch).catch(() => { });
    }
  }

  /** 后台异步抽取，不阻塞主流程 */
  private async triggerExtract(
    userId: number,
    nickName: string,
    messages: EvidenceMessage[],
  ) {
    const buffer = this.pendingBuffers.get(userId);
    if (buffer) buffer.isExtracting = true;

    try {
      const existing = memoryStore.listUserMemories(userId).map((m) => ({
        id: m.id, kind: m.kind, text: m.text, pinned: m.pinned,
      }));

      printLog(`[MemoryExtract] 开始抽取用户 ${nickName}(${userId}) 的记忆...`);
      const ops = await extractMemory(nickName, messages.map((m) => m.text), existing);

      if (ops === null) {
        // 请求失败：把这批消息放回缓冲区头部，等下次一起重试，而不是无声丢弃
        if (buffer) {
          buffer.messages.unshift(...messages);
          if (buffer.messages.length > MAX_BUFFER) {
            buffer.messages.splice(0, buffer.messages.length - MAX_BUFFER);
          }
        }
        printError(`[MemoryExtract] 抽取用户 ${nickName}(${userId}) 失败，消息已放回缓冲区等待重试`);
        return;
      }

      if (ops.length === 0) return;

      // 单群批次记录来源群；跨群混合批次不随意归到最后一个群，记为跨群来源。
      const sourceGroups = new Set(messages.map((m) => m.groupId));
      const sourceGroupId = sourceGroups.size === 1 ? messages[0].groupId : null;
      const result = memoryStore.applyOps(userId, sourceGroupId, ops);
      const evicted = memoryStore.evict(userId);

      // 淘汰掉的不用再算向量
      const doomed = new Set(evicted);
      const changed = [...new Set([...result.added, ...result.updated])].filter((id) => !doomed.has(id));
      const evidenceBatch = memoryStore.attachEvidence(changed, userId, messages);
      enqueueEmbedding(changed);

      printLog(`[MemoryExtract] ${nickName}(${userId}) 记忆更新：`
        + `新增 ${result.added.length}、更新 ${result.updated.length}、删除 ${result.deleted.length}`
        + `${result.blocked > 0 ? `、挡下 ${result.blocked} 次对钉住条目的改动` : ''}`
        + `${evicted.length > 0 ? `、淘汰 ${evicted.length}` : ''}`
        + `${evidenceBatch === null ? '' : `、证据批次 ${evidenceBatch}`}`);
    } catch (e) {
      printError(`[MemoryExtract] 抽取用户 ${userId} 失败: ${e}`);
    } finally {
      if (buffer) buffer.isExtracting = false;
    }
  }
}

export default new MemoryExtractor();
