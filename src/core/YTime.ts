import { ToadScheduler, SimpleIntervalJob } from 'toad-scheduler';
import { printLog } from '../utils/print';

export default class YTime {

  static instance: YTime;
  private scheduler = new ToadScheduler();

  static getInstance() {
    if (!YTime.instance) {
      YTime.instance = new YTime();
    }
    return YTime.instance;
  }

  initJobList(jobList: SimpleIntervalJob[]) {
    let count = 0;
    jobList.forEach(job => {
      try {
        this.scheduler.addSimpleIntervalJob(job);
        count += 1;
      } catch (error) {
        printLog('Scheduled task Add Error.')
      }
    })
    printLog(`Successfully added ${count} scheduled tasks.`)
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
    this.scheduler.stop()
  }

  removeById(id: string) {
    return this.scheduler.removeById(id)
  }

}