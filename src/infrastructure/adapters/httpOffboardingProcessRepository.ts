import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { IOffboardingProcessRepository } from '../../application/ports';
import type { OffboardingProcess } from '../../domain';
import { ProcessId, UserId } from '../../domain';
import {
  handleAxiosError,
  mapOffboardingResponse,
  mapInterviewTurnToRequest,
} from '../http';
import type { BackendOffboardingResponse, BackendOffboardingListResponse } from '../http';

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export class HttpOffboardingProcessRepository implements IOffboardingProcessRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async create(departingUserId: UserId, initiatorId: UserId): Promise<OffboardingProcess> {
    try {
      const response = await this.#http.post<BackendOffboardingResponse>('/offboarding', {
        employee_id: departingUserId.value,
        manager_id: initiatorId.value,
      });
      return mapOffboardingResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process');
    }
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

  async delete(id: ProcessId): Promise<void> {
    try {
      await this.#http.delete(`/offboarding/${id.value}`);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }

  async start(id: ProcessId): Promise<OffboardingProcess> {
    try {
      const response = await this.#http.patch<BackendOffboardingResponse>(`/offboarding/${id.value}/start`);
      return mapOffboardingResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }

  async submitForReview(id: ProcessId): Promise<OffboardingProcess> {
    try {
      const response = await this.#http.patch<BackendOffboardingResponse>(`/offboarding/${id.value}/submit-for-review`);
      return mapOffboardingResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }

  async complete(id: ProcessId): Promise<OffboardingProcess> {
    try {
      const response = await this.#http.patch<BackendOffboardingResponse>(`/offboarding/${id.value}/complete`);
      return mapOffboardingResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }

  async cancel(id: ProcessId): Promise<OffboardingProcess> {
    try {
      const response = await this.#http.patch<BackendOffboardingResponse>(`/offboarding/${id.value}/cancel`);
      return mapOffboardingResponse(response.data);
    } catch (error) {
      return handleAxiosError(error, 'offboarding process', id.value);
    }
  }
}
