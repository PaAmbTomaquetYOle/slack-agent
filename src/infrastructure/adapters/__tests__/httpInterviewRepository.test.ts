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

describe('HttpInterviewRepository', () => {
  let http: AxiosInstance;
  let repo: HttpInterviewRepository;

  beforeEach(() => {
    http = makeAxiosMock();
    repo = new HttpInterviewRepository(http);
  });

  it('upsert() PUTs to /offboarding/{id}/interview with scheduled_at and turns', async () => {
    vi.mocked(http.put).mockResolvedValue(axiosResponse(sampleInterview, 201));
    const scheduledAt = new Date('2024-01-02T10:00:00Z');
    const result = await repo.upsert(new ProcessId('proc-1'), scheduledAt);
    expect(http.put).toHaveBeenCalledWith('/offboarding/proc-1/interview', {
      scheduled_at: scheduledAt.toISOString(),
      turns: [],
    });
    expect(result.id.value).toBe('int-1');
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

  it('start() PATCHes /interview/start', async () => {
    vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleInterview, state: 'in_progress' }));
    const result = await repo.start(new ProcessId('proc-1'));
    expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/interview/start');
    expect(result.state).toBe('in_progress');
  });

  it('complete() PATCHes /interview/complete', async () => {
    vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleInterview, state: 'completed' }));
    await repo.complete(new ProcessId('proc-1'));
    expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/interview/complete');
  });

  it('cancel() PATCHes /interview/cancel', async () => {
    vi.mocked(http.patch).mockResolvedValue(axiosResponse({ ...sampleInterview, state: 'cancelled' }));
    await repo.cancel(new ProcessId('proc-1'));
    expect(http.patch).toHaveBeenCalledWith('/offboarding/proc-1/interview/cancel');
  });

  it('addTurns() POSTs to /interview/turns with mapped turns', async () => {
    vi.mocked(http.post).mockResolvedValue(axiosResponse(sampleInterview, 201));
    const turn = {
      turnType: 'note' as const,
      speakerRole: 'interviewee' as const,
      timestamp: new Date('2024-01-02T10:05:00Z'),
      content: 'A note.',
      order: 0,
      topic: null,
      sentiment: null,
      answerText: null,
    };
    await repo.addTurns(new ProcessId('proc-1'), [turn]);
    expect(http.post).toHaveBeenCalledWith('/offboarding/proc-1/interview/turns', {
      turns: [expect.objectContaining({ turn_type: 'note', speaker_role: 'interviewee' })],
    });
  });
});
