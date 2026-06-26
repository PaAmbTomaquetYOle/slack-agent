import type { DomainEvent } from '../../domain';
import type { IMessagingPort } from '../ports';
import type { OffboardingStartedEvent } from '../../domain';

function isOffboardingStartedEvent(event: DomainEvent): event is OffboardingStartedEvent {
  return event.eventName === 'offboarding.started';
}

export function createOffboardingStartedHandler(messagingPort: IMessagingPort) {
  return async (event: DomainEvent): Promise<void> => {
    if (!isOffboardingStartedEvent(event)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await messagingPort.sendDirectMessage(
      event.departingUserId.value,
      `Hi! An offboarding process has been started for you. We'll guide you through the knowledge handover. :wave:`,
    );
  };
}
