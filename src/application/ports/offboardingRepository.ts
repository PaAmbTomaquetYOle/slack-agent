import type { OffboardingProcess } from '../../domain';
import type { ProcessId } from '../../domain';

export interface IOffboardingRepository {
  save(process: OffboardingProcess): Promise<void>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
}
