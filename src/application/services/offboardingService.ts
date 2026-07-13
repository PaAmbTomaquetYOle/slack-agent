import type { IUserInfoProvider } from '../ports/index.js';
import type { IOffboardingService } from '../serviceInterfaces/index.js';
import type { IDomainEventBus } from '../events/index.js';
import { UserId, OffboardingStartedEvent } from '../../domain/index.js';

export class OffboardingService implements IOffboardingService {
  readonly #eventBus: IDomainEventBus;
  readonly #userInfoProvider: IUserInfoProvider;

  constructor(eventBus: IDomainEventBus, userInfoProvider: IUserInfoProvider) {
    this.#eventBus = eventBus;
    this.#userInfoProvider = userInfoProvider;
  }

  async startOffboarding(departingUserId: string, initiatorId: string): Promise<void> {
    const [employeeName, managerName] = await Promise.all([
      this.#userInfoProvider.getDisplayName(departingUserId),
      this.#userInfoProvider.getDisplayName(initiatorId),
    ]);
    // The backend mints the process_id when it consumes `offboarding.triggered` —
    // slack-agent no longer persists via REST, it only publishes to Kafka.
    const event = new OffboardingStartedEvent(
      new UserId(departingUserId),
      new UserId(initiatorId),
      employeeName ?? undefined,
      managerName ?? undefined,
    );
    await this.#eventBus.publish(event);
  }
}
