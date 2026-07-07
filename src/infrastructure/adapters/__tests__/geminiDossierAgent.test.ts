import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { GeminiDossierAgent } from '../geminiDossierAgent';
import type { DossierGenerationContext } from '../../../application/ports';
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

function makeContext(overrides: Partial<DossierGenerationContext> = {}): DossierGenerationContext {
  return {
    employeeName: 'Alice',
    turns: [makeTurn()],
    ...overrides,
  };
}

const VALID_RESULT = {
  summary: 'Alice led the CRM migration and documented handover contacts.',
  sections: [
    { title: 'Ongoing Projects', content: 'CRM migration, completed last month.' },
    { title: 'Key Contacts', content: 'Bob from IT co-owns the CRM migration.' },
  ],
};

describe('GeminiDossierAgent', () => {
  let client: GoogleGenAI;
  let agent: GeminiDossierAgent;

  beforeEach(() => {
    client = makeGenAiMock();
    agent = new GeminiDossierAgent(client, 'gemini-2.5-flash');
  });

  it('sends the interview turns as content to Gemini', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    await agent.generate(makeContext());

    expect(client.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'We migrated the CRM last month.' }] }],
      }),
    );
  });

  it('requests structured JSON output', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    await agent.generate(makeContext());

    const call = vi.mocked(client.models.generateContent).mock.calls[0]?.[0];
    expect(call?.config?.responseMimeType).toBe('application/json');
    expect(call?.config?.responseSchema).toBeDefined();
  });

  it('parses a valid JSON response into a DossierDraft', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify(VALID_RESULT)));

    const result = await agent.generate(makeContext());

    expect(result).toEqual(VALID_RESULT);
  });

  it('throws when the response has no text', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(undefined));

    await expect(agent.generate(makeContext())).rejects.toThrow();
  });

  it('throws when the response is not valid JSON', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse('not json'));

    await expect(agent.generate(makeContext())).rejects.toThrow();
  });

  it('throws when the response JSON does not match the expected shape', async () => {
    vi.mocked(client.models.generateContent).mockResolvedValue(makeResponse(JSON.stringify({ summary: 'hi' })));

    await expect(agent.generate(makeContext())).rejects.toThrow();
  });
});
