import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IOffboardingProcessRepository } from '../../application/ports/index.js';
import type { OffboardingProcess } from '../../domain/index.js';
import type { ProcessId } from '../../domain/index.js';
import { handleAxiosError, mapOffboardingResponse } from '../http/index.js';
import type { BackendOffboardingResponse, BackendOffboardingListResponse } from '../http/index.js';

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/**
 * BE-7: the backend's offboarding REST endpoints are read-only now — writes (create/start/
 * submit-for-review/complete/cancel/delete) flow over Kafka instead (see the domain-event
 * forwarders in `application/events`). This adapter only implements the surviving reads.
 */
export class HttpOffboardingProcessRepository implements IOffboardingProcessRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async findById(id: ProcessId): Promise<OffboardingProcess | null> {
    try {
      const response = await this.#http.get<BackendOffboardingResponse>(`/offboarding/${id.value}`);
      return mapOffboardingResponse(response.data);
    } catch (error) {
      if (isNotFound(error)) return null;
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }

  async findAll(filters?: { employeeId?: string; managerId?: string; state?: string }): Promise<{ items: OffboardingProcess[]; count: number }> {
    try {
      const params: Record<string, string> = {};
      if (filters?.employeeId) params['employee_id'] = filters.employeeId;
      if (filters?.managerId) params['manager_id'] = filters.managerId;
      if (filters?.state) params['state'] = filters.state;
      const response = await this.#http.get<BackendOffboardingListResponse>('/offboarding', { params });
      return {
        items: response.data.items.map(mapOffboardingResponse),
        count: response.data.count,
      };
    } catch (error) {
      return handleAxiosError(error, 'offboarding process');
    }
  }
}
