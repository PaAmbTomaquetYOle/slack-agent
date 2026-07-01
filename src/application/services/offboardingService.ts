import type { IOffboardingProcessRepository, IUserInfoProvider } from '../ports';
import type { IOffboardingService } from '../serviceInterfaces';
import type { IDomainEventBus } from '../events';
import type { OffboardingProcess } from '../../domain';
import { UserId, OffboardingStartedEvent } from '../../domain';

export class OffboardingService implements IOffboardingService {
  readonly #repository: IOffboardingProcessRepository;
  readonly #eventBus: IDomainEventBus;
  readonly #userInfoProvider: IUserInfoProvider;

  constructor(
    repository: IOffboardingProcessRepository,
    eventBus: IDomainEventBus,
    userInfoProvider: IUserInfoProvider,
  ) {
    this.#repository = repository;
    this.#eventBus = eventBus;
    this.#userInfoProvider = userInfoProvider;
  }

  async startOffboarding(departingUserId: string, initiatorId: string): Promise<OffboardingProcess> {
    const [employeeName, managerName] = await Promise.all([
      this.#userInfoProvider.getDisplayName(departingUserId),
      this.#userInfoProvider.getDisplayName(initiatorId),
    ]);
    const process = await this.#repository.create(
      new UserId(departingUserId),
      new UserId(initiatorId),
      employeeName ?? undefined,
      managerName ?? undefined,
    );
    const event = new OffboardingStartedEvent(
      process.id,
      process.departingUserId,
      process.initiatorId,
    );
    await this.#eventBus.publish(event);
    return process;
  }
}
