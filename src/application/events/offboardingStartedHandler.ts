import type { DomainEvent } from '../../domain';
import type { IMessagingPort } from '../ports';
import { OffboardingStartedEvent } from '../../domain';

export function createOffboardingStartedHandler(messagingPort: IMessagingPort) {
  return async (event: DomainEvent): Promise<void> => {
    if (!(event instanceof OffboardingStartedEvent)) {
      throw new Error(`Unexpected event type: ${event.eventName}`);
    }
    await messagingPort.sendDirectMessage(
      event.departingUserId.value,
      `Hi! An offboarding process has been started for you. We'll guide you through the knowledge handover. :wave:`,
    );
  };
}
