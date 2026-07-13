import { Type } from '@google/genai';
import type { GoogleGenAI, Content, Schema } from '@google/genai';
import type {
  IReviewInterviewAgent,
  ReviewInterviewAgentContext,
  InterviewAgentTurnResult,
} from '../../application/ports';
import { INTERVIEW_TOPICS } from '../../domain';
import type { InterviewTopic, ReviewScope } from '../../domain';

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    replyText: { type: Type.STRING },
    topic: { type: Type.STRING, enum: [...INTERVIEW_TOPICS], nullable: true },
    sentiment: { type: Type.STRING, nullable: true },
    answerText: { type: Type.STRING, nullable: true },
    isComplete: { type: Type.BOOLEAN },
  },
  required: ['replyText', 'topic', 'sentiment', 'answerText', 'isComplete'],
};

const SCOPE_FRAMING: Record<ReviewScope, string> = {
  monthly:
    'a light monthly knowledge-retention check-in — the goal is to understand what' +
    " they've been working on recently, not an exhaustive review.",
  annual:
    'a thorough annual knowledge-retention review — the goal is to document all the' +
    " knowledge the person has accumulated over the past year.",
};

function isInterviewTopicOrNull(value: unknown): value is InterviewTopic | null {
  return value === null || (typeof value === 'string' && (INTERVIEW_TOPICS as readonly string[]).includes(value));
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isInterviewAgentTurnResult(value: unknown): value is InterviewAgentTurnResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<InterviewAgentTurnResult>;
  return (
    typeof v.replyText === 'string' &&
    isInterviewTopicOrNull(v.topic) &&
    isStringOrNull(v.sentiment) &&
    isStringOrNull(v.answerText) &&
    typeof v.isComplete === 'boolean'
  );
}

/**
 * Drives a monthly/annual knowledge-retention review interview (SA-20). Deliberately simpler
 * than GeminiInterviewAgent: no MCP tool calls (Jira/Trello task extraction isn't part of
 * BE-23's review scope), and the system prompt frames the person as staying, not leaving — the
 * offboarding agent's "departing employee" wording would be actively wrong here.
 */
export class GeminiReviewInterviewAgent implements IReviewInterviewAgent {
  readonly #client: GoogleGenAI;
  readonly #model: string;

  constructor(client: GoogleGenAI, model: string) {
    this.#client = client;
    this.#model = model;
  }

  async nextTurn(context: ReviewInterviewAgentContext): Promise<InterviewAgentTurnResult> {
    const contents = this.#buildContents(context);
    const response = await this.#client.models.generateContent({
      model: this.#model,
      contents,
      config: {
        systemInstruction: this.#buildSystemInstruction(context),
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini response contained no text');
    }
    return this.#parseResult(text);
  }

  #buildContents(context: ReviewInterviewAgentContext): Content[] {
    const history: Content[] = context.turns.map((turn) => ({
      role: turn.speakerRole === 'interviewer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
    return [...history, { role: 'user', parts: [{ text: context.incomingMessage }] }];
  }

  #buildSystemInstruction(context: ReviewInterviewAgentContext): string {
    return [
      `You are an empathetic HR interviewer conducting, via Slack DM, ${SCOPE_FRAMING[context.reviewScope]}`,
      `The person being interviewed is ${context.employeeName}, who continues working at the` +
        ' organization — never imply that they are leaving.',
      `Your goal is to conversationally cover (never like a form) the following` +
        ` pending topics: ${context.pendingTopics.join(', ')}.`,
      'Ask one open-ended question at a time, interpret the response in natural language, and' +
        ' ask contextual follow-ups when the response is incomplete.',
      'Always write replyText in the same language the employee uses; mirror their language throughout.',
      'Always respond with a single JSON object matching the provided schema: `replyText` is' +
        ' the message sent to the person; `topic` is the topic covered by the incoming' +
        " response (or null if it doesn't cover any of the pending ones yet); `sentiment` and" +
        ' `answerText` summarize that response (or null); `isComplete` is true only when' +
        ` all ${context.pendingTopics.length} pending topic(s) have been covered and it's` +
        ' appropriate to close the interview with a closing message.',
    ].join('\n');
  }

  #parseResult(text: string): InterviewAgentTurnResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Gemini returned invalid JSON');
    }
    if (!isInterviewAgentTurnResult(parsed)) {
      throw new Error('Gemini response did not match the expected InterviewAgentTurnResult shape');
    }
    return parsed;
  }
}
