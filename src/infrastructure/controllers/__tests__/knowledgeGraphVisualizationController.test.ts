import { describe, it, expect, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import { KnowledgeGraphVisualizationController } from '../knowledgeGraphVisualizationController';
import type { IKnowledgeGraphReadPort } from '../../../application/ports';

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
    ...overrides,
  };
}

describe('KnowledgeGraphVisualizationController', () => {
  it('exposes GET /knowledge-graph and GET /api/knowledge-graph/data custom routes', () => {
    const controller = new KnowledgeGraphVisualizationController(makePortMock());
    const routes = controller.customRoutes;

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ path: '/knowledge-graph', method: 'GET' });
    expect(routes[1]).toMatchObject({ path: '/api/knowledge-graph/data', method: 'GET' });
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

    await controller.customRoutes[1]!.handler({} as never, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': expect.stringContaining('application/json') }));
    const body = JSON.parse((vi.mocked(res.end).mock.calls[0]?.[0]) as string);
    expect(body.nodes).toEqual(
      expect.arrayContaining([
        { id: 'person:U1', label: 'Ana Garcia', type: 'person', department: 'DevOps' },
        { id: 'topic:kubernetes', label: 'kubernetes', type: 'topic' },
      ]),
    );
    expect(body.edges).toEqual([{ source: 'person:U1', target: 'topic:kubernetes', weight: 0.9 }]);
  });

  it('responds with a 502 and error body when fetching graph data fails', async () => {
    const port = makePortMock({ fetchAllPersons: vi.fn().mockRejectedValue(new Error('backend down')) });
    const controller = new KnowledgeGraphVisualizationController(port);
    const res = makeResMock();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await controller.customRoutes[1]!.handler({} as never, res);

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
    consoleErrorSpy.mockRestore();
  });
});
