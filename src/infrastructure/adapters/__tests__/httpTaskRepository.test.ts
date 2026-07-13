import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpTaskRepository } from '../httpTaskRepository.js';
import { ProcessId } from '../../../domain/index.js';
import type { BackendTaskListResponse } from '../../http/index.js';

function makeAxiosMock() {
  return {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as unknown as AxiosInstance;
}

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as never };
}

const sampleTasks: BackendTaskListResponse = {
  items: [
    { id: 'PROJ-1', title: 'Fix bug', source: 'jira', status: 'in_progress', url: null, description: null },
  ],
};

// SA-18: tasks are read-only over HTTP — writes flow via the tasks.extracted Kafka event. This
// repository exists solely for OffboardingOrchestrator.recover() to rehydrate on restart.
describe('HttpTaskRepository', () => {
  let http: AxiosInstance;
  let repo: HttpTaskRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpTaskRepository(http);
  });

  it('findByProcessId() GETs /offboarding/{id}/tasks and returns mapped tasks', async () => {
    vi.mocked(http.get).mockResolvedValue(axiosResponse(sampleTasks));
    const result = await repo.findByProcessId(new ProcessId('proc-1'));
    expect(http.get).toHaveBeenCalledWith('/offboarding/proc-1/tasks');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('PROJ-1');
  });

  it('findByProcessId() returns an empty array on 404', async () => {
    const error = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    vi.mocked(http.get).mockRejectedValue(error);
    const result = await repo.findByProcessId(new ProcessId('proc-1'));
    expect(result).toEqual([]);
  });
});
