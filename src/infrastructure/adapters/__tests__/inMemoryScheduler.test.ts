import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryScheduler } from '../inMemoryScheduler';

describe('InMemoryScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the task once the fireAt time elapses', async () => {
    const scheduler = new InMemoryScheduler();
    const task = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule('key-1', new Date(Date.now() + 1000), task);
    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents a scheduled task from firing', async () => {
    const scheduler = new InMemoryScheduler();
    const task = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule('key-1', new Date(Date.now() + 1000), task);
    scheduler.cancel('key-1');

    await vi.advanceTimersByTimeAsync(2000);
    expect(task).not.toHaveBeenCalled();
  });

  it('re-scheduling the same key replaces the previous timer', async () => {
    const scheduler = new InMemoryScheduler();
    const firstTask = vi.fn().mockResolvedValue(undefined);
    const secondTask = vi.fn().mockResolvedValue(undefined);

    scheduler.schedule('key-1', new Date(Date.now() + 1000), firstTask);
    scheduler.schedule('key-1', new Date(Date.now() + 2000), secondTask);

    await vi.advanceTimersByTimeAsync(1000);
    expect(firstTask).not.toHaveBeenCalled();
    expect(secondTask).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(secondTask).toHaveBeenCalledTimes(1);
  });

  it('cancel is a no-op for an unknown key', () => {
    const scheduler = new InMemoryScheduler();
    expect(() => scheduler.cancel('missing')).not.toThrow();
  });

  it('logs and swallows a rejected task instead of throwing', async () => {
    const scheduler = new InMemoryScheduler();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const task = vi.fn().mockRejectedValue(new Error('boom'));

    scheduler.schedule('key-1', new Date(Date.now() + 1000), task);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(task).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
