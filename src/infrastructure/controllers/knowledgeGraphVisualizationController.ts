import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CustomRoute } from '@slack/bolt';
import type { IKnowledgeGraphReadPort } from '../../application/ports';
import { KNOWLEDGE_GRAPH_PAGE_HTML } from './knowledgeGraphPage';

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
    const [personsPage, topicsPage] = await Promise.all([
      this.#knowledgeGraphReadPort.fetchAllPersons(page, size),
      this.#knowledgeGraphReadPort.fetchAllTopics(page, size),
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
      }));
    });

    return {
      nodes,
      edges,
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

export type { GraphNode, GraphEdge, GraphData, GraphPagination };
