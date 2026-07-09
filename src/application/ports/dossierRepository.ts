import type { Dossier } from '../../domain';
import type { ProcessId } from '../../domain';

/**
 * BE-7: the backend's REST surface is read-only — dossier creation now flows over Kafka
 * (`dossier.generation_requested`, produced by `DossierService`). This port keeps only the
 * read `DossierGeneratedHandler`/`OffboardingOrchestrator` still need.
 */
export interface IDossierRepository {
  findByProcessId(processId: ProcessId): Promise<Dossier | null>;
}
