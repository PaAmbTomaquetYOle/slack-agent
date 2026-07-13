import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GoogleGenAI, GenerateContentResponse, FunctionCall } from '@google/genai';
import { GeminiInterviewAgent } from '../geminiInterviewAgent';
import type { InterviewAgentContext } from '../../../application/ports';
import type { IMcpService, IAuthService } from '../../../application/serviceInterfaces';
import type { InterviewTurn, McpTool, McpToolResult } from '../../../domain';
import { AuthenticationRequiredError, INTERVIEW_TOPICS } from '../../../domain';

function makeGenAiMock() {
  return { models: { generateContent: vi.fn() } } as unknown as GoogleGenAI;
}

function makeResponse(text: string | undefined, functionCalls?: FunctionCall[]): GenerateContentResponse {
  return { text, functionCalls } as unknown as GenerateContentResponse;
}

function makeMcpServiceMock(): IMcpService {
  return {
    discoverTools: vi.fn().mockResolvedValue([]),
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
  };
}

function makeAuthServiceMock(): IAuthService {
  return {
    initiateAuth: vi.fn().mockResolvedValue(undefined),
    handleAuthCodeMessage: vi.fn().mockResolvedValue(undefined),
    hasPendingAuth: vi.fn().mockReturnValue(false),
    isAuthErrorMessage: vi.fn((message: string) => /not authenticated/i.test(message)),
  };
}

function makeTurn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    turnType: 'note',
    speakerRole: 'interviewee',
    timestamp: new Date('2026-07-06T09:00:00.000Z'),
    content: 'We migrated the CRM last month.',
    order: 0,
    topic: 'current_projects',
    sentiment: 'neutral',
    answerText: 'Migrated the CRM',
    ...overrides,
  };
}

function makeContext(overrides: Partial<InterviewAgentContext> = {}): InterviewAgentContext {
  return {
    employeeName: 'Alice',
    slackUserId: 'U-DEPARTING',
    pendingTopics: ['key_contacts'],
    turns: [makeTurn(), makeTurn({ speakerRole: 'interviewer', turnType: 'question', content: 'Who else worked on it?', topic: null, sentiment: null, answerText: null, order: 1 })],
    incomingMessage: 'Just me and Bob from IT.',
    ...overrides,
  };
}

const VALID_RESULT = {
  replyText: 'Got it — any credentials Bob would need?',
  topic: 'key_contacts',
  sentiment: 'neutral',
  answerText: 'Bob from IT co-owns the CRM migration.',
  isComplete: false,
};

describe('GeminiInterviewAgent', () => {
  let client: GoogleGenAI;
  let mcpService: IMcpService;
  let authService: IAuthService;
  let agent: GeminiInterviewAgent;

  beforeEach(() => {
    client = makeGenAiMock();
    mcpService = makeMcpServiceMock();
    authService = makeAuthServiceMock();
    agent = new GeminiInterviewAgent(client, 'gemini-2.5-flash', mcpService, authService);
  });

  it('sends the turn history mapped to Gemini roles plus the incoming message', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    await agent.nextTurn(makeContext());

    expect(client.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: 'We migrated the CRM last month.' }] },
          { role: 'model', parts: [{ text: 'Who else worked on it?' }] },
          { role: 'user', parts: [{ text: 'Just me and Bob from IT.' }] },
        ],
      }),
    );
  });

  it('requests structured JSON output', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    await agent.nextTurn(makeContext());

    const call = vi.mocked(client.models.generateContent).mock.calls[0]?.[0];
    expect(call?.config?.responseMimeType).toBe('application/json');
    expect(call?.config?.responseSchema).toBeDefined();
  });

  it('parses a valid JSON response into an InterviewAgentTurnResult', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    const result = await agent.nextTurn(makeContext());

    expect(result).toEqual(VALID_RESULT);
  });

  it('throws when the response has no text', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(undefined));

    await expect(agent.nextTurn(makeContext())).rejects.toThrow();
  });

  it('throws when the response is not valid JSON', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse('not json'));

    await expect(agent.nextTurn(makeContext())).rejects.toThrow();
  });

  it('throws when the response JSON does not match the expected shape', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(
      makeResponse(JSON.stringify({ replyText: 'hi' })),
    );

    await expect(agent.nextTurn(makeContext())).rejects.toThrow();
  });

  describe('MCP task tool-calling (first turn only)', () => {
    function makeFirstTurnContext(overrides: Partial<InterviewAgentContext> = {}): InterviewAgentContext {
      return {
        employeeName: 'Alice',
        slackUserId: 'U-DEPARTING',
        pendingTopics: [...INTERVIEW_TOPICS],
        turns: [],
        incomingMessage: 'Hi there',
        ...overrides,
      };
    }

    const jiraTool: McpTool = {
      name: 'get_pending_jira_issues',
      description: 'Get pending Jira issues',
      inputSchema: { type: 'object' },
    };

    it("calls the discovered MCP task tool and feeds its result back before the final JSON pass", async () => {
      vi.mocked(mcpService.discoverTools).mockResolvedValue([jiraTool]);
      const toolResult: McpToolResult = {
        content: [{ type: 'text', text: '[{"id":"T-1","title":"Fix bug"}]' }],
        isError: false,
      };
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult);
      vi.mocked(client.models.generateContent)
        .mockResolvedValueOnce(
          makeResponse(undefined, [{ name: 'get_pending_jira_issues', args: { assignee: 'Alice' } }]),
        )
        .mockResolvedValueOnce(makeResponse(undefined)) // no further function calls -> exits the tool loop
        .mockResolvedValueOnce(makeResponse(JSON.stringify(VALID_RESULT))); // final structured-JSON pass

      const result = await agent.nextTurn(makeFirstTurnContext());

      expect(mcpService.callTool).toHaveBeenCalledWith(
        'get_pending_jira_issues',
        expect.objectContaining({ user_id: 'U-DEPARTING', assignee: 'Alice' }),
      );
      expect(result).toEqual(VALID_RESULT);
      expect(client.models.generateContent).toHaveBeenCalledTimes(3);
      const firstCallArgs = vi.mocked(client.models.generateContent).mock.calls[0]?.[0];
      expect(firstCallArgs?.config?.tools).toEqual([
        { functionDeclarations: [{ name: 'get_pending_jira_issues', description: 'Get pending Jira issues', parametersJsonSchema: { type: 'object' } }] },
      ]);
    });

    it('does not offer tools on turns after the first', async () => {
      vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

      await agent.nextTurn(makeContext()); // default context has turns.length === 2

      expect(mcpService.discoverTools).not.toHaveBeenCalled();
      expect(client.models.generateContent).toHaveBeenCalledTimes(1);
    });

    it('throws AuthenticationRequiredError when a task tool reports the user is not authenticated', async () => {
      vi.mocked(mcpService.discoverTools).mockResolvedValue([jiraTool]);
      const toolResult: McpToolResult = {
        content: [{ type: 'text', text: 'User not authenticated with Jira' }],
        isError: true,
      };
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult);
      vi.mocked(client.models.generateContent).mockResolvedValueOnce(
        makeResponse(undefined, [{ name: 'get_pending_jira_issues', args: { assignee: 'Alice' } }]),
      );

      await expect(agent.nextTurn(makeFirstTurnContext())).rejects.toBeInstanceOf(AuthenticationRequiredError);
    });

    it('extracts structured tasks from a well-formed CollaborationTask JSON tool result (SA-18)', async () => {
      vi.mocked(mcpService.discoverTools).mockResolvedValue([jiraTool]);
      const toolResult: McpToolResult = {
        content: [{
          type: 'text',
          text: JSON.stringify([
            { task_id: 'PROJ-1', title: 'Fix the thing', status: 'in_progress', url: 'https://jira/PROJ-1', description: 'desc', collaboration_tool: 'JIRA' },
          ]),
        }],
        isError: false,
      };
      vi.mocked(mcpService.callTool).mockResolvedValue(toolResult);
      vi.mocked(client.models.generateContent)
        .mockResolvedValueOnce(
          makeResponse(undefined, [{ name: 'get_pending_jira_issues', args: { assignee: 'Alice' } }]),
        )
        .mockResolvedValueOnce(makeResponse(undefined))
        .mockResolvedValueOnce(makeResponse(JSON.stringify(VALID_RESULT)));

      const result = await agent.nextTurn(makeFirstTurnContext());

      expect(result.tasks).toEqual([
        { id: 'PROJ-1', title: 'Fix the thing', source: 'jira', status: 'in_progress', url: 'https://jira/PROJ-1', description: 'desc' },
      ]);
    });

    it('degrades gracefully (no tools offered) when MCP tool discovery fails', async () => {
      vi.mocked(mcpService.discoverTools).mockRejectedValue(new Error('mcp-server unreachable'));
      vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await agent.nextTurn(makeFirstTurnContext());

      expect(result).toEqual(VALID_RESULT);
      expect(client.models.generateContent).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });
});
