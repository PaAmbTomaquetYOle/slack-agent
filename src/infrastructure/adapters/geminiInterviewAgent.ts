import { Type } from '@google/genai';
import type { GoogleGenAI, Content, Schema, FunctionDeclaration, Part, FunctionCall } from '@google/genai';
import type { IInterviewAgent, InterviewAgentContext, InterviewAgentTurnResult, ExtractedTask } from '../../application/ports/index.js';
import type { IMcpService } from '../../application/serviceInterfaces/index.js';
import type { IAuthService } from '../../application/serviceInterfaces/index.js';
import { INTERVIEW_TOPICS, AuthenticationRequiredError } from '../../domain/index.js';
import type { InterviewTopic, AuthProvider, McpToolResult, TaskSource } from '../../domain/index.js';

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

// SA-10: the only MCP tools exposed to the model. Deliberately excludes the auth tools
// (generate_*_auth_url / complete_*_auth) — completing an OAuth handoff needs a Slack button and
// a follow-up DM with the credential, which the existing AuthService flow already does well.
// When a task tool reports the user isn't authenticated, this agent throws
// AuthenticationRequiredError instead of trying to self-heal, and the orchestrator hands off to
// AuthService.initiateAuth.
const TOOL_PROVIDERS: Record<string, AuthProvider> = {
  get_pending_jira_issues: 'jira',
  get_pending_trello_cards: 'trello',
};
const MAX_TOOL_ITERATIONS = 4;

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
  readonly #mcpService: IMcpService;
  readonly #authService: IAuthService;
  #toolDeclarations: FunctionDeclaration[] | null = null;

  constructor(client: GoogleGenAI, model: string, mcpService: IMcpService, authService: IAuthService) {
    this.#client = client;
    this.#model = model;
    this.#mcpService = mcpService;
    this.#authService = authService;
  }

  async nextTurn(context: InterviewAgentContext): Promise<InterviewAgentTurnResult> {
    const isFirstTurn = context.turns.length === 0;
    const toolDeclarations = isFirstTurn ? await this.#getToolDeclarations() : [];
    let contents = this.#buildContents(context);
    const extractedTasks: ExtractedTask[] = [];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS && toolDeclarations.length > 0; iteration++) {
      const response = await this.#client.models.generateContent({
        model: this.#model,
        contents,
        config: {
          systemInstruction: this.#buildSystemInstruction(context, isFirstTurn),
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });
      const calls = response.functionCalls;
      if (!calls || calls.length === 0) break;

      contents = [
        ...contents,
        { role: 'model', parts: calls.map((call): Part => ({ functionCall: call })) },
        { role: 'user', parts: await this.#executeToolCalls(calls, context, extractedTasks) },
      ];
    }

    const response = await this.#client.models.generateContent({
      model: this.#model,
      contents,
      config: {
        systemInstruction: this.#buildSystemInstruction(context, isFirstTurn),
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini response contained no text');
    }
    const result = this.#parseResult(text);
    return extractedTasks.length > 0 ? { ...result, tasks: extractedTasks } : result;
  }

  async #executeToolCalls(
    calls: FunctionCall[],
    context: InterviewAgentContext,
    extractedTasks: ExtractedTask[],
  ): Promise<Part[]> {
    const parts: Part[] = [];
    for (const call of calls) {
      if (!call.name) continue;
      const response = await this.#callMcpTool(call.name, call.args ?? {}, context, extractedTasks);
      parts.push({ functionResponse: { name: call.name, response } });
    }
    return parts;
  }

  async #callMcpTool(
    name: string,
    args: Record<string, unknown>,
    context: InterviewAgentContext,
    extractedTasks: ExtractedTask[],
  ): Promise<Record<string, unknown>> {
    const toolArgs = { ...args, user_id: context.slackUserId, assignee: args['assignee'] ?? context.employeeName };
    let result: McpToolResult;
    try {
      result = await this.#mcpService.callTool(name, toolArgs);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    const text = GeminiInterviewAgent.#textFromResult(result);
    if (result.isError) {
      if (this.#authService.isAuthErrorMessage(text)) {
        const provider = TOOL_PROVIDERS[name];
        if (provider) throw new AuthenticationRequiredError(provider);
      }
      return { error: text || `${name} returned an error` };
    }
    if (name in TOOL_PROVIDERS) {
      extractedTasks.push(...GeminiInterviewAgent.#tasksFromResultText(text, TOOL_PROVIDERS[name] as TaskSource));
    }
    return { output: text };
  }

  async #getToolDeclarations(): Promise<FunctionDeclaration[]> {
    if (this.#toolDeclarations) return this.#toolDeclarations;
    try {
      const tools = await this.#mcpService.discoverTools();
      this.#toolDeclarations = tools
        .filter((tool) => tool.name in TOOL_PROVIDERS)
        .map((tool): FunctionDeclaration => ({
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          parametersJsonSchema: tool.inputSchema,
        }));
    } catch (error) {
      console.warn('Failed to discover MCP tools; continuing the interview without task data.', error);
      this.#toolDeclarations = [];
    }
    return this.#toolDeclarations;
  }

  #buildContents(context: InterviewAgentContext): Content[] {
    const history: Content[] = context.turns.map((turn) => ({
      role: turn.speakerRole === 'interviewer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }));
    return [...history, { role: 'user', parts: [{ text: context.incomingMessage }] }];
  }

  #buildSystemInstruction(context: InterviewAgentContext, isFirstTurn: boolean): string {
    const lines = [
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
    ];
    if (isFirstTurn) {
      lines.push(
        'Antes de tu primera pregunta, si tenés disponibles las herramientas' +
          ' get_pending_jira_issues y/o get_pending_trello_cards, llamalas para ver las tareas' +
          ` pendientes de ${context.employeeName} y usá esa información para orientar la` +
          ' conversación sobre proyectos actuales y procesos pendientes. Si la herramienta falla' +
          ' o no hay tareas, continuá la entrevista con normalidad sin mencionar el error.',
      );
    }
    return lines.join('\n');
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

  static #textFromResult(result: McpToolResult): string {
    return result.content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join(' ');
  }

  // The mcp-server task tools return a JSON array of CollaborationTask-derived objects
  // (task_id, title, status, description, url, ...) serialized into the tool result's text
  // block. Malformed/unexpected shapes are skipped rather than failing the interview turn.
  static #tasksFromResultText(text: string, source: TaskSource): ExtractedTask[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const tasks: ExtractedTask[] = [];
    for (const item of parsed as unknown[]) {
      if (!GeminiInterviewAgent.#isRawCollaborationTask(item)) continue;
      tasks.push({
        id: item['task_id'],
        title: item['title'],
        source,
        status: item['status'],
        url: typeof item['url'] === 'string' ? item['url'] : null,
        description: typeof item['description'] === 'string' ? item['description'] : null,
      });
    }
    return tasks;
  }

  static #isRawCollaborationTask(value: unknown): value is Record<string, unknown> & {
    task_id: string;
    title: string;
    status: string;
  } {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v['task_id'] === 'string' && typeof v['title'] === 'string' && typeof v['status'] === 'string';
  }
}
