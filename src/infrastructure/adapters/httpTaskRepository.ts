import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { ITaskRepository } from '../../application/ports';
import type { Task, ProcessId } from '../../domain';
import { handleAxiosError, mapTaskResponse } from '../http';
import type { BackendTaskListResponse } from '../http';

/**
 * SA-18: tasks are read-only over HTTP — they're written via the `tasks.extracted` Kafka event.
 * This adapter survives solely so `OffboardingOrchestrator.recover()` can rehydrate an
 * offboarding process' extracted Jira/Trello tasks after a restart, mirroring
 * `HttpInterviewRepository`.
 */
export class HttpTaskRepository implements ITaskRepository {
  readonly #http: AxiosInstance;

  constructor(http: AxiosInstance) {
    this.#http = http;
  }

  async findByProcessId(processId: ProcessId): Promise<Task[]> {
    try {
      const response = await this.#http.get<BackendTaskListResponse>(
        `/offboarding/${processId.value}/tasks`,
      );
      return response.data.items.map(mapTaskResponse);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return [];
      return handleAxiosError(error, 'task');
    }
  }
}
