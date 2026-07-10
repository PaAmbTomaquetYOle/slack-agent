import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { HttpKnowledgeGraphAdapter } from '../httpKnowledgeGraphAdapter';

function makeAxiosMock() {
  return {
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as unknown as AxiosInstance;
}

function axiosResponse<T>(data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config: {} as never };
}

describe('HttpKnowledgeGraphAdapter', () => {
  let http: AxiosInstance;
  let adapter: HttpKnowledgeGraphAdapter;

  beforeEach(() => {
    http = makeAxiosMock();
    adapter = new HttpKnowledgeGraphAdapter(http);
  });

  it('fetchAllPersons() GETs /knowledge-graph/persons with pagination params', async () => {
    const page = { items: [{ person_id: 'U1', name: 'Ana' }], page: 1, size: 20, total: 1, total_pages: 1 };
    vi.mocked(http.get).mockResolvedValue(axiosResponse(page));

    const result = await adapter.fetchAllPersons(1, 20);

    expect(http.get).toHaveBeenCalledWith('/knowledge-graph/persons', { params: { page: 1, size: 20 } });
    expect(result).toEqual(page);
  });

  it('fetchAllTopics() GETs /knowledge-graph/topics with pagination params', async () => {
    const page = { items: [{ name: 'kubernetes' }], page: 1, size: 20, total: 1, total_pages: 1 };
    vi.mocked(http.get).mockResolvedValue(axiosResponse(page));

    const result = await adapter.fetchAllTopics(1, 20);

    expect(http.get).toHaveBeenCalledWith('/knowledge-graph/topics', { params: { page: 1, size: 20 } });
    expect(result).toEqual(page);
  });

  it('fetchExpertsByTopic() GETs the topic experts endpoint with a limit', async () => {
    const experts = [{ person: { person_id: 'U1', name: 'Ana' }, topic: 'kubernetes', score: 0.9 }];
    vi.mocked(http.get).mockResolvedValue(axiosResponse(experts));

    const result = await adapter.fetchExpertsByTopic('kubernetes', 3);

    expect(http.get).toHaveBeenCalledWith('/knowledge-graph/topics/kubernetes/experts', { params: { limit: 3 } });
    expect(result).toEqual(experts);
  });

  it('fetchPersonProfile() GETs the person profile endpoint', async () => {
    const profile = { person: { person_id: 'U1', name: 'Ana' }, topics: [], documents: [] };
    vi.mocked(http.get).mockResolvedValue(axiosResponse(profile));

    const result = await adapter.fetchPersonProfile('U1');

    expect(http.get).toHaveBeenCalledWith('/knowledge-graph/persons/U1');
    expect(result).toEqual(profile);
  });

  it('fetchPersonProfile() returns null on 404', async () => {
    const error = Object.assign(new Error('Not Found'), {
      isAxiosError: true,
      response: { status: 404, data: {} },
    });
    vi.mocked(http.get).mockRejectedValue(error);

    const result = await adapter.fetchPersonProfile('missing');

    expect(result).toBeNull();
  });
});
