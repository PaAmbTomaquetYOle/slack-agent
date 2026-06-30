import type { Dossier, DossierSection } from '../../domain';
import type { ProcessId } from '../../domain';

export interface IDossierRepository {
  create(processId: ProcessId, summary?: string, sections?: DossierSection[]): Promise<Dossier>;
  findByProcessId(processId: ProcessId): Promise<Dossier | null>;
}
