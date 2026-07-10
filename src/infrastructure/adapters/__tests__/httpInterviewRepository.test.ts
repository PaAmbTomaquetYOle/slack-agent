import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpInterviewRepository } from '../httpInterviewRepository';
import { ProcessId } from '../../../domain';
import type { BackendInterviewResponse } from '../../http';

function makeAxiosMock() {
  return {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as unknown as AxiosInstance;
}

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as never };
}

const sampleInterview: BackendInterviewResponse = {
  id: 'int-1',
  process_id: 'proc-1',
  state: 'scheduled',
  scheduled_at: '2024-01-02T10:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  turns: [],
};

// BE-7: the backend's interview REST endpoint is read-only now — only findByProcessId
// remains, used by OffboardingOrchestrator.recover() to rehydrate on restart.
describe('HttpInterviewRepository', () => {
  let http: AxiosInstance;
  let repo: HttpInterviewRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpInterviewRepository(http);
  });

  it('findByProcessId() GETs /offboarding/{id}/interview and returns mapped interview', async () => {
    vi.mocked(http.get).mockResolvedValue(axiosResponse(sampleInterview));
    const result = await repo.findByProcessId(new ProcessId('proc-1'));
    expect(http.get).toHaveBeenCalledWith('/offboarding/proc-1/interview');
    expect(result?.id.value).toBe('int-1');
  });

  it('findByProcessId() returns null on 404', async () => {
    const error = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    vi.mocked(http.get).mockRejectedValue(error);
    const result = await repo.findByProcessId(new ProcessId('proc-1'));
    expect(result).toBeNull();
  });
});
