import type { DomainEvent } from '../../domain/index.js';
import type { ReviewInterviewCompletedEvent } from '../../domain/index.js';
import { ReviewDossierGenerationRequestedEvent } from '../../domain/index.js';
import type { IDomainEventBus } from './domainEventBusInterface.js';

function isReviewInterviewCompletedEvent(event: DomainEvent): event is ReviewInterviewCompletedEvent {
  return event.eventName === 'review_interview.completed';
}

/**
 * Bridges the in-process DomainEventBus: when a review interview completes, kicks off dossier
 * generation for that process — mirrors createDossierGenerationTriggerHandler, but reviews have
 * no IDossierService involvement (no manager-channel publication requirement in SA-20), so this
 * publishes directly instead of delegating to a service.
 */
export function createReviewDossierGenerationTriggerHandler(eventBus: IDomainEventBus) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isReviewInterviewCompletedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await eventBus.publish(new ReviewDossierGenerationRequestedEvent(event.processId, event.reviewScope));
  };
}
