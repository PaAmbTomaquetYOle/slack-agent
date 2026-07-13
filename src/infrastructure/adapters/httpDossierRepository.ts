import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IDossierRepository } from '../../application/ports/index.js';
import type { Dossier, ProcessId } from '../../domain/index.js';
import { handleAxiosError, mapDossierResponse } from '../http/index.js';
import type { BackendDossierResponse } from '../http/index.js';

/**
 * BE-7: the backend's dossier REST endpoint is read-only now — creation flows over Kafka via
 * `dossier.generation_requested` (see `DossierService`). This adapter only implements the
 * surviving read, used by `DossierGeneratedHandler`/`OffboardingOrchestrator`.
 */
export class HttpDossierRepository implements IDossierRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async findByProcessId(processId: ProcessId): Promise<Dossier | null> {
    try {
      const response = await this.#http.get<BackendDossierResponse>(
        `/offboarding/${processId.value}/dossier`,
      );
      return mapDossierResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      return handleAxiosError(error, 'dossier');
    }
  }
}
