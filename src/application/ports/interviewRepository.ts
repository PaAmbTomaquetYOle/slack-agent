import type { Interview } from '../../domain/index.js';
import type { ProcessId } from '../../domain/index.js';

/**
 * BE-7: the backend's REST surface is read-only — interview writes now flow over Kafka
 * (see `IInterviewSessionStore` + the `interview.started`/`interview.completed` domain events).
 * This port only survives for `OffboardingOrchestrator.recover()` to rehydrate in-flight
 * interviews on restart.
 */
export interface IInterviewRepository {
  findByProcessId(processId: ProcessId): Promise<Interview | null>;
}
