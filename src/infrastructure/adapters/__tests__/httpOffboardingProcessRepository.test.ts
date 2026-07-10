import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpOffboardingProcessRepository } from '../httpOffboardingProcessRepository';
import { ProcessId } from '../../../domain';
import { BackendConnectionError, BackendError } from '../../http';
import type { BackendOffboardingResponse, BackendOffboardingListResponse } from '../../http';

function makeAxiosMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as unknown as AxiosInstance;
}

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as never };
}

const sampleResponse: BackendOffboardingResponse = {
  id: 'proc-1',
  employee_id: 'emp-1',
  manager_id: 'mgr-1',
  state: 'in_progress',
  interview_id: null,
  dossier_id: null,
  created_at: '2024-01-01T00:00:00Z',
};

// BE-7: the backend's offboarding REST endpoints are read-only now — only findById/findAll
// remain on this adapter. Writes flow over Kafka (see the domain-event forwarders).
describe('HttpOffboardingProcessRepository', () => {
  let http: AxiosInstance;
  let repo: HttpOffboardingProcessRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpOffboardingProcessRepository(http);
  });

  describe('findById()', () => {
    it('GETs /offboarding/{id} and returns mapped process', async () => {
      vi.mocked(http.get).mockResolvedValue(axiosResponse(sampleResponse));
      const result = await repo.findById(new ProcessId('proc-1'));
      expect(http.get).toHaveBeenCalledWith('/offboarding/proc-1');
      expect(result?.id.value).toBe('proc-1');
    });

    it('returns null when backend returns 404', async () => {
      const error = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404, data: { detail: 'Not found' } },
      });
      vi.mocked(http.get).mockRejectedValue(error);
      const result = await repo.findById(new ProcessId('missing'));
      expect(result).toBeNull();
    });

    it('throws BackendError on a non-404 backend error', async () => {
      const error = Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      });
      vi.mocked(http.get).mockRejectedValue(error);
      await expect(repo.findById(new ProcessId('proc-1'))).rejects.toThrow(BackendError);
    });
  });

  describe('findAll()', () => {
    it('GETs /offboarding with no params when no filters', async () => {
      const listResponse: BackendOffboardingListResponse = { items: [sampleResponse], count: 1 };
      vi.mocked(http.get).mockResolvedValue(axiosResponse(listResponse));
      const result = await repo.findAll();
      expect(http.get).toHaveBeenCalledWith('/offboarding', { params: {} });
      expect(result.count).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('passes filters as query params', async () => {
      const listResponse: BackendOffboardingListResponse = { items: [], count: 0 };
      vi.mocked(http.get).mockResolvedValue(axiosResponse(listResponse));
      await repo.findAll({ employeeId: 'emp-1', state: 'in_progress' });
      expect(http.get).toHaveBeenCalledWith('/offboarding', {
        params: { employee_id: 'emp-1', state: 'in_progress' },
      });
    });

    it('throws BackendConnectionError on network error', async () => {
      const error = Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        response: undefined,
      });
      vi.mocked(http.get).mockRejectedValue(error);
      await expect(repo.findAll()).rejects.toThrow(BackendConnectionError);
    });
  });
});
