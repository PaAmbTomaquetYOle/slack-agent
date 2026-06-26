import type { OffboardingProcess, ProcessId } from '../../domain';

export interface IOffboardingRepository {
  save(process: OffboardingProcess): Promise<void>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
}
