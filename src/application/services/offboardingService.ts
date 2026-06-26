import type { IOffboardingRepository } from '../ports/index.js';
import type { IOffboardingService } from '../serviceInterfaces/index.js';
import { DomainEventBus } from '../events/index.js';
import { OffboardingProcess, ProcessId, UserId } from '../../domain/index.js';

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
