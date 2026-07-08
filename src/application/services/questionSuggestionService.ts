import type { McpToolResult, QuestionDetector } from '../../domain';
import type { IMessagingPort } from '../ports';
import type { IMcpService, IQuestionSuggestionService } from '../serviceInterfaces';

const SUGGESTION_HEADER = 'Found some related content that might help:';
const DEFAULT_MAX_SUGGESTIONS = 3;

interface SearchResultItem {
  external_id: string;
  title: string;
  link: string;
}

interface SearchQueryTestResponse {
  results: SearchResultItem[];
}

export class QuestionSuggestionService implements IQuestionSuggestionService {
  readonly #detector: QuestionDetector;
  readonly #mcpService: IMcpService;
  readonly #messagingPort: IMessagingPort;
  readonly #monitoredChannelIds: Set<string>;
  readonly #maxSuggestions: number;

  constructor(
    detector: QuestionDetector,
    mcpService: IMcpService,
    messagingPort: IMessagingPort,
    monitoredChannelIds: string[],
    maxSuggestions: number = DEFAULT_MAX_SUGGESTIONS,
  ) {
    this.#detector = detector;
    this.#mcpService = mcpService;
    this.#messagingPort = messagingPort;
    this.#monitoredChannelIds = new Set(monitoredChannelIds);
    this.#maxSuggestions = maxSuggestions;
  }

  async handleChannelMessage(channelId: string, authorId: string, text: string): Promise<void> {
    if (!this.#monitoredChannelIds.has(channelId)) return;
    if (!this.#detector.isQuestion({ text })) return;

    let response: SearchQueryTestResponse;
    try {
      const result = await this.#mcpService.callTool('test_search_query', { query: text });
      response = QuestionSuggestionService.#parseResult(result);
    } catch (error) {
      console.error('Failed to search for question suggestions:', error);
      return;
    }

    if (response.results.length === 0) return;

    const suggestions = response.results.slice(0, this.#maxSuggestions);
    const body = suggestions.map((item) => `• <${item.link}|${item.title}>`).join('\n');
    try {
      await this.#messagingPort.sendEphemeralMessage(channelId, authorId, `${SUGGESTION_HEADER}\n${body}`);
    } catch (error) {
      console.error('Failed to send question suggestion:', error);
    }
  }

  static #parseResult(result: McpToolResult): SearchQueryTestResponse {
    if (result.isError) {
      throw new Error('test_search_query tool call returned an error');
    }
    const text = result.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new Error('test_search_query returned no text content');
    }
    return JSON.parse(text) as SearchQueryTestResponse;
  }
}
