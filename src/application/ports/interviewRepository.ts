import type { Interview, InterviewTurn } from '../../domain';
import type { ProcessId } from '../../domain';

export interface IInterviewRepository {
  upsert(processId: ProcessId, scheduledAt: Date, turns?: InterviewTurn[]): Promise<Interview>;
  findByProcessId(processId: ProcessId): Promise<Interview | null>;
  start(processId: ProcessId): Promise<Interview>;
  complete(processId: ProcessId): Promise<Interview>;
  cancel(processId: ProcessId): Promise<Interview>;
  addTurns(processId: ProcessId, turns: InterviewTurn[]): Promise<Interview>;
}
