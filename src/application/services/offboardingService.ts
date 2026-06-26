import type { IOffboardingRepository } from '../ports/index';
import type { IOffboardingService } from '../serviceInterfaces/index';
import { DomainEventBus } from '../events/index';
import { OffboardingProcess, ProcessId, UserId } from '../../domain/index';

export class OffboardingService implements IOffboardingService {
  readonly #repository: IOffboardingRepository;
  readonly #eventBus: DomainEventBus;

  constructor(repository: IOffboardingRepository, eventBus: DomainEventBus) {
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
    for (const event of events) {
      await this.#eventBus.publish(event);
    }
    return process;
  }
}
