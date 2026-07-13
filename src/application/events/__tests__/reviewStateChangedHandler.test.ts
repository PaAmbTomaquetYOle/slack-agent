import { describe, it, expect, vi } from 'vitest';
import { ReviewStateChangedHandler } from '../handlers/reviewStateChangedHandler.js';
import type { IActiveReviewStore, IMessagingPort } from '../../ports/index.js';
import { MONTHLY_REVIEW_STATE_CHANGED, ANNUAL_REVIEW_STATE_CHANGED } from '../../../domain/index.js';
import type { KafkaEventEnvelope } from '../../../domain/index.js';

function envelope(eventType: string, payload: Record<string, unknown>): KafkaEventEnvelope {
  return { event_id: 'evt-1', event_type: eventType, occurred_at: '2024-01-01T00:00:00.000Z', payload };
}

function makeMessagingMock(): IMessagingPort {
  return { sendDirectMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeActiveReviewStoreMock(): IActiveReviewStore {
  return { find: vi.fn(), start: vi.fn(), end: vi.fn() };
}

describe('ReviewStateChangedHandler', () => {
  it('exposes the eventType it was constructed with', () => {
    const handler = new ReviewStateChangedHandler(
      MONTHLY_REVIEW_STATE_CHANGED,
      'monthly',
      makeActiveReviewStoreMock(),
      makeMessagingMock(),
    );
    expect(handler.eventType).toBe(MONTHLY_REVIEW_STATE_CHANGED);
  });

  it('starts tracking the review and DMs the employee when new_state is in_progress', async () => {
    const activeReviewStore = makeActiveReviewStoreMock();
    const messaging = makeMessagingMock();
    const handler = new ReviewStateChangedHandler(MONTHLY_REVIEW_STATE_CHANGED, 'monthly', activeReviewStore, messaging);

    await handler.handle(envelope(MONTHLY_REVIEW_STATE_CHANGED, {
      process_id: 'proc-1', previous_state: 'not_started', new_state: 'in_progress',
      employee_id: 'emp-1', manager_id: 'mgr-1',
    }));

    expect(activeReviewStore.start).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'emp-1' }),
      expect.objectContaining({ value: 'proc-1' }),
      'monthly',
    );
    expect(messaging.sendDirectMessage).toHaveBeenCalledWith('emp-1', expect.any(String));
  });

  it('uses the annual scope and intro message when constructed for annual', async () => {
    const activeReviewStore = makeActiveReviewStoreMock();
    const messaging = makeMessagingMock();
    const handler = new ReviewStateChangedHandler(ANNUAL_REVIEW_STATE_CHANGED, 'annual', activeReviewStore, messaging);

    await handler.handle(envelope(ANNUAL_REVIEW_STATE_CHANGED, {
      process_id: 'proc-1', previous_state: 'not_started', new_state: 'in_progress',
      employee_id: 'emp-1', manager_id: 'mgr-1',
    }));

    expect(activeReviewStore.start).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'annual');
  });

  it('stops tracking the review when new_state is not in_progress', async () => {
    const activeReviewStore = makeActiveReviewStoreMock();
    const messaging = makeMessagingMock();
    const handler = new ReviewStateChangedHandler(MONTHLY_REVIEW_STATE_CHANGED, 'monthly', activeReviewStore, messaging);

    await handler.handle(envelope(MONTHLY_REVIEW_STATE_CHANGED, {
      process_id: 'proc-1', previous_state: 'in_progress', new_state: 'finished',
      employee_id: 'emp-1', manager_id: 'mgr-1',
    }));

    expect(activeReviewStore.end).toHaveBeenCalledWith(expect.objectContaining({ value: 'emp-1' }));
    expect(activeReviewStore.start).not.toHaveBeenCalled();
    expect(messaging.sendDirectMessage).not.toHaveBeenCalled();
  });

  it('throws when the payload is missing required fields', async () => {
    const handler = new ReviewStateChangedHandler(
      MONTHLY_REVIEW_STATE_CHANGED,
      'monthly',
      makeActiveReviewStoreMock(),
      makeMessagingMock(),
    );
    await expect(handler.handle(envelope(MONTHLY_REVIEW_STATE_CHANGED, { process_id: 'proc-1' }))).rejects.toThrow();
  });
});
