import { describe, it, expect, vi } from 'vitest';
import { ExpertRecommendationService } from '../expertRecommendationService.js';
import type { IMcpService } from '../../serviceInterfaces/index.js';
import type { IMessagingPort } from '../../ports/index.js';

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

describe('ExpertRecommendationService', () => {
  it('queries experts via MCP and sends a formatted ephemeral message', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);
    vi.mocked(mcpService.callTool).mockResolvedValue(
      toolResult({
        topic: 'kubernetes',
        count: 1,
        experts: [
          { person: { person_id: 'U1', name: 'Ana Garcia', department: 'DevOps' }, topic: 'kubernetes', score: 0.92 },
        ],
      }),
    );

    await service.findExperts('C1', 'U-asker', 'kubernetes');

    expect(mcpService.callTool).toHaveBeenCalledWith('query_experts', { topic: 'kubernetes', limit: 3 });
    expect(messaging.sendEphemeralMessage).toHaveBeenCalledWith(
      'C1',
      'U-asker',
      expect.stringContaining('Ana Garcia'),
    );
  });

  it('caps results at maxExperts passed to the constructor', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging, 1);
    vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ topic: 'k8s', count: 0, experts: [] }));

    await service.findExperts('C1', 'U-asker', 'k8s');

    expect(mcpService.callTool).toHaveBeenCalledWith('query_experts', { topic: 'k8s', limit: 1 });
  });

  it('sends a validation message when topic is empty', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);

    await service.findExperts('C1', 'U-asker', '   ');

    expect(mcpService.callTool).not.toHaveBeenCalled();
    expect(messaging.sendEphemeralMessage).toHaveBeenCalledWith(
      'C1',
      'U-asker',
      expect.stringContaining('topic'),
    );
  });

  it('sends a no-experts-found message when the graph has no matches', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);
    vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ topic: 'obscure', count: 0, experts: [] }));

    await service.findExperts('C1', 'U-asker', 'obscure');

    expect(messaging.sendEphemeralMessage).toHaveBeenCalledWith(
      'C1',
      'U-asker',
      expect.stringContaining("couldn't find"),
    );
  });

  it('sends a failure message and does not throw when the MCP call fails', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);
    vi.mocked(mcpService.callTool).mockRejectedValue(new Error('mcp-server unreachable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.findExperts('C1', 'U-asker', 'kubernetes')).resolves.not.toThrow();
    expect(messaging.sendEphemeralMessage).toHaveBeenCalledWith(
      'C1',
      'U-asker',
      expect.stringContaining("couldn't reach"),
    );

    consoleErrorSpy.mockRestore();
  });

  it('swallows a tool error result instead of throwing', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);
    vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ error: 'boom' }, true));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.findExperts('C1', 'U-asker', 'kubernetes')).resolves.not.toThrow();

    consoleErrorSpy.mockRestore();
  });

  it('logs but does not throw when sending the recommendation fails', async () => {
    const mcpService = makeMcpServiceMock();
    const messaging = makeMessagingMock();
    const service = new ExpertRecommendationService(mcpService, messaging);
    vi.mocked(mcpService.callTool).mockResolvedValue(
      toolResult({
        topic: 'kubernetes',
        count: 1,
        experts: [{ person: { person_id: 'U1', name: 'Ana' }, topic: 'kubernetes', score: 0.5 }],
      }),
    );
    vi.mocked(messaging.sendEphemeralMessage).mockRejectedValue(new Error('slack unavailable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.findExperts('C1', 'U-asker', 'kubernetes')).resolves.not.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
