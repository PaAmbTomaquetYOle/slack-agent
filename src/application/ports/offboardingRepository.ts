import type { OffboardingProcess } from '../../domain/index.js';
import type { ProcessId } from '../../domain/index.js';

export interface IOffboardingRepository {
  save(process: OffboardingProcess): Promise<void>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
}
