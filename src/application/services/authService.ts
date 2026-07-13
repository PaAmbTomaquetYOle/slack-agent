import type { AuthProvider, McpToolResult } from '../../domain/index.js';
import type { IMessagingPort } from '../ports/index.js';
import type { IAuthService, IMcpService } from '../serviceInterfaces/index.js';
import { JIRA_AUTH_ACTION_ID, TRELLO_AUTH_ACTION_ID } from '../serviceInterfaces/index.js';

const DEFAULT_PENDING_AUTH_TTL_MS = 15 * 60 * 1000;

const AUTH_ERROR_PATTERNS = [
  /user not authenticated/i,
  /please complete the oauth flow first/i,
  /authentication failed/i,
  /re-authenticate/i,
  /token may be revoked/i,
  /no tokens found/i,
];

interface ProviderToolNames {
  generate: string;
  complete: string;
}

const PROVIDER_TOOLS: Record<AuthProvider, ProviderToolNames> = {
  jira: { generate: 'generate_jira_auth_url', complete: 'complete_jira_auth' },
  trello: { generate: 'generate_trello_auth_url', complete: 'complete_trello_auth' },
};

interface AuthUrlResponse {
  auth_url: string;
}

interface CompleteAuthResponse {
  success: boolean;
  message: string;
}

interface PendingAuth {
  provider: AuthProvider;
  originChannelId: string;
  createdAt: number;
}

export class AuthService implements IAuthService {
  readonly #mcpService: IMcpService;
  readonly #messagingPort: IMessagingPort;
  readonly #pendingAuthTtlMs: number;
  readonly #pendingAuths = new Map<string, PendingAuth>();

  constructor(
    mcpService: IMcpService,
    messagingPort: IMessagingPort,
    pendingAuthTtlMs: number = DEFAULT_PENDING_AUTH_TTL_MS,
  ) {
    this.#mcpService = mcpService;
    this.#messagingPort = messagingPort;
    this.#pendingAuthTtlMs = pendingAuthTtlMs;
  }

  isAuthErrorMessage(message: string): boolean {
    return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  }

  hasPendingAuth(userId: string): boolean {
    return this.#getFreshPendingAuth(userId) !== null;
  }

  async initiateAuth(provider: AuthProvider, userId: string, originChannelId: string): Promise<void> {
    const toolNames = PROVIDER_TOOLS[provider];
    const result = await this.#mcpService.callTool(toolNames.generate);
    const { auth_url: authUrl } = AuthService.#parseJsonContent<AuthUrlResponse>(result, toolNames.generate);

    this.#pendingAuths.set(userId, { provider, originChannelId, createdAt: Date.now() });

    const actionId = provider === 'jira' ? JIRA_AUTH_ACTION_ID : TRELLO_AUTH_ACTION_ID;
    const credentialLabel = provider === 'jira' ? 'authorization code' : 'access token';
    const instructions =
      `:key: You need to authenticate with ${AuthService.#displayName(provider)} before I can fetch your tasks.\n` +
      `1. Click the button below and authorize access.\n` +
      `2. Copy the ${credentialLabel} you receive.\n` +
      `3. Paste it back to me here in this DM.`;

    await this.#messagingPort.sendEphemeralActionPrompt(originChannelId, userId, instructions, [
      { actionId, text: `Authenticate with ${AuthService.#displayName(provider)}`, value: authUrl, url: authUrl },
    ]);
  }

  async handleAuthCodeMessage(userId: string, text: string): Promise<void> {
    const pending = this.#getFreshPendingAuth(userId);
    if (!pending) {
      await this.#messagingPort.sendDirectMessage(
        userId,
        ':warning: I do not have a pending authentication request for you. Run the extract command again to start one.',
      );
      return;
    }

    const credential = text.trim();
    if (!credential) return;

    const toolNames = PROVIDER_TOOLS[pending.provider];
    const paramName = pending.provider === 'jira' ? 'code' : 'token';

    try {
      const result = await this.#mcpService.callTool(toolNames.complete, { [paramName]: credential });
      const response = AuthService.#parseJsonContent<CompleteAuthResponse>(result, toolNames.complete);
      this.#pendingAuths.delete(userId);

      if (!response.success) {
        await this.#messagingPort.sendDirectMessage(
          userId,
          `:x: ${AuthService.#displayName(pending.provider)} authentication failed: ${response.message}`,
        );
        return;
      }

      await this.#messagingPort.sendDirectMessage(
        userId,
        `:white_check_mark: ${AuthService.#displayName(pending.provider)} authentication complete! ${response.message}`,
      );
    } catch (error) {
      this.#pendingAuths.delete(userId);
      const message = error instanceof Error ? error.message : String(error);
      await this.#messagingPort.sendDirectMessage(
        userId,
        `:x: Failed to complete ${AuthService.#displayName(pending.provider)} authentication: ${message}`,
      );
    }
  }

  #getFreshPendingAuth(userId: string): PendingAuth | null {
    const pending = this.#pendingAuths.get(userId);
    if (!pending) return null;
    if (Date.now() - pending.createdAt > this.#pendingAuthTtlMs) {
      this.#pendingAuths.delete(userId);
      return null;
    }
    return pending;
  }

  static #displayName(provider: AuthProvider): string {
    return provider === 'jira' ? 'Jira' : 'Trello';
  }

  static #parseJsonContent<T>(result: McpToolResult, toolName: string): T {
    if (result.isError) {
      const errorText = result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join(' ');
      throw new Error(errorText || `${toolName} tool call returned an error`);
    }
    const text = result.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new Error(`${toolName} returned no text content`);
    }
    return JSON.parse(text) as T;
  }
}
