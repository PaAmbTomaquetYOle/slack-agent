import type { IScheduler } from '../../application/ports';

export class InMemoryScheduler implements IScheduler {
  readonly #timers = new Map<string, NodeJS.Timeout>();

  schedule(key: string, fireAt: Date, task: () => Promise<void>): void {
    this.cancel(key);
    const delayMs = Math.max(0, fireAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.#timers.delete(key);
      task().catch((error: unknown) => {
        console.error(`Scheduled task '${key}' failed:`, error);
      });
    }, delayMs);
    this.#timers.set(key, timer);
  }

  cancel(key: string): void {
    const timer = this.#timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(key);
    }
  }
}
