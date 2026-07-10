import { TopicQuery, InvalidValueObjectError } from '../../domain';
import type { McpToolResult } from '../../domain';
import type { IMessagingPort } from '../ports';
import type { IMcpService, IExpertRecommendationService } from '../serviceInterfaces';

const DEFAULT_MAX_EXPERTS = 3;
const NO_TOPIC_MESSAGE = 'Please provide a topic, e.g. `/find-expert kubernetes`.';
const QUERY_FAILED_MESSAGE = "Sorry, I couldn't reach the knowledge graph to look up experts right now.";

interface QueryExpertsPerson {
  person_id: string;
  name: string;
  department?: string;
}

interface QueryExpertsExpert {
  person: QueryExpertsPerson;
  topic: string;
  score: number;
}

interface QueryExpertsResponse {
  topic: string;
  experts: QueryExpertsExpert[];
  count: number;
}

export class ExpertRecommendationService implements IExpertRecommendationService {
  readonly #mcpService: IMcpService;
  readonly #messagingPort: IMessagingPort;
  readonly #maxExperts: number;

  constructor(
    mcpService: IMcpService,
    messagingPort: IMessagingPort,
    maxExperts: number = DEFAULT_MAX_EXPERTS,
  ) {
    this.#mcpService = mcpService;
    this.#messagingPort = messagingPort;
    this.#maxExperts = maxExperts;
  }

  async findExperts(channelId: string, userId: string, topic: string): Promise<void> {
    let topicQuery: TopicQuery;
    try {
      topicQuery = new TopicQuery(topic);
    } catch (error) {
      if (error instanceof InvalidValueObjectError) {
        await this.#messagingPort.sendEphemeralMessage(channelId, userId, NO_TOPIC_MESSAGE);
        return;
      }
      throw error;
    }

    let response: QueryExpertsResponse;
    try {
      const result = await this.#mcpService.callTool('query_experts', {
        topic: topicQuery.value,
        limit: this.#maxExperts,
      });
      response = ExpertRecommendationService.#parseResult(result);
    } catch (error) {
      console.error('Failed to query experts from knowledge graph:', error);
      await this.#messagingPort.sendEphemeralMessage(channelId, userId, QUERY_FAILED_MESSAGE);
      return;
    }

    const text = ExpertRecommendationService.#formatResponse(topicQuery.value, response.experts);
    try {
      await this.#messagingPort.sendEphemeralMessage(channelId, userId, text);
    } catch (error) {
      console.error('Failed to send expert recommendation message:', error);
    }
  }

  static #parseResult(result: McpToolResult): QueryExpertsResponse {
    if (result.isError) {
      throw new Error('query_experts tool call returned an error');
    }
    const text = result.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new Error('query_experts returned no text content');
    }
    return JSON.parse(text) as QueryExpertsResponse;
  }

  static #formatResponse(topic: string, experts: QueryExpertsExpert[]): string {
    if (experts.length === 0) {
      return `:mag: I couldn't find any experts on *${topic}* in the knowledge graph yet.`;
    }

    const lines = experts.map((expert, index) => {
      const department = expert.person.department ? ` (${expert.person.department})` : '';
      const score = expert.score.toFixed(2);
      return `${index + 1}. *${expert.person.name}*${department} — score: ${score}`;
    });

    return [`:bulb: Experts on *${topic}*:`, ...lines].join('\n');
  }
}
