import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IDossierRepository } from '../../application/ports';
import type { Dossier, DossierSection } from '../../domain';
import { ProcessId } from '../../domain';
import { handleAxiosError, mapDossierResponse, mapDossierSectionToRequest } from '../http';
import type { BackendDossierResponse } from '../http';

export class HttpDossierRepository implements IDossierRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async create(processId: ProcessId, summary?: string, sections: DossierSection[] = []): Promise<Dossier> {
    try {
      const body: { sections: ReturnType<typeof mapDossierSectionToRequest>[]; summary?: string } = {
        sections: sections.map(mapDossierSectionToRequest),
        ...(summary !== undefined ? { summary } : {}),
      };
      const response = await this.#http.post<BackendDossierResponse>(
        `/offboarding/${processId.value}/dossier`,
        body,
      );
      return mapDossierResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'dossier');
    }
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
