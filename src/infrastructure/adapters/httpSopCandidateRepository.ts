import type { AxiosInstance } from 'axios';
import type { ISopCandidateReadRepository, PendingSopCandidate } from '../../application/ports';
import { handleAxiosError, mapSopCandidateResponse } from '../http';
import type { BackendSopCandidateListResponse } from '../http';

/**
 * BE-7/SA-16: read-only — candidate writes flow over Kafka. This adapter survives solely so
 * `SopService` can rehydrate its in-memory candidate cache from the backend after a restart.
 */
export class HttpSopCandidateRepository implements ISopCandidateReadRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async findPending(): Promise<PendingSopCandidate[]> {
    try {
      const response = await this.#http.get<BackendSopCandidateListResponse>('/sop-candidates');
      return response.data.items.map(mapSopCandidateResponse);
    } catch (error) {
      return handleAxiosError(error, 'sop-candidate');
    }
  }
}
