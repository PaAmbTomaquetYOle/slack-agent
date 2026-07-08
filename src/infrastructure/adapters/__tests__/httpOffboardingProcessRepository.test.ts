import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpOffboardingProcessRepository } from '../httpOffboardingProcessRepository';
import { ProcessId, UserId } from '../../../domain';
import { BackendConnectionError, BackendNotFoundError, BackendValidationError } from '../../http';
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

describe('HttpOffboardingProcessRepository', () => {
  let http: AxiosInstance;
  let repo: HttpOffboardingProcessRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpOffboardingProcessRepository(http);
  });

  describe('create()', () => {
    it('POSTs to /offboarding with employee_id and manager_id', async () => {
      vi.mocked(http.post).mockResolvedValue(axiosResponse(sampleResponse, 201));
      const result = await repo.create(new UserId('emp-1'), new UserId('mgr-1'));
      expect(http.post).toHaveBeenCalledWith('/offboarding', { employee_id: 'emp-1', manager_id: 'mgr-1' });
      expect(result.id.value).toBe('proc-1');
      expect(result.departingUserId.value).toBe('emp-1');
    });

    it('includes employee_name and manager_name when provided', async () => {
      vi.mocked(http.post).mockResolvedValue(axiosResponse(sampleResponse, 201));
      await repo.create(new UserId('emp-1'), new UserId('mgr-1'), 'Juan Perez', 'Ana Gomez');
      expect(http.post).toHaveBeenCalledWith('/offboarding', {
        employee_id: 'emp-1',
        manager_id: 'mgr-1',
        employee_name: 'Juan Perez',
        manager_name: 'Ana Gomez',
      });
    });
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
  });

  describe('delete()', () => {
    it('DELETEs /offboarding/{id}', async () => {
      vi.mocked(http.delete).mockResolvedValue({ status: 204, data: undefined, statusText: 'No Content', headers: {}, config: {} as never });
      await repo.delete(new ProcessId('proc-1'));
      expect(http.delete).toHaveBeenCalledWith('/offboarding/proc-1');
    });
  });

  describe('state transitions', () => {
    it('start() PATCHes /offboarding/{id}/start', async () => {
      vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleResponse, state: 'in_progress' }));
      const result = await repo.start(new ProcessId('proc-1'));
      expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/start');
      expect(result.stateName).toBe('in_progress');
    });

    it('submitForReview() PATCHes /offboarding/{id}/submit-for-review', async () => {
      vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleResponse, state: 'pending_revision' }));
      const result = await repo.submitForReview(new ProcessId('proc-1'));
      expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/submit-for-review');
      expect(result.stateName).toBe('pending_revision');
    });

    it('complete() PATCHes /offboarding/{id}/complete', async () => {
      vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleResponse, state: 'finished' }));
      const result = await repo.complete(new ProcessId('proc-1'));
      expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/complete');
      expect(result.stateName).toBe('finished');
    });

    it('cancel() PATCHes /offboarding/{id}/cancel', async () => {
      vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleResponse, state: 'cancelled' }));
      const result = await repo.cancel(new ProcessId('proc-1'));
      expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/cancel');
      expect(result.stateName).toBe('cancelled');
    });
  });

  describe('error handling', () => {
    it('throws BackendNotFoundError on 404', async () => {
      const error = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404, data: {} },
      });
      vi.mocked(http.patch).mockRejectedValue(error);
      await expect(repo.start(new ProcessId('proc-1'))).rejects.toThrow(BackendNotFoundError);
    });

    it('throws BackendValidationError on 422', async () => {
      const error = Object.assign(new Error('Unprocessable'), {
        isAxiosError: true,
        response: { status: 422, data: { detail: 'Invalid state' } },
      });
      vi.mocked(http.post).mockRejectedValue(error);
      await expect(repo.create(new UserId('e'), new UserId('m'))).rejects.toThrow(BackendValidationError);
    });

    it('throws BackendConnectionError on network error', async () => {
      const error = Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        response: undefined,
      });
      vi.mocked(http.post).mockRejectedValue(error);
      await expect(repo.create(new UserId('e'), new UserId('m'))).rejects.toThrow(BackendConnectionError);
    });
  });
});
