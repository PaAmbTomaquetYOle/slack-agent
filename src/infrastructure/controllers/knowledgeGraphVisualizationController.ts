import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CustomRoute } from '@slack/bolt';
import type { IKnowledgeGraphReadPort } from '../../application/ports/index.js';
import { KNOWLEDGE_GRAPH_PAGE_HTML } from './knowledgeGraphPage.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
// Matches the backend's `size` query param upper bound (`Query(ge=1, le=100)`) on
// GET /knowledge-graph/persons and GET /knowledge-graph/topics.
const MAX_PAGE_SIZE = 100;
const EXPERTS_PER_TOPIC_LIMIT = 10;

interface GraphNode {
  id: string;
  label: string;
  type: 'person' | 'topic';
  department?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  /** ISO timestamps from the underlying expertise relationship (SA-19). Absent for edges
   * recorded before the backend started tracking them — the frontend timeline treats
   * those as "always present" rather than filtering them out. */
  created_at?: string;
  last_seen?: string;
}

interface GraphPersonAnalytics {
  community_id: number;
  influence: number;
  broker_score: number;
}

interface GraphPagination {
  page: number;
  size: number;
  total: number;
  total_pages: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  pagination: {
    persons: GraphPagination;
    topics: GraphPagination;
  };
  /** Keyed by `person:<person_id>` node id, mirroring GraphNode.id, so the client can look
   * up analytics by node without re-deriving the `person:` prefix. Empty object when the
   * backend's GDS layer is unavailable — the client falls back to client-side estimates. */
  analytics: Record<string, GraphPersonAnalytics>;
}

/**
 * Serves an interactive D3.js knowledge graph visualization on the bot's Socket Mode HTTP
 * server (wired via AppOptions.customRoutes — see appFactory.ts). This is not a Slack event
 * handler, so it does not extend BaseController.
 */
export class KnowledgeGraphVisualizationController {
  readonly #knowledgeGraphReadPort: IKnowledgeGraphReadPort;

  constructor(knowledgeGraphReadPort: IKnowledgeGraphReadPort) {
    this.#knowledgeGraphReadPort = knowledgeGraphReadPort;
  }

  get customRoutes(): CustomRoute[] {
    return [
      { path: '/knowledge-graph', method: 'GET', handler: (_req, res) => this.#serveHtml(res) },
      { path: '/api/knowledge-graph/data', method: 'GET', handler: (req, res) => this.#serveData(req, res) },
      {
        path: '/api/knowledge-graph/successors',
        method: 'GET',
        handler: (req, res) => this.#serveSuccessors(req, res),
      },
    ];
  }

  #serveHtml(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(KNOWLEDGE_GRAPH_PAGE_HTML);
  }

  async #serveData(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const { page, size } = this.#parsePaginationParams(req);
      const data = await this.#buildGraphData(page, size);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to build knowledge graph visualization data:', error);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to load knowledge graph data.' }));
    }
  }

  async #serveSuccessors(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const searchParams = new URL(req.url ?? '/', 'http://localhost').searchParams;
      const personId = searchParams.get('person_id');
      if (!personId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing required query parameter: person_id' }));
        return;
      }
      const limit = this.#parsePositiveInt(searchParams.get('limit'), EXPERTS_PER_TOPIC_LIMIT, 1, MAX_PAGE_SIZE);
      const successors = await this.#knowledgeGraphReadPort.fetchSuccessors(personId, limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(successors));
    } catch (error) {
      console.error('Failed to fetch knowledge graph successor candidates:', error);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to load successor candidates.' }));
    }
  }

  #parsePaginationParams(req: IncomingMessage): { page: number; size: number } {
    const searchParams = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const page = this.#parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER);
    const size = this.#parsePositiveInt(searchParams.get('size'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    return { page, size };
  }

  #parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
    if (raw === null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  async #buildGraphData(page: number, size: number): Promise<GraphData> {
    const [personsPage, topicsPage, personAnalytics] = await Promise.all([
      this.#knowledgeGraphReadPort.fetchAllPersons(page, size),
      this.#knowledgeGraphReadPort.fetchAllTopics(page, size),
      this.#knowledgeGraphReadPort.fetchPersonAnalytics(),
    ]);

    const nodes: GraphNode[] = [
      ...personsPage.items.map((person) => ({
        id: `person:${person.person_id}`,
        label: person.name,
        type: 'person' as const,
        ...(person.department ? { department: person.department } : {}),
      })),
      ...topicsPage.items.map((topic) => ({ id: `topic:${topic.name}`, label: topic.name, type: 'topic' as const })),
    ];

    const expertsByTopic = await Promise.all(
      topicsPage.items.map((topic) =>
        this.#knowledgeGraphReadPort.fetchExpertsByTopic(topic.name, EXPERTS_PER_TOPIC_LIMIT),
      ),
    );

    const edges: GraphEdge[] = expertsByTopic.flatMap((experts, index) => {
      const topic = topicsPage.items[index];
      if (!topic) return [];
      return experts.map((expert) => ({
        source: `person:${expert.person.person_id}`,
        target: `topic:${topic.name}`,
        weight: expert.score,
        ...(expert.first_seen ? { created_at: expert.first_seen } : {}),
        ...(expert.last_seen ? { last_seen: expert.last_seen } : {}),
      }));
    });

    const analytics: Record<string, GraphPersonAnalytics> = Object.fromEntries(
      personAnalytics.map((a) => [
        `person:${a.person_id}`,
        { community_id: a.community_id, influence: a.influence, broker_score: a.broker_score },
      ]),
    );

    return {
      nodes,
      edges,
      analytics,
      pagination: {
        persons: {
          page: personsPage.page,
          size: personsPage.size,
          total: personsPage.total,
          total_pages: personsPage.total_pages,
        },
        topics: {
          page: topicsPage.page,
          size: topicsPage.size,
          total: topicsPage.total,
          total_pages: topicsPage.total_pages,
        },
      },
    };
  }
}

export type { GraphNode, GraphEdge, GraphData, GraphPagination, GraphPersonAnalytics };
