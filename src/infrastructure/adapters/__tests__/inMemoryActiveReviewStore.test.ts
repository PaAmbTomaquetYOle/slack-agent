import { describe, it, expect } from 'vitest';
import { InMemoryActiveReviewStore } from '../inMemoryActiveReviewStore';
import { ProcessId, UserId } from '../../../domain';

describe('InMemoryActiveReviewStore', () => {
  it('has no active review for an employee until start() is called', () => {
    const store = new InMemoryActiveReviewStore();
    expect(store.find(new UserId('U1'))).toBeNull();
  });

  it('start() tracks the review as active', () => {
    const store = new InMemoryActiveReviewStore();
    const employeeId = new UserId('U1');
    const processId = new ProcessId('proc-1');

    const active = store.start(employeeId, processId, 'monthly');

    expect(active).toEqual({ employeeId, processId, reviewScope: 'monthly' });
    expect(store.find(employeeId)).toEqual(active);
  });

  it('start() is idempotent — a redelivered trigger replaces rather than throws', () => {
    const store = new InMemoryActiveReviewStore();
    const employeeId = new UserId('U1');
    store.start(employeeId, new ProcessId('proc-1'), 'monthly');

    expect(() => store.start(employeeId, new ProcessId('proc-1'), 'monthly')).not.toThrow();
  });

  it('start() replaces an existing active review for the employee', () => {
    const store = new InMemoryActiveReviewStore();
    const employeeId = new UserId('U1');
    store.start(employeeId, new ProcessId('proc-old'), 'monthly');

    const replaced = store.start(employeeId, new ProcessId('proc-new'), 'annual');

    expect(store.find(employeeId)).toEqual(replaced);
    expect(store.find(employeeId)?.processId.value).toBe('proc-new');
    expect(store.find(employeeId)?.reviewScope).toBe('annual');
  });

  it('end() stops tracking the review', () => {
    const store = new InMemoryActiveReviewStore();
    const employeeId = new UserId('U1');
    store.start(employeeId, new ProcessId('proc-1'), 'monthly');

    store.end(employeeId);

    expect(store.find(employeeId)).toBeNull();
  });

  it('end() is a no-op when nothing is tracked for the employee', () => {
    const store = new InMemoryActiveReviewStore();
    expect(() => store.end(new UserId('U1'))).not.toThrow();
  });

  it('tracks different employees independently', () => {
    const store = new InMemoryActiveReviewStore();
    const alice = new UserId('U1');
    const bob = new UserId('U2');
    store.start(alice, new ProcessId('proc-alice'), 'monthly');
    store.start(bob, new ProcessId('proc-bob'), 'annual');

    expect(store.find(alice)?.processId.value).toBe('proc-alice');
    expect(store.find(bob)?.processId.value).toBe('proc-bob');
  });
});
