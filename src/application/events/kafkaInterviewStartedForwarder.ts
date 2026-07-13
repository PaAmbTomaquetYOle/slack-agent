import type { DomainEvent } from '../../domain/index.js';
import type { InterviewStartedEvent } from '../../domain/index.js';
import { INTERVIEW_STARTED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isInterviewStartedEvent(event: DomainEvent): event is InterviewStartedEvent {
  return event.eventName === 'interview.started';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards InterviewStartedEvent
 * as an `interview.started` event for the backend to consume.
 */
export function createKafkaInterviewStartedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isInterviewStartedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: INTERVIEW_STARTED,
      payload: {
        process_id: event.processId.value,
      },
    });
  };
}
