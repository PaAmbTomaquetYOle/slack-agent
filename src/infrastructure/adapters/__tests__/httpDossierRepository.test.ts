import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpDossierRepository } from '../httpDossierRepository';
import { ProcessId } from '../../../domain';
import type { BackendDossierResponse } from '../../http';

function makeAxiosMock() {
  return {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as unknown as AxiosInstance;
}

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as never };
}

const sampleDossier: BackendDossierResponse = {
  id: 'dos-1',
  process_id: 'proc-1',
  interview_id: 'int-1',
  state: 'not_generated',
  created_at: '2024-01-05T00:00:00Z',
  summary: null,
  sections: [],
};

// BE-7: the backend's dossier REST endpoint is read-only now — only findByProcessId remains.
// Creation flows over Kafka via `dossier.generation_requested` (see DossierService).
describe('HttpDossierRepository', () => {
  let http: AxiosInstance;
  let repo: HttpDossierRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpDossierRepository(http);
  });

  it('findByProcessId() GETs /offboarding/{id}/dossier', async () => {
    vi.mocked(http.get).mockResolvedValue(axiosResponse(sampleDossier));
    const result = await repo.findByProcessId(new ProcessId('proc-1'));
    expect(http.get).toHaveBeenCalledWith('/offboarding/proc-1/dossier');
    expect(result?.id.value).toBe('dos-1');
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
