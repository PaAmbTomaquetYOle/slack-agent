import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IInterviewRepository } from '../../application/ports';
import type { Interview, InterviewTurn } from '../../domain';
import { ProcessId } from '../../domain';
import { handleAxiosError, mapInterviewResponse, mapInterviewTurnToRequest } from '../http';
import type { BackendInterviewResponse } from '../http';

export class HttpInterviewRepository implements IInterviewRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async upsert(processId: ProcessId, scheduledAt: Date, turns: InterviewTurn[] = []): Promise<Interview> {
    try {
      const response = await this.#http.put<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview`,
        {
          scheduled_at: scheduledAt.toISOString(),
          turns: turns.map(mapInterviewTurnToRequest),
        },
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'interview');
    }
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

  async start(processId: ProcessId): Promise<Interview> {
    try {
      const response = await this.#http.patch<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview/start`,
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'interview');
    }
  }

  async complete(processId: ProcessId): Promise<Interview> {
    try {
      const response = await this.#http.patch<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview/complete`,
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'interview');
    }
  }

  async cancel(processId: ProcessId): Promise<Interview> {
    try {
      const response = await this.#http.patch<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview/cancel`,
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'interview');
    }
  }

  async addTurns(processId: ProcessId, turns: InterviewTurn[]): Promise<Interview> {
    try {
      const response = await this.#http.post<BackendInterviewResponse>(
        `/offboarding/${processId.value}/interview/turns`,
        { turns: turns.map(mapInterviewTurnToRequest) },
      );
      return mapInterviewResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'interview');
    }
  }
}
