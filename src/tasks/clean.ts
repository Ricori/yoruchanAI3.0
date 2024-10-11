import { SimpleIntervalJob, Task } from 'toad-scheduler';
import yoruStorage from '@/core/yoruStorage';

const task = new Task('systemCleanupTask', () => {

  // 清理qq群会话缓存
  yoruStorage.cleanGroupChatConversations();

})

const SystemCleanupJob = new SimpleIntervalJob({ days: 1, }, task, { id: 'systemCleanup' })


export default SystemCleanupJob;
