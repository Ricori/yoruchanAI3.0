import { ToadScheduler, SimpleIntervalJob } from 'toad-scheduler';
import { printLog } from '../utils/print';

class YoruSchedule {

  private scheduler = new ToadScheduler();

  loadJob(list: SimpleIntervalJob[]) {
    let count = 0;
    list.forEach((job) => {
      try {
        this.scheduler.addSimpleIntervalJob(job);
        count += 1;
      } catch (error) {
        printLog('[YoruSchedule] Scheduled task Add Error.');
      }
    });
    printLog(`[YoruSchedule] Successfully added ${count} scheduled tasks.`);
  }

  getById(id: string) {
    return this.scheduler.getById(id);
  }

  startById(id: string) {
    this.scheduler.startById(id);
  }

  stopById(id: string) {
    this.scheduler.stopById(id);
  }

  stopAll() {
    this.scheduler.stop();
  }

  removeById(id: string) {
    return this.scheduler.removeById(id);
  }
}

export default new YoruSchedule();