import type { IOffboardingRepository } from '../ports';
import type { IOffboardingService } from '../serviceInterfaces';
import type { IDomainEventBus } from '../events';
import { OffboardingProcess, ProcessId, UserId } from '../../domain';

export class OffboardingService implements IOffboardingService {
  readonly #repository: IOffboardingRepository;
  readonly #eventBus: IDomainEventBus;

  constructor(repository: IOffboardingRepository, eventBus: IDomainEventBus) {
    this.#repository = repository;
    this.#eventBus = eventBus;
  }

  async startOffboarding(departingUserId: string, initiatorId: string): Promise<OffboardingProcess> {
    const process = OffboardingProcess.create(
      ProcessId.generate(),
      new UserId(departingUserId),
      new UserId(initiatorId),
    );
    await this.#repository.save(process);
    const events = process.pullDomainEvents();
    await Promise.all(events.map(e => this.#eventBus.publish(e)));
    return process;
  }
}
