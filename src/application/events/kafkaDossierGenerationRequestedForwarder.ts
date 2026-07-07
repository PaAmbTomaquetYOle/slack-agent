import type { DomainEvent } from '../../domain';
import type { DossierGenerationRequestedEvent } from '../../domain';
import { DOSSIER_GENERATION_REQUESTED } from '../../domain';
import type { IEventPublisher } from '../ports';

function isDossierGenerationRequestedEvent(event: DomainEvent): event is DossierGenerationRequestedEvent {
  return event.eventName === 'dossier.generation_requested';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards DossierGenerationRequestedEvent
 * as a `dossier.generation_requested` event for the backend to consume.
 */
export function createKafkaDossierGenerationRequestedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isDossierGenerationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: DOSSIER_GENERATION_REQUESTED,
      payload: {
        process_id: event.processId.value,
        summary: event.draft.summary,
        sections: event.draft.sections.map((section) => ({ title: section.title, content: section.content })),
      },
    });
  };
}
