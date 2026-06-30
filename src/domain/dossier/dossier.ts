import type { DossierId } from '../valueObjects';
import type { ProcessId } from '../valueObjects';
import type { InterviewId } from '../valueObjects';
import type { DossierSection } from './dossierSection';

export interface Dossier {
  readonly id: DossierId;
  readonly processId: ProcessId;
  readonly interviewId: InterviewId;
  readonly state: string;
  readonly createdAt: Date;
  readonly summary: string | null;
  readonly sections: readonly DossierSection[];
}
