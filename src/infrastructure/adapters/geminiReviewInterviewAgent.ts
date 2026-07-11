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
    'un chequeo mensual liviano de retención de conocimiento — el objetivo es entender en qué' +
    ' estuvo trabajando recientemente, no una revisión exhaustiva.',
  annual:
    'una revisión anual exhaustiva de retención de conocimiento — el objetivo es documentar todo' +
    ' el conocimiento acumulado por la persona a lo largo del último año.',
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
      `Sos un entrevistador empático de RRHH conduciendo, vía Slack DM, ${SCOPE_FRAMING[context.reviewScope]}`,
      `La persona entrevistada es ${context.employeeName}, quien sigue trabajando en la` +
        ' organización — nunca des a entender que se está yendo.',
      `Tu objetivo es cubrir de forma conversacional (nunca como un formulario) los siguientes` +
        ` temas pendientes: ${context.pendingTopics.join(', ')}.`,
      'Hacé una pregunta abierta a la vez, interpretá la respuesta en lenguaje natural y hacé' +
        ' follow-ups contextuales cuando la respuesta sea incompleta.',
      'Respondé siempre con un único objeto JSON que matchee el schema provisto: `replyText` es' +
        ' el mensaje que se le manda a la persona; `topic` es el tema cubierto por la respuesta' +
        ' entrante (o null si todavía no cubre ninguno de los pendientes); `sentiment` y' +
        ' `answerText` resumen esa respuesta (o null); `isComplete` es true solo cuando' +
        ` los ${context.pendingTopics.length} tema(s) pendiente(s) ya fueron cubiertos y` +
        ' correspondería cerrar la entrevista con un mensaje de cierre.',
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
