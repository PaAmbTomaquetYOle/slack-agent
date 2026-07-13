import { describe, it, expect, vi } from 'vitest';
import { createReviewDossierGenerationTriggerHandler } from '../reviewDossierGenerationTriggerHandler.js';
import type { IDomainEventBus } from '../domainEventBusInterface.js';
import { ReviewInterviewCompletedEvent, ProcessId, InterviewId, ReviewDossierGenerationRequestedEvent } from '../../../domain/index.js';

function makeEventBusMock(): IDomainEventBus {
  return { subscribe: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) };
}

describe('createReviewDossierGenerationTriggerHandler', () => {
  it('publishes ReviewDossierGenerationRequestedEvent carrying the same processId and reviewScope', async () => {
    const eventBus = makeEventBusMock();
    const handle = createReviewDossierGenerationTriggerHandler(eventBus);
    const event = new ReviewInterviewCompletedEvent(new ProcessId('proc-1'), new InterviewId('int-1'), 'annual', []);

    await handle(event);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ReviewDossierGenerationRequestedEvent.EVENT_NAME,
        processId: event.processId,
        reviewScope: 'annual',
      }),
    );
  });

  it('throws on an unexpected event type', async () => {
    const handle = createReviewDossierGenerationTriggerHandler(makeEventBusMock());
    await expect(handle({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
