import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IInterviewRepository } from '../../application/ports';
import type { Interview, ProcessId } from '../../domain';
import { handleAxiosError, mapInterviewResponse } from '../http';
import type { BackendInterviewResponse } from '../http';

/**
 * BE-7: the backend's interview REST endpoints are read-only now — turn-by-turn state lives in
 * `IInterviewSessionStore` and only `interview.started`/`interview.completed` cross over to
 * Kafka. This adapter survives solely so `OffboardingOrchestrator.recover()` can rehydrate the
 * last known snapshot of an in-flight interview after a restart.
 */
export class HttpInterviewRepository implements IInterviewRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async findByProcessId(processId: ProcessId): Promise<Interview | null> {
    try {
      const response = await this.#http.get<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview`,
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      return handleAxiosError(error, 'interview');
    }
  }
}
