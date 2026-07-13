import { describe, it, expect, vi } from 'vitest';
import { createKafkaReviewDossierGenerationRequestedForwarder } from '../kafkaReviewDossierGenerationRequestedForwarder';
import type { IEventPublisher } from '../../ports';
import {
  ReviewDossierGenerationRequestedEvent,
  ProcessId,
  MONTHLY_REVIEW_DOSSIER_GENERATION_REQUESTED,
  ANNUAL_REVIEW_DOSSIER_GENERATION_REQUESTED,
} from '../../../domain';

function makePublisherMock(): IEventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined), publishMany: vi.fn().mockResolvedValue(undefined) };
}

describe('createKafkaReviewDossierGenerationRequestedForwarder', () => {
  it('forwards a monthly event as monthly_review.dossier_generation_requested', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaReviewDossierGenerationRequestedForwarder(publisher);
    const event = new ReviewDossierGenerationRequestedEvent(new ProcessId('proc-1'), 'monthly');

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: MONTHLY_REVIEW_DOSSIER_GENERATION_REQUESTED,
      payload: { process_id: 'proc-1' },
    });
  });

  it('forwards an annual event as annual_review.dossier_generation_requested', async () => {
    const publisher = makePublisherMock();
    const forward = createKafkaReviewDossierGenerationRequestedForwarder(publisher);
    const event = new ReviewDossierGenerationRequestedEvent(new ProcessId('proc-1'), 'annual');

    await forward(event);

    expect(publisher.publish).toHaveBeenCalledWith({
      eventType: ANNUAL_REVIEW_DOSSIER_GENERATION_REQUESTED,
      payload: { process_id: 'proc-1' },
    });
  });

  it('throws on an unexpected event type', async () => {
    const forward = createKafkaReviewDossierGenerationRequestedForwarder(makePublisherMock());
    await expect(forward({ eventName: 'other.event', occurredOn: new Date() })).rejects.toThrow();
  });
});
