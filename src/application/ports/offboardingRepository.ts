import type { OffboardingProcess, ProcessId } from '../../domain/index.js';

export interface IOffboardingRepository {
  save(process: OffboardingProcess): Promise<void>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
}

/**
 * BE-7: the backend's REST surface is read-only — offboarding-process writes now flow over
 * Kafka (`offboarding.triggered`, `offboarding.cancellation_requested`, ...). This port keeps
 * only the reads `InterviewService#findActiveProcess` and `OffboardingOrchestrator.recover()`
 * still need.
 */
export interface IOffboardingProcessRepository {
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
  findAll(filters?: { employeeId?: string; managerId?: string; state?: string }): Promise<{ items: OffboardingProcess[]; count: number }>;
}
