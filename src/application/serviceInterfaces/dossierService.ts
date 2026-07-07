import type { InterviewTurn } from '../../domain';

export interface IDossierService {
  handleInterviewCompleted(processId: string, interviewId: string, turns: readonly InterviewTurn[]): Promise<void>;
  publishDossier(processId: string): Promise<void>;
}
