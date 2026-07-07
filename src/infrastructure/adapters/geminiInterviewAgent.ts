import { Type } from '@google/genai';
import type { GoogleGenAI, Content, Schema } from '@google/genai';
import type { IInterviewAgent, InterviewAgentContext, InterviewAgentTurnResult } from '../../application/ports';
import { INTERVIEW_TOPICS } from '../../domain';
import type { InterviewTopic } from '../../domain';

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

export class GeminiInterviewAgent implements IInterviewAgent {
  readonly #client: GoogleGenAI;
  readonly #model: string;

  constructor(client: GoogleGenAI, model: string) {
    this.#client = client;
    this.#model = model;
  }

  async nextTurn(context: InterviewAgentContext): Promise<InterviewAgentTurnResult> {
    const response = await this.#client.models.generateContent({
      model: this.#model,
      contents: this.#buildContents(context),
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

  #buildContents(context: InterviewAgentContext): Content[] {
    const history: Content[] = context.turns.map((turn) => ({
      role: turn.speakerRole === 'interviewer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
    return [...history, { role: 'user', parts: [{ text: context.incomingMessage }] }];
  }

  #buildSystemInstruction(context: InterviewAgentContext): string {
    return [
      `Sos un entrevistador empático de RRHH conduciendo, vía Slack DM, la entrevista de` +
        ` offboarding de ${context.employeeName}, un empleado que está dejando la organización.`,
      `Tu objetivo es cubrir de forma conversacional (nunca como un formulario) los siguientes` +
        ` temas pendientes: ${context.pendingTopics.join(', ')}.`,
      'Hacé una pregunta abierta a la vez, interpretá la respuesta en lenguaje natural y hacé' +
        ' follow-ups contextuales cuando la respuesta sea incompleta.',
      'Respondé siempre con un único objeto JSON que matchee el schema provisto: `replyText` es' +
        ' el mensaje que se le manda al empleado; `topic` es el tema de INTERVIEW_TOPICS que' +
        ' cubre la respuesta entrante del empleado (o null si todavía no cubre ninguno); `sentiment`' +
        ' y `answerText` resumen esa respuesta (o null); `isComplete` es true solo cuando los' +
        ' 5 temas ya fueron cubiertos y correspondería cerrar la entrevista con un mensaje de cierre.',
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
