import type { DomainEvent } from '../../domain/index.js';
import type { OffboardingStartedEvent } from '../../domain/index.js';
import { OFFBOARDING_TRIGGERED } from '../../domain/index.js';
import type { IEventPublisher } from '../ports/index.js';

function isOffboardingStartedEvent(event: DomainEvent): event is OffboardingStartedEvent {
  return event.eventName === 'offboarding.started';
}

/**
 * Bridges the in-process DomainEventBus to Kafka: forwards OffboardingStartedEvent
 * as an `offboarding.triggered` event for the backend to consume.
 */
export function createKafkaOffboardingStartedForwarder(publisher: IEventPublisher) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isOffboardingStartedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await publisher.publish({
      eventType: OFFBOARDING_TRIGGERED,
      payload: {
        employee_id: event.departingUserId.value,
        manager_id: event.initiatorId.value,
        ...(event.employeeName !== undefined ? { employee_name: event.employeeName } : {}),
        ...(event.managerName !== undefined ? { manager_name: event.managerName } : {}),
      },
    });
  };
}
