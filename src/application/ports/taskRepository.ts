import type { Task, ProcessId } from '../../domain/index.js';

/**
 * SA-18: tasks are extracted via MCP during the interview and persisted to the backend over
 * Kafka (`tasks.extracted`). This read-only port exists solely for
 * `OffboardingOrchestrator` to rehydrate `OffboardingProcess.tasks` on restart, mirroring
 * `IInterviewRepository`.
 */
export interface ITaskRepository {
  findByProcessId(processId: ProcessId): Promise<Task[]>;
}
