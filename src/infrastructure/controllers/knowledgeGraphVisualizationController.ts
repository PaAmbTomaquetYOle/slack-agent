import type { ServerResponse } from 'node:http';
import type { CustomRoute } from '@slack/bolt';
import type { IKnowledgeGraphReadPort } from '../../application/ports';
import { KNOWLEDGE_GRAPH_PAGE_HTML } from './knowledgeGraphPage';

const PERSON_PAGE_SIZE = 100;
const TOPIC_PAGE_SIZE = 100;
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

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
      { path: '/api/knowledge-graph/data', method: 'GET', handler: (_req, res) => this.#serveData(res) },
    ];
  }

  #serveHtml(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(KNOWLEDGE_GRAPH_PAGE_HTML);
  }

  async #serveData(res: ServerResponse): Promise<void> {
    try {
      const data = await this.#buildGraphData();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to build knowledge graph visualization data:', error);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Failed to load knowledge graph data.' }));
    }
  }

  async #buildGraphData(): Promise<GraphData> {
    const [personsPage, topicsPage] = await Promise.all([
      this.#knowledgeGraphReadPort.fetchAllPersons(1, PERSON_PAGE_SIZE),
      this.#knowledgeGraphReadPort.fetchAllTopics(1, TOPIC_PAGE_SIZE),
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

    if (personsPage.total > personsPage.items.length) {
      console.warn(
        `Knowledge graph visualization: showing ${personsPage.items.length} of ${personsPage.total} persons.`,
      );
    }
    if (topicsPage.total > topicsPage.items.length) {
      console.warn(
        `Knowledge graph visualization: showing ${topicsPage.items.length} of ${topicsPage.total} topics.`,
      );
    }

    return { nodes, edges };
  }
}

export type { GraphNode, GraphEdge, GraphData };
