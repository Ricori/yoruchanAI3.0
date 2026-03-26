import { SimpleIntervalJob, Task } from 'toad-scheduler';
import yoruStorage from '@/core/yoruStorage';

const task = new Task('systemCleanupTask', () => {
  // 清理会话缓存
  yoruStorage.cleanChatConversations();
});

const SystemCleanupJob = new SimpleIntervalJob({ days: 2 }, task, { id: 'systemCleanup' });


export default SystemCleanupJob;
