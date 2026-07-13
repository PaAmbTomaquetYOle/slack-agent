import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuestionSuggestionService } from '../questionSuggestionService.js';
import type { IMcpService } from '../../serviceInterfaces/index.js';
import type { IMessagingPort } from '../../ports/index.js';
import { QuestionDetector } from '../../../domain/index.js';

const DETECTOR_CONFIG = { minLength: 10 };
const QUESTION_TEXT = 'How do I deploy the staging environment?';
const NON_QUESTION_TEXT = 'I deployed the staging environment yesterday.';

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

describe('QuestionSuggestionService', () => {
  let mcpService: IMcpService;
  let messaging: IMessagingPort;
  let service: QuestionSuggestionService;

  beforeEach(() => {
    mcpService = makeMcpServiceMock();
    messaging = makeMessagingMock();
    service = new QuestionSuggestionService(
      new QuestionDetector(DETECTOR_CONFIG),
      mcpService,
      messaging,
      ['C-monitored'],
    );
  });

  it('searches and suggests results for a question in a monitored channel', async () => {
    vi.mocked(mcpService.callTool).mockResolvedValue(
      toolResult({
        results: [
          { external_id: 's1', title: 'Deploying to staging', link: 'https://example.com/s1' },
        ],
      }),
    );

    await service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT);

    expect(mcpService.callTool).toHaveBeenCalledWith('test_search_query', { query: QUESTION_TEXT });
    expect(messaging.sendEphemeralMessage).toHaveBeenCalledWith(
      'C-monitored',
      'U1',
      expect.stringContaining('<https://example.com/s1|Deploying to staging>'),
    );
  });

  it('caps suggestions at maxSuggestions', async () => {
    service = new QuestionSuggestionService(
      new QuestionDetector(DETECTOR_CONFIG),
      mcpService,
      messaging,
      ['C-monitored'],
      1,
    );
    vi.mocked(mcpService.callTool).mockResolvedValue(
      toolResult({
        results: [
          { external_id: 's1', title: 'First', link: 'https://example.com/s1' },
          { external_id: 's2', title: 'Second', link: 'https://example.com/s2' },
        ],
      }),
    );

    await service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT);

    const [, , text] = vi.mocked(messaging.sendEphemeralMessage).mock.calls[0]!;
    expect(text).toContain('First');
    expect(text).not.toContain('Second');
  });

  it('does nothing when there are no matching results', async () => {
    vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ results: [] }));

    await service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT);

    expect(messaging.sendEphemeralMessage).not.toHaveBeenCalled();
  });

  it('does nothing for a non-question message', async () => {
    await service.handleChannelMessage('C-monitored', 'U1', NON_QUESTION_TEXT);

    expect(mcpService.callTool).not.toHaveBeenCalled();
    expect(messaging.sendEphemeralMessage).not.toHaveBeenCalled();
  });

  it('ignores messages from unmonitored channels', async () => {
    await service.handleChannelMessage('C-other', 'U1', QUESTION_TEXT);

    expect(mcpService.callTool).not.toHaveBeenCalled();
  });

  it('swallows tool call errors instead of throwing', async () => {
    vi.mocked(mcpService.callTool).mockRejectedValue(new Error('mcp-server unreachable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT)).resolves.not.toThrow();
    expect(messaging.sendEphemeralMessage).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('swallows a tool error result instead of throwing', async () => {
    vi.mocked(mcpService.callTool).mockResolvedValue(toolResult({ error: 'boom' }, true));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT)).resolves.not.toThrow();
    expect(messaging.sendEphemeralMessage).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('logs but does not throw when sending the suggestion fails', async () => {
    vi.mocked(mcpService.callTool).mockResolvedValue(
      toolResult({ results: [{ external_id: 's1', title: 'First', link: 'https://example.com/s1' }] }),
    );
    vi.mocked(messaging.sendEphemeralMessage).mockRejectedValue(new Error('slack unavailable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.handleChannelMessage('C-monitored', 'U1', QUESTION_TEXT)).resolves.not.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
