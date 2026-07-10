import type { DomainEvent } from '../../domain';
import type { OffboardingCancellationRequestedEvent } from '../../domain';
import { OFFBOARDING_CANCELLATION_REQUESTED } from '../../domain';
import type { IEventPublisher } from '../ports';

function isOffboardingCancellationRequestedEvent(
  event: DomainEvent,
): event is OffboardingCancellationRequestedEvent {
  return event.eventName === 'offboarding.cancellation_requested';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards
 * OffboardingCancellationRequestedEvent as an `offboarding.cancellation_requested` command for
 * the backend to consume, replacing the old `PATCH .../cancel` REST write.
 */
export function createKafkaOffboardingCancellationRequestedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isOffboardingCancellationRequestedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: OFFBOARDING_CANCELLATION_REQUESTED,
      payload: {
        process_id: event.processId.value,
      },
    });
  };
}
