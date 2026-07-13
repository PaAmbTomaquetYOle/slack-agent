import type { DomainEvent } from '../../domain/index.js';
import type { SopCreationRequestedEvent } from '../../domain/index.js';
import { SOP_CREATION_REQUESTED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isSopCreationRequestedEvent(event: DomainEvent): event is SopCreationRequestedEvent {
  return event.eventName === 'sop.creation_requested';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards SopCreationRequestedEvent
 * as a `sop.creation_requested` event for the backend to consume.
 */
export function createKafkaSopCreationRequestedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isSopCreationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: SOP_CREATION_REQUESTED,
      payload: {
        title: event.title,
        content: event.messageText,
        author: event.authorId.value,
        origin_channel: event.channelId.value,
      },
    });
  };
}
