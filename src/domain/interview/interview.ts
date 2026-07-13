import type { InterviewId } from '../valueObjects/index.js';
import type { ProcessId } from '../valueObjects/index.js';
import type { InterviewTurn } from './interviewTurn.js';

export interface Interview {
  readonly id: InterviewId;
  readonly processId: ProcessId;
  readonly state: string;
  readonly scheduledAt: Date;
  readonly createdAt: Date;
  readonly turns: readonly InterviewTurn[];
}
