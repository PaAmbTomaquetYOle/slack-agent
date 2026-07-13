import type { DomainEvent } from '../../domain/index.js';
import type { SopCandidateOfferedEvent } from '../../domain/index.js';
import { SOP_CANDIDATE_OFFERED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isSopCandidateOfferedEvent(event: DomainEvent): event is SopCandidateOfferedEvent {
  return event.eventName === 'sop.candidate_offered';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards SopCandidateOfferedEvent
 * as a `sop.candidate_offered` event so the backend can persist the candidate (SA-16).
 */
export function createKafkaSopCandidateOfferedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isSopCandidateOfferedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: SOP_CANDIDATE_OFFERED,
      payload: {
        channel_id: event.channelId.value,
        author_id: event.authorId.value,
        message_ts: event.messageTs,
        content: event.messageText,
      },
    });
  };
}
