import type { IOffboardingRepository } from '../../application/ports';
import type { OffboardingProcess, ProcessId } from '../../domain';

export class InMemoryOffboardingRepository implements IOffboardingRepository {
  readonly #store: Map<string, OffboardingProcess> = new Map();

  async save(process: OffboardingProcess): Promise<void> {
    this.#store.set(process.id.value, process);
  }

  async findById(id: ProcessId): Promise<OffboardingProcess | null> {
    return this.#store.get(id.value) ?? null;
  }
}
