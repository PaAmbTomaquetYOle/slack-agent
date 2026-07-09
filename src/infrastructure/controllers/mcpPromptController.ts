import type { App, SlackCommandMiddlewareArgs } from '@slack/bolt';
import type { IAuthService, IMcpService } from '../../application';
import type { McpPromptResult } from '../../domain';
import { BaseController } from './baseController';

export class McpPromptController extends BaseController {
  readonly #mcpService: IMcpService;
  readonly #authService: IAuthService;

  constructor(mcpService: IMcpService, authService: IAuthService) {
    super();
    this.#mcpService = mcpService;
    this.#authService = authService;
  }

  register(app: App): void {
    app.command('/jira-login', (args) => this.#handleJiraLogin(args));
    app.command('/trello-login', (args) => this.#handleTrelloLogin(args));
    app.command('/extract-jira-tasks', (args) => this.#handleExtractJiraTasks(args));
    app.command('/extract-trello-tasks', (args) => this.#handleExtractTrelloTasks(args));
  }

  async #handleJiraLogin({ ack, respond }: SlackCommandMiddlewareArgs): Promise<void> {
    await ack();
    try {
      const result = await this.#mcpService.getPrompt('jira_login');
      await respond({ response_type: 'in_channel', text: this.#render(result) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await respond(`:warning: MCP server unavailable: ${message}`);
    }
  }

  async #handleTrelloLogin({ ack, respond }: SlackCommandMiddlewareArgs): Promise<void> {
    await ack();
    try {
      const result = await this.#mcpService.getPrompt('trello_login');
      await respond({ response_type: 'in_channel', text: this.#render(result) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await respond(`:warning: MCP server unavailable: ${message}`);
    }
  }

  async #handleExtractJiraTasks({ command, ack, respond }: SlackCommandMiddlewareArgs): Promise<void> {
    await ack();
    const assignee = command.text.trim();
    if (!assignee) {
      await respond({ response_type: 'ephemeral', text: 'Usage: /extract-jira-tasks <assignee>' });
      return;
    }
    try {
      const result = await this.#mcpService.getPrompt('extract_pending_jira_tasks', { assignee });
      await respond({ response_type: 'in_channel', text: this.#render(result) });
    } catch (error) {
      await this.#handleExtractError('jira', error, command.user_id, command.channel_id, respond);
    }
  }

  async #handleExtractTrelloTasks({ command, ack, respond }: SlackCommandMiddlewareArgs): Promise<void> {
    await ack();
    const assignee = command.text.trim();
    if (!assignee) {
      await respond({ response_type: 'ephemeral', text: 'Usage: /extract-trello-tasks <assignee>' });
      return;
    }
    try {
      const result = await this.#mcpService.getPrompt('extract_pending_trello_tasks', { assignee });
      await respond({ response_type: 'in_channel', text: this.#render(result) });
    } catch (error) {
      await this.#handleExtractError('trello', error, command.user_id, command.channel_id, respond);
    }
  }

  async #handleExtractError(
    provider: 'jira' | 'trello',
    error: unknown,
    userId: string,
    channelId: string,
    respond: SlackCommandMiddlewareArgs['respond'],
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (this.#authService.isAuthErrorMessage(message)) {
      await this.#authService.initiateAuth(provider, userId, channelId);
      return;
    }
    await respond(`:warning: MCP server unavailable: ${message}`);
  }

  #render(result: McpPromptResult): string {
    return result.messages
      .map((m) => {
        if (m.content.type === 'text') {
          return m.content.text;
        }
        return null;
      })
      .filter((t): t is string => t !== null)
      .join('\n\n');
  }
}
