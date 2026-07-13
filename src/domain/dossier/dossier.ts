import type { DossierId } from '../valueObjects/index.js';
import type { ProcessId } from '../valueObjects/index.js';
import type { InterviewId } from '../valueObjects/index.js';
import type { DossierSection } from './dossierSection.js';

export interface Dossier {
  readonly id: DossierId;
  readonly processId: ProcessId;
  readonly interviewId: InterviewId;
  readonly state: string;
  readonly createdAt: Date;
  readonly summary: string | null;
  readonly sections: readonly DossierSection[];
}
