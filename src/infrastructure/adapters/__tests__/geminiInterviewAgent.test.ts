import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { GeminiInterviewAgent } from '../geminiInterviewAgent';
import type { InterviewAgentContext } from '../../../application/ports';
import type { InterviewTurn } from '../../../domain';

function makeGenAiMock() {
  return { models: { generateContent: vi.fn() } } as unknown as GoogleGenAI;
}

function makeResponse(text: string | undefined): GenerateContentResponse {
  return { text } as unknown as GenerateContentResponse;
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
  let agent: GeminiInterviewAgent;

  beforeEach(() => {
    client = makeGenAiMock();
    agent = new GeminiInterviewAgent(client, 'gemini-2.5-flash');
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
});
