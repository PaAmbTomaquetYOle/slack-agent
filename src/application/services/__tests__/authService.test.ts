import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../authService.js';
import type { IMcpService } from '../../serviceInterfaces/index.js';
import type { IMessagingPort } from '../../ports/index.js';
import { JIRA_AUTH_ACTION_ID, TRELLO_AUTH_ACTION_ID } from '../../serviceInterfaces/index.js';

function makeMcpServiceMock(): IMcpService {
  return {
    discoverTools: vi.fn(),
    callTool: vi.fn(),
    listPrompts: vi.fn(),
    getPrompt: vi.fn(),
    listResources: vi.fn(),
    listResourceTemplates: vi.fn(),
    readResource: vi.fn(),
    jiraLoginPrompt: vi.fn(),
    trelloLoginPrompt: vi.fn(),
    extractPendingJiraTasksPrompt: vi.fn(),
    extractPendingTrelloTasksPrompt: vi.fn(),
  } as unknown as IMcpService;
}

function makeMessagingMock(): IMessagingPort {
  return {
    sendDirectMessage: vi.fn().mockResolvedValue(undefined),
    sendEphemeralActionPrompt: vi.fn().mockResolvedValue(undefined),
    sendEphemeralMessage: vi.fn().mockResolvedValue(undefined),
    sendChannelMessage: vi.fn().mockResolvedValue(undefined),
    createChannelCanvas: vi.fn().mockResolvedValue(undefined),
  };
}

function toolResult(payload: unknown, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError };
}

function errorToolResult(text: string) {
  return { content: [{ type: 'text', text }], isError: true };
}

describe('AuthService', () => {
  let mcpService: IMcpService;
  let messaging: IMessagingPort;
  let service: AuthService;

  beforeEach(() => {
    mcpService = makeMcpServiceMock();
    messaging = makeMessagingMock();
    service = new AuthService(mcpService, messaging);
  });

  describe('isAuthErrorMessage', () => {
    it('recognizes the exact MCP server auth error text', () => {
      expect(
        service.isAuthErrorMessage(
          'User not authenticated. Please complete the OAuth flow first. (No tokens found for user: U1)',
        ),
      ).toBe(true);
    });

    it('recognizes a revoked-token re-authentication message', () => {
      expect(
        service.isAuthErrorMessage('Jira authentication failed. Token may be revoked -- please re-authenticate.'),
      ).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(service.isAuthErrorMessage('MCP server connection timed out')).toBe(false);
    });
  });

  describe('initiateAuth', () => {
    it('generates a Jira auth URL and sends a DM with a URL button', async () => {
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ auth_url: 'https://jira.example/oauth' }));

      await service.initiateAuth('jira', 'U1', 'D1');

      expect(mcpService.callTool).toHaveBeenCalledWith('generate_jira_auth_url');
      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledWith(
        'D1',
        'U1',
        expect.stringContaining('Jira'),
        [expect.objectContaining({ actionId: JIRA_AUTH_ACTION_ID, url: 'https://jira.example/oauth' })],
      );
    });

    it('generates a Trello auth URL and sends a DM with a URL button', async () => {
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ auth_url: 'https://trello.example/oauth' }));

      await service.initiateAuth('trello', 'U1', 'D1');

      expect(mcpService.callTool).toHaveBeenCalledWith('generate_trello_auth_url');
      expect(messaging.sendEphemeralActionPrompt).toHaveBeenCalledWith(
        'D1',
        'U1',
        expect.stringContaining('Trello'),
        [expect.objectContaining({ actionId: TRELLO_AUTH_ACTION_ID, url: 'https://trello.example/oauth' })],
      );
    });

    it('marks the user as having a pending auth request after initiating', async () => {
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ auth_url: 'https://jira.example/oauth' }));

      await service.initiateAuth('jira', 'U1', 'D1');

      expect(service.hasPendingAuth('U1')).toBe(true);
    });
  });

  describe('handleAuthCodeMessage', () => {
    it('completes Jira auth using the code param and confirms success', async () => {
      vi.mocked(mcpService.callTool)
        .mockResolvedValueOnce(toolResult({ auth_url: 'https://jira.example/oauth' }))
        .mockResolvedValueOnce(toolResult({ success: true, email: 'user@example.com', message: 'Tokens stored.' }));

      await service.initiateAuth('jira', 'U1', 'D1');
      await service.handleAuthCodeMessage('U1', 'ABC123');

      expect(mcpService.callTool).toHaveBeenCalledWith('complete_jira_auth', { code: 'ABC123' });
      expect(messaging.sendDirectMessage).toHaveBeenCalledWith('U1', expect.stringContaining('Tokens stored.'));
      expect(service.hasPendingAuth('U1')).toBe(false);
    });

    it('completes Trello auth using the token param', async () => {
      vi.mocked(mcpService.callTool)
        .mockResolvedValueOnce(toolResult({ auth_url: 'https://trello.example/oauth' }))
        .mockResolvedValueOnce(toolResult({ success: true, user_id: 'trello-user', message: 'Tokens stored.' }));

      await service.initiateAuth('trello', 'U1', 'D1');
      await service.handleAuthCodeMessage('U1', 'trello-token-xyz');

      expect(mcpService.callTool).toHaveBeenCalledWith('complete_trello_auth', { token: 'trello-token-xyz' });
    });

    it('sends a failure message when the MCP server reports success: false', async () => {
      vi.mocked(mcpService.callTool)
        .mockResolvedValueOnce(toolResult({ auth_url: 'https://jira.example/oauth' }))
        .mockResolvedValueOnce(toolResult({ success: false, message: 'Invalid code.' }));

      await service.initiateAuth('jira', 'U1', 'D1');
      await service.handleAuthCodeMessage('U1', 'BAD-CODE');

      expect(messaging.sendDirectMessage).toHaveBeenCalledWith('U1', expect.stringContaining('Invalid code.'));
      expect(service.hasPendingAuth('U1')).toBe(false);
    });

    it('sends a failure message when the MCP tool call errors', async () => {
      vi.mocked(mcpService.callTool)
        .mockResolvedValueOnce(toolResult({ auth_url: 'https://jira.example/oauth' }))
        .mockResolvedValueOnce(errorToolResult('Failed to exchange authorization code.'));

      await service.initiateAuth('jira', 'U1', 'D1');
      await service.handleAuthCodeMessage('U1', 'EXPIRED-CODE');

      expect(messaging.sendDirectMessage).toHaveBeenCalledWith(
        'U1',
        expect.stringContaining('Failed to exchange authorization code.'),
      );
      expect(service.hasPendingAuth('U1')).toBe(false);
    });

    it('tells the user there is no pending auth request when none was initiated', async () => {
      await service.handleAuthCodeMessage('U-unknown', 'some-code');

      expect(mcpService.callTool).not.toHaveBeenCalled();
      expect(messaging.sendDirectMessage).toHaveBeenCalledWith(
        'U-unknown',
        expect.stringContaining('do not have a pending authentication request'),
      );
    });

    it('ignores blank messages while an auth request is pending', async () => {
      vi.mocked(mcpService.callTool).mockResolvedValueOnce(toolResult({ auth_url: 'https://jira.example/oauth' }));

      await service.initiateAuth('jira', 'U1', 'D1');
      await service.handleAuthCodeMessage('U1', '   ');

      expect(mcpService.callTool).toHaveBeenCalledTimes(1);
      expect(service.hasPendingAuth('U1')).toBe(true);
    });
  });

  describe('hasPendingAuth', () => {
    it('returns false for a user with no pending auth', () => {
      expect(service.hasPendingAuth('U-none')).toBe(false);
    });

    it('expires a pending auth after the configured TTL', async () => {
      service = new AuthService(mcpService, messaging, 1000);
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ auth_url: 'https://jira.example/oauth' }));
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(0);

      await service.initiateAuth('jira', 'U1', 'D1');
      expect(service.hasPendingAuth('U1')).toBe(true);

      now.mockReturnValue(2000);
      expect(service.hasPendingAuth('U1')).toBe(false);

      now.mockRestore();
    });
  });
});
