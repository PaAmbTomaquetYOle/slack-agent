import type { InterviewId } from '../valueObjects';
import type { ProcessId } from '../valueObjects';
import type { InterviewTurn } from './interviewTurn';

export interface Interview {
  readonly id: InterviewId;
  readonly processId: ProcessId;
  readonly state: string;
  readonly scheduledAt: Date;
  readonly createdAt: Date;
  readonly turns: readonly InterviewTurn[];
}
