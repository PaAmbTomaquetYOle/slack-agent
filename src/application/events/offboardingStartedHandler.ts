import type { DomainEvent } from '../../domain/index';
import type { IMessagingPort } from '../ports/index';
import type { OffboardingStartedEvent } from '../../domain/index';

export function createOffboardingStartedHandler(messagingPort: IMessagingPort) {
  return async (event: DomainEvent): Promise<void> => {
    const e = event as OffboardingStartedEvent;
    await messagingPort.sendDirectMessage(
      e.departingUserId.value,
      `Hi! An offboarding process has been started for you. We'll guide you through the knowledge handover. :wave:`,
    );
  };
}
