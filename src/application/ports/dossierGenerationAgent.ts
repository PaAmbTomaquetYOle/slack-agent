import type { DossierDraft, InterviewTurn } from '../../domain';

export interface DossierGenerationContext {
  employeeName: string;
  turns: readonly InterviewTurn[];
}

export interface IDossierGenerationAgent {
  generate(context: DossierGenerationContext): Promise<DossierDraft>;
}
