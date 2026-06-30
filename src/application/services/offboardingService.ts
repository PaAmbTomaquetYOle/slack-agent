import type { IOffboardingProcessRepository } from '../ports';
import type { IOffboardingService } from '../serviceInterfaces';
import type { IDomainEventBus } from '../events';
import type { OffboardingProcess } from '../../domain';
import { UserId, OffboardingStartedEvent } from '../../domain';

export class OffboardingService implements IOffboardingService {
  readonly #repository: IOffboardingProcessRepository;
  readonly #eventBus: IDomainEventBus;

  constructor(repository: IOffboardingProcessRepository, eventBus: IDomainEventBus) {
    this.#repository = repository;
    this.#eventBus = eventBus;
  }

  async startOffboarding(departingUserId: string, initiatorId: string): Promise<OffboardingProcess> {
    const process = await this.#repository.create(
      new UserId(departingUserId),
      new UserId(initiatorId),
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
