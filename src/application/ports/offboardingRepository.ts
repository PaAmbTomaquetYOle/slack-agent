import type { OffboardingProcess, ProcessId, UserId } from '../../domain';

export interface IOffboardingRepository {
  save(process: OffboardingProcess): Promise<void>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
}

export interface IOffboardingProcessRepository {
  create(
    departingUserId: UserId,
    initiatorId: UserId,
    employeeName?: string,
    managerName?: string,
  ): Promise<OffboardingProcess>;
  findById(id: ProcessId): Promise<OffboardingProcess | null>;
  findAll(filters?: { employeeId?: string; managerId?: string; state?: string }): Promise<{ items: OffboardingProcess[]; count: number }>;
  delete(id: ProcessId): Promise<void>;
  start(id: ProcessId): Promise<OffboardingProcess>;
  submitForReview(id: ProcessId): Promise<OffboardingProcess>;
  complete(id: ProcessId): Promise<OffboardingProcess>;
  cancel(id: ProcessId): Promise<OffboardingProcess>;
}
