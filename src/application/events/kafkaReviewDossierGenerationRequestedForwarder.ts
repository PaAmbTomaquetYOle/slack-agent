import type { DomainEvent } from '../../domain/index.js';
import type { ReviewDossierGenerationRequestedEvent } from '../../domain/index.js';
import {
  MONTHLY_REVIEW_DOSSIER_GENERATION_REQUESTED,
  ANNUAL_REVIEW_DOSSIER_GENERATION_REQUESTED,
} from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isReviewDossierGenerationRequestedEvent(
  event: DomainEvent,
): event is ReviewDossierGenerationRequestedEvent {
  return event.eventName === 'review_dossier_generation_requested';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards
 * ReviewDossierGenerationRequestedEvent as `monthly_review.dossier_generation_requested` or
 * `annual_review.dossier_generation_requested`, picked by event.reviewScope (SA-20).
 */
export function createKafkaReviewDossierGenerationRequestedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isReviewDossierGenerationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    const eventType =
      event.reviewScope === 'monthly'
        ? MONTHLY_REVIEW_DOSSIER_GENERATION_REQUESTED
        : ANNUAL_REVIEW_DOSSIER_GENERATION_REQUESTED;
    await publisher.publish({
      eventType,
      payload: { process_id: event.processId.value },
    });
  };
}
