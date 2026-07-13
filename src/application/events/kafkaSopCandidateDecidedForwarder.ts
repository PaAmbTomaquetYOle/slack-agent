import type { DomainEvent } from '../../domain/index.js';
import type { SopCandidateDecidedEvent } from '../../domain/index.js';
import { SOP_CANDIDATE_DECIDED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isSopCandidateDecidedEvent(event: DomainEvent): event is SopCandidateDecidedEvent {
  return event.eventName === 'sop.candidate_decided';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards SopCandidateDecidedEvent
 * as a `sop.candidate_decided` event so the backend records the candidate's decision (SA-16).
 */
export function createKafkaSopCandidateDecidedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isSopCandidateDecidedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: SOP_CANDIDATE_DECIDED,
      payload: {
        channel_id: event.channelId.value,
        message_ts: event.messageTs,
        accepted: event.accepted,
      },
    });
  };
}
