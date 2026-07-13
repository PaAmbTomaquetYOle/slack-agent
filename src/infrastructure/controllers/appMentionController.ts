import type { App } from '@slack/bolt';
import type {
  IAuthService,
  IExpertRecommendationService,
  IMcpService,
  IOffboardingService,
} from '../../application/serviceInterfaces/index.js';
import type { AuthProvider, McpPromptResult } from '../../domain/index.js';
import { BaseController } from './baseController.js';

const EXPERT_QUERY_PATTERNS = [
  /who\s+knows?\s+about\s+(.+?)[?.]?\s*$/i,
  /expert\s+(?:on|in|for)\s+(.+?)[?.]?\s*$/i,
  /qui[eé]n\s+sabe\s+(?:de|sobre)\s+(.+?)[?.]?\s*$/i,
  /experto\s+en\s+(.+?)[?.]?\s*$/i,
];

const OFFBOARDING_INTENT_PATTERNS = [
  /\boffboarding\b/i,
  /\boffboard\b/i,
  /\bleav(?:e|ing)\b/i,
  /\bdeparture\b/i,
  /\bexit\s+interview\b/i,
  /\binterview\b/i,
  /\bhandover\b/i,
];

const HELP_PATTERNS = [
  /^(help|commands|what can you do)\b/i,
  /\bhow\s+can\s+you\s+help\b/i,
];

const KNOWLEDGE_GRAPH_PATTERNS = [
  /\bknowledge\s+graph\b/i,
  /\bexpert\s+map\b/i,
];

const AUTH_PATTERNS: Array<{ provider: AuthProvider; patterns: RegExp[] }> = [
  {
    provider: 'jira',
    patterns: [
      /\bjira\b.*\b(login|auth|authenticate|connect)\b/i,
      /\b(login|auth|authenticate|connect)\b.*\bjira\b/i,
    ],
  },
  {
    provider: 'trello',
    patterns: [
      /\btrello\b.*\b(login|auth|authenticate|connect)\b/i,
      /\b(login|auth|authenticate|connect)\b.*\btrello\b/i,
    ],
  },
];

const TASK_EXTRACTION_PATTERNS: Array<{ provider: 'jira' | 'trello'; patterns: RegExp[] }> = [
  {
    provider: 'jira',
    patterns: [
      /\b(?:extract|show|list|fetch|find)\b.*\bjira\b.*\b(?:tasks|issues)\b.*\b(?:for|assigned to)\s+(.+?)\s*$/i,
      /\bjira\b.*\b(?:tasks|issues)\b.*\b(?:for|assigned to)\s+(.+?)\s*$/i,
    ],
  },
  {
    provider: 'trello',
    patterns: [
      /\b(?:extract|show|list|fetch|find)\b.*\btrello\b.*\b(?:tasks|cards)\b.*\b(?:for|assigned to)\s+(.+?)\s*$/i,
      /\btrello\b.*\b(?:tasks|cards)\b.*\b(?:for|assigned to)\s+(.+?)\s*$/i,
    ],
  },
];

export class AppMentionController extends BaseController {
  readonly #expertRecommendationService: IExpertRecommendationService | undefined;
  readonly #offboardingService: IOffboardingService | undefined;
  readonly #mcpService: IMcpService | undefined;
  readonly #authService: IAuthService | undefined;
  readonly #knowledgeGraphUrl: string | undefined;

  constructor(
    expertRecommendationService?: IExpertRecommendationService,
    offboardingService?: IOffboardingService,
    mcpService?: IMcpService,
    authService?: IAuthService,
    knowledgeGraphUrl?: string,
  ) {
    super();
    this.#expertRecommendationService = expertRecommendationService;
    this.#offboardingService = offboardingService;
    this.#mcpService = mcpService;
    this.#authService = authService;
    this.#knowledgeGraphUrl = knowledgeGraphUrl;
  }

  register(app: App): void {
    app.event('app_mention', async ({ event, say }) => {
      const userId = event.user;
      if (!userId) {
        await say({
          text: `I couldn't identify who sent this request. Please try again from your Slack user account.`,
          thread_ts: event.ts,
        });
        return;
      }

      const departingUserId = AppMentionController.#extractOffboardingTarget(event.text, userId);
      if (departingUserId && this.#offboardingService) {
        try {
          await this.#offboardingService.startOffboarding(departingUserId, userId);
          await say({
            text: `I'll start an offboarding knowledge-capture interview with <@${departingUserId}>.`,
            thread_ts: event.ts,
          });
        } catch (error) {
          console.error('Failed to start offboarding from app mention:', error);
          await say({
            text: `I couldn't start the offboarding interview for <@${departingUserId}>. Please try again or use /offboarding.`,
            thread_ts: event.ts,
          });
        }
        return;
      }

      if (AppMentionController.#isOffboardingIntent(event.text)) {
        await say({
          text: `To start an offboarding interview, mention the departing teammate. Example: \`@OffboardMe start offboarding for @teammate\`.`,
          thread_ts: event.ts,
        });
        return;
      }

      const topic = AppMentionController.#extractExpertQuery(event.text);
      if (topic && this.#expertRecommendationService) {
        await this.#expertRecommendationService.findExperts(event.channel, userId, topic);
        return;
      }

      if (AppMentionController.#isKnowledgeGraphRequest(event.text) && this.#knowledgeGraphUrl) {
        await say({
          text: `Explore the knowledge graph: ${this.#knowledgeGraphUrl}`,
          thread_ts: event.ts,
        });
        return;
      }

      const authProvider = AppMentionController.#extractAuthProvider(event.text);
      if (authProvider && this.#authService) {
        try {
          await this.#authService.initiateAuth(authProvider, userId, event.channel);
        } catch (error) {
          await say({
            text: `I couldn't start ${authProvider} authentication: ${AppMentionController.#errorMessage(error)}`,
            thread_ts: event.ts,
          });
        }
        return;
      }

      const taskRequest = AppMentionController.#extractTaskRequest(event.text);
      if (taskRequest && this.#mcpService) {
        await this.#handleTaskRequest(taskRequest.provider, taskRequest.assignee, userId, event.channel, event.ts, say);
        return;
      }

      if (AppMentionController.#isHelpRequest(event.text)) {
        await say({
          text: AppMentionController.#helpText(),
          thread_ts: event.ts,
        });
        return;
      }

      await say({
        text: AppMentionController.#helpText(),
        thread_ts: event.ts,
      });
    });
  }

  static #extractExpertQuery(text: string): string | null {
    const withoutMentions = text.replace(/<@[A-Z0-9]+>/gi, '').trim();
    for (const pattern of EXPERT_QUERY_PATTERNS) {
      const match = withoutMentions.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }

  static #extractOffboardingTarget(text: string, initiatorId: string): string | null {
    if (!AppMentionController.#isOffboardingIntent(text)) return null;

    const mentionedUserIds = [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/gi)]
      .map((match) => match[1])
      .filter((userId): userId is string => Boolean(userId));

    const [, ...candidateUserIds] = mentionedUserIds;
    return candidateUserIds.find((userId) => userId !== initiatorId) ?? null;
  }

  static #isOffboardingIntent(text: string): boolean {
    return OFFBOARDING_INTENT_PATTERNS.some((pattern) => pattern.test(text));
  }

  static #isHelpRequest(text: string): boolean {
    const normalized = AppMentionController.#withoutAppMention(text);
    return HELP_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  static #isKnowledgeGraphRequest(text: string): boolean {
    return KNOWLEDGE_GRAPH_PATTERNS.some((pattern) => pattern.test(text));
  }

  static #extractAuthProvider(text: string): AuthProvider | null {
    const normalized = AppMentionController.#withoutAppMention(text);
    for (const { provider, patterns } of AUTH_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(normalized))) return provider;
    }
    return null;
  }

  static #extractTaskRequest(text: string): { provider: 'jira' | 'trello'; assignee: string } | null {
    const normalized = AppMentionController.#withoutAppMention(text);
    for (const { provider, patterns } of TASK_EXTRACTION_PATTERNS) {
      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        const assignee = match?.[1] ? AppMentionController.#normalizeAssignee(match[1]) : null;
        if (assignee) return { provider, assignee };
      }
    }
    return null;
  }

  static #withoutAppMention(text: string): string {
    return text.replace(/^<@[A-Z0-9]+(?:\|[^>]+)?>\s*/i, '').trim();
  }

  static #normalizeAssignee(raw: string): string {
    const trimmed = raw.trim().replace(/[?.!,;:]+$/g, '').trim();
    const mention = trimmed.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/i);
    return mention?.[1] ?? trimmed;
  }

  async #handleTaskRequest(
    provider: 'jira' | 'trello',
    assignee: string,
    userId: string,
    channelId: string,
    threadTs: string,
    say: (message: { text: string; thread_ts?: string }) => Promise<unknown>,
  ): Promise<void> {
    if (!this.#mcpService) return;
    try {
      const result = provider === 'jira'
        ? await this.#mcpService.extractPendingJiraTasksPrompt(assignee)
        : await this.#mcpService.extractPendingTrelloTasksPrompt(assignee);
      await say({ text: AppMentionController.#renderPrompt(result), thread_ts: threadTs });
    } catch (error) {
      const message = AppMentionController.#errorMessage(error);
      if (this.#authService?.isAuthErrorMessage(message)) {
        await this.#authService.initiateAuth(provider, userId, channelId);
        return;
      }
      await say({ text: `MCP server unavailable: ${message}`, thread_ts: threadTs });
    }
  }

  static #renderPrompt(result: McpPromptResult): string {
    return result.messages
      .map((message) => (message.content.type === 'text' ? message.content.text : null))
      .filter((text): text is string => text !== null)
      .join('\n\n');
  }

  static #errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  static #helpText(): string {
    return [
      `I'm Offboard-Me. I can help from chat with:`,
      `• \`@OffboardMe start offboarding for @teammate\``,
      `• \`@OffboardMe who knows about <topic>?\``,
      `• \`@OffboardMe show Jira tasks for <assignee>\``,
      `• \`@OffboardMe show Trello cards for <assignee>\``,
      `• \`@OffboardMe Jira login\` or \`@OffboardMe Trello login\``,
      `• \`@OffboardMe knowledge graph\``,
    ].join('\n');
  }
}
