import { describe, it, expect, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { KnowledgeGraphVisualizationController } from '../knowledgeGraphVisualizationController.js';
import type { IKnowledgeGraphReadPort } from '../../../application/ports/index.js';

function makeResMock() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
}

function makePortMock(overrides: Partial<IKnowledgeGraphReadPort> = {}): IKnowledgeGraphReadPort {
  return {
    fetchAllPersons: vi.fn().mockResolvedValue({ items: [], page: 1, size: 100, total: 0, total_pages: 0 }),
    fetchAllTopics: vi.fn().mockResolvedValue({ items: [], page: 1, size: 100, total: 0, total_pages: 0 }),
    fetchExpertsByTopic: vi.fn().mockResolvedValue([]),
    fetchPersonProfile: vi.fn().mockResolvedValue(null),
    fetchPersonAnalytics: vi.fn().mockResolvedValue([]),
    fetchSuccessors: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeReqMock(url = '/api/knowledge-graph/data') {
  return { url } as never;
}

describe('KnowledgeGraphVisualizationController', () => {
  it('exposes the HTML, data, and successors custom routes', () => {
    const controller = new KnowledgeGraphVisualizationController(makePortMock());
    const routes = controller.customRoutes;

    expect(routes).toHaveLength(3);
    expect(routes[0]).toMatchObject({ path: '/knowledge-graph', method: 'GET' });
    expect(routes[1]).toMatchObject({ path: '/api/knowledge-graph/data', method: 'GET' });
    expect(routes[2]).toMatchObject({ path: '/api/knowledge-graph/successors', method: 'GET' });
  });

  it('serves the HTML page for GET /knowledge-graph', () => {
    const controller = new KnowledgeGraphVisualizationController(makePortMock());
    const res = makeResMock();

    controller.customRoutes[0]!.handler({} as never, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': expect.stringContaining('text/html') }));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('<!doctype html>'));
  });

  it('builds nodes and edges from persons/topics/experts for the data endpoint', async () => {
    const port = makePortMock({
      fetchAllPersons: vi.fn().mockResolvedValue({
        items: [{ person_id: 'U1', name: 'Ana Garcia', department: 'DevOps' }],
        page: 1, size: 100, total: 1, total_pages: 1,
      }),
      fetchAllTopics: vi.fn().mockResolvedValue({
        items: [{ name: 'kubernetes' }],
        page: 1, size: 100, total: 1, total_pages: 1,
      }),
      fetchExpertsByTopic: vi.fn().mockResolvedValue([
        { person: { person_id: 'U1', name: 'Ana Garcia' }, topic: 'kubernetes', score: 0.9 },
      ]),
    });
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();

    await controller.customRoutes[1]!.handler(makeReqMock(), res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': expect.stringContaining('application/json') }));
    const body = JSON.parse((vi.mocked(res.end).mock.calls[0]?.[0]) as string);
    expect(body.nodes).toEqual(
      expect.arrayContaining([
        { id: 'person:U1', label: 'Ana Garcia', type: 'person', department: 'DevOps' },
        { id: 'topic:kubernetes', label: 'kubernetes', type: 'topic' },
      ]),
    );
    expect(body.edges).toEqual([{ source: 'person:U1', target: 'topic:kubernetes', weight: 0.9 }]);
    expect(body.analytics).toEqual({});
    expect(body.pagination).toEqual({
      persons: { page: 1, size: 100, total: 1, total_pages: 1 },
      topics: { page: 1, size: 100, total: 1, total_pages: 1 },
    });
    expect(port.fetchAllPersons).toHaveBeenCalledWith(1, 100);
    expect(port.fetchAllTopics).toHaveBeenCalledWith(1, 100);
  });

  it('includes edge timestamps when the backend reports first/last seen', async () => {
    const port = makePortMock({
      fetchAllPersons: vi.fn().mockResolvedValue({
        items: [{ person_id: 'U1', name: 'Ana Garcia' }],
        page: 1, size: 100, total: 1, total_pages: 1,
      }),
      fetchAllTopics: vi.fn().mockResolvedValue({
        items: [{ name: 'kubernetes' }],
        page: 1, size: 100, total: 1, total_pages: 1,
      }),
      fetchExpertsByTopic: vi.fn().mockResolvedValue([
        {
          person: { person_id: 'U1', name: 'Ana Garcia' },
          topic: 'kubernetes',
          score: 0.9,
          first_seen: '2024-01-01T00:00:00',
          last_seen: '2024-06-01T00:00:00',
        },
      ]),
    });
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();

    await controller.customRoutes[1]!.handler(makeReqMock(), res);

    const body = JSON.parse((vi.mocked(res.end).mock.calls[0]?.[0]) as string);
    expect(body.edges).toEqual([
      {
        source: 'person:U1',
        target: 'topic:kubernetes',
        weight: 0.9,
        created_at: '2024-01-01T00:00:00',
        last_seen: '2024-06-01T00:00:00',
      },
    ]);
  });

  it('keys per-person analytics by their graph node id', async () => {
    const port = makePortMock({
      fetchPersonAnalytics: vi.fn().mockResolvedValue([
        { person_id: 'U1', community_id: 2, influence: 1.5, broker_score: 0.7 },
      ]),
    });
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();

    await controller.customRoutes[1]!.handler(makeReqMock(), res);

    const body = JSON.parse((vi.mocked(res.end).mock.calls[0]?.[0]) as string);
    expect(body.analytics).toEqual({
      'person:U1': { community_id: 2, influence: 1.5, broker_score: 0.7 },
    });
  });

  it('forwards page/size query params to the read port', async () => {
    const port = makePortMock();
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();

    await controller.customRoutes[1]!.handler(makeReqMock('/api/knowledge-graph/data?page=3&size=25'), res);

    expect(port.fetchAllPersons).toHaveBeenCalledWith(3, 25);
    expect(port.fetchAllTopics).toHaveBeenCalledWith(3, 25);
  });

  it('clamps size to the backend maximum and falls back to defaults for invalid params', async () => {
    const port = makePortMock();
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();

    await controller.customRoutes[1]!.handler(makeReqMock('/api/knowledge-graph/data?page=abc&size=500'), res);

    expect(port.fetchAllPersons).toHaveBeenCalledWith(1, 100);
    expect(port.fetchAllTopics).toHaveBeenCalledWith(1, 100);
  });

  it('responds with a 502 and error body when fetching graph data fails', async () => {
    const port = makePortMock({ fetchAllPersons: vi.fn().mockRejectedValue(new Error('backend down')) });
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await controller.customRoutes[1]!.handler(makeReqMock(), res);

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/knowledge-graph/successors', () => {
    it('forwards person_id and limit to the read port', async () => {
      const port = makePortMock({
        fetchSuccessors: vi.fn().mockResolvedValue([
          { person: { person_id: 'U2', name: 'Bob' }, similarity: 0.8 },
        ]),
      });
      const controller = new KnowledgeGraphVisualizationController(port);
      const res = makeResMock();

      await controller.customRoutes[2]!.handler(
        makeReqMock('/api/knowledge-graph/successors?person_id=U1&limit=3'),
        res,
      );

      expect(port.fetchSuccessors).toHaveBeenCalledWith('U1', 3);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': expect.stringContaining('application/json') }));
      const body = JSON.parse((vi.mocked(res.end).mock.calls[0]?.[0]) as string);
      expect(body).toEqual([{ person: { person_id: 'U2', name: 'Bob' }, similarity: 0.8 }]);
    });

    it('responds with 400 when person_id is missing', async () => {
      const port = makePortMock();
      const controller = new KnowledgeGraphVisualizationController(port);
      const res = makeResMock();

      await controller.customRoutes[2]!.handler(makeReqMock('/api/knowledge-graph/successors'), res);

      expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything());
      expect(port.fetchSuccessors).not.toHaveBeenCalled();
    });

    it('responds with a 502 when fetching successors fails', async () => {
      const port = makePortMock({ fetchSuccessors: vi.fn().mockRejectedValue(new Error('backend down')) });
      const controller = new KnowledgeGraphVisualizationController(port);
      const res = makeResMock();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await controller.customRoutes[2]!.handler(
        makeReqMock('/api/knowledge-graph/successors?person_id=U1'),
        res,
      );

      expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
      consoleErrorSpy.mockRestore();
    });
  });
});
