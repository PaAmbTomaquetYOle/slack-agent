import { Type } from '@google/genai';
import type { GoogleGenAI, Content, Schema } from '@google/genai';
import type { IDossierGenerationAgent, DossierGenerationContext } from '../../application/ports';
import type { DossierDraft } from '../../domain';

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
        },
        required: ['title', 'content'],
      },
    },
  },
  required: ['summary', 'sections'],
};

function isDossierDraft(value: unknown): value is DossierDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<DossierDraft>;
  if (typeof v.summary !== 'string' || !Array.isArray(v.sections)) return false;
  return v.sections.every(
    (section) =>
      typeof section === 'object' &&
      section !== null &&
      typeof (section as Record<string, unknown>).title === 'string' &&
      typeof (section as Record<string, unknown>).content === 'string',
  );
}

export class GeminiDossierAgent implements IDossierGenerationAgent {
  readonly #client: GoogleGenAI;
  readonly #model: string;

  constructor(client: GoogleGenAI, model: string) {
    this.#client = client;
    this.#model = model;
  }

  async generate(context: DossierGenerationContext): Promise<DossierDraft> {
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

  #buildContents(context: DossierGenerationContext): Content[] {
    return context.turns.map((turn) => ({
      role: turn.speakerRole === 'interviewer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
  }

  #buildSystemInstruction(context: DossierGenerationContext): string {
    return [
      `Sos un asistente de RRHH que redacta el "Dossier de Traspaso" de` +
        ` ${context.employeeName} a partir de la transcripción de su entrevista de offboarding.`,
      'Respondé siempre con un único objeto JSON que matchee el schema provisto: `summary` es' +
        ' un resumen ejecutivo breve del traspaso; `sections` es una lista de secciones con' +
        ' `title` y `content` (markdown) cubriendo, cuando haya información disponible: proyectos' +
        ' en curso, conocimiento crítico, contactos clave, procesos y procedimientos, y' +
        ' recomendaciones del empleado saliente sobre su sucesor.',
      'Escribí el contenido de forma clara y accionable para quien reciba el traspaso.',
    ].join('\n');
  }

  #parseResult(text: string): DossierDraft {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Gemini returned invalid JSON');
    }
    if (!isDossierDraft(parsed)) {
      throw new Error('Gemini response did not match the expected DossierDraft shape');
    }
    return parsed;
  }
}
