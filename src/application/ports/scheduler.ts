export interface IScheduler {
  schedule(key: string, fireAt: Date, task: () => Promise<void>): void;
  cancel(key: string): void;
}
