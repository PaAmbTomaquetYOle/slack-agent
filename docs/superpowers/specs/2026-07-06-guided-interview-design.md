# SA-3: Entrevista guiada por IA vía Slack DM — Design

GitHub issue: [#8](https://github.com/PaAmbTomaquetYOle/slack-agent/issues/8)

## Contexto

El DM de bienvenida al arrancar el offboarding ya existe (`OffboardingStartedEvent` →
`createOffboardingStartedHandler`, sin tocar en este trabajo). Esta issue implementa lo que pasa
después: cuando el empleado saliente responde a ese DM, arranca una entrevista guiada por IA que
cubre 5 áreas fijas, con follow-ups contextuales, soporta pausar/retomar de forma implícita, y al
terminar publica `interview.completed` a Kafka para que el backend dispare la generación del
dossier.

Dependencias (SA-2, SA-13) ya están mergeadas en `develop`. `IInterviewRepository` /
`HttpInterviewRepository` ya existen y están conectados en `AppFactory` pero sin usar todavía.

LLM elegido: **Google AI Studio (Gemini)**, vía SDK `@google/genai`. API key en `.env` local
(`GEMINI_API_KEY`, gitignored).

## Arquitectura

```
DM del empleado (Slack) 
  → InterviewController (nuevo)              [infrastructure/controllers]
  → InterviewService.handleIncomingDirectMessage  [application/services]
      ├─ IOffboardingProcessRepository.findAll   (ya existe) — localizar proceso activo
      ├─ IInterviewRepository.start/addTurns/complete (ya existe) — persistencia de la entrevista
      ├─ IInterviewAgent.nextTurn (nuevo puerto)  — turno de conversación
      │     └─ GeminiInterviewAgent (nuevo adapter, @google/genai)
      ├─ IMessagingPort.sendDirectMessage (ya existe) — responder por Slack
      └─ IDomainEventBus.publish(InterviewCompletedEvent) (nuevo evento in-process)
            └─ createKafkaInterviewCompletedForwarder (nuevo) → IEventPublisher.publish(interview.completed)
```

Capas respetadas: `InterviewService` solo importa `domain` + puertos de `application`. El adapter
Gemini y el controller de Slack viven en `infrastructure/`, únicos lugares que tocan SDKs externos.

## Componentes nuevos

### `domain/interview/interviewTopic.ts`

```ts
export const INTERVIEW_TOPICS = [
  'current_projects',
  'key_contacts',
  'undocumented_processes',
  'access_credentials',
  'successor_recommendations',
] as const;
export type InterviewTopic = typeof INTERVIEW_TOPICS[number];
```

Constante de dominio, no entidad — los 5 AC de la issue mapeados 1:1.

### `application/ports/interviewAgent.ts`

```ts
export interface InterviewAgentContext {
  employeeName: string;
  pendingTopics: InterviewTopic[];
  turns: readonly InterviewTurn[];
  incomingMessage: string;
}

export interface InterviewAgentTurnResult {
  replyText: string;
  topic: InterviewTopic | null;
  sentiment: string | null;
  answerText: string | null;
  isComplete: boolean;
}

export interface IInterviewAgent {
  nextTurn(context: InterviewAgentContext): Promise<InterviewAgentTurnResult>;
}
```

### `domain/events/interviewCompletedEvent.ts`

Evento in-process (no confundir con el Kafka `InterviewCompletedOutboundPayload`, que ya existe).
Sigue el patrón de `OffboardingStartedEvent`: `EVENT_NAME = 'interview.completed'`, campos
`processId`, `interviewId`, `turns`.

### `application/services/interviewService.ts` (+ `serviceInterfaces/interviewService.ts`)

```
handleIncomingDirectMessage(userId: string, text: string): Promise<void>

1. processes = offboardingProcessRepository.findAll({ employeeId: userId, state: 'in_progress' })
   - si vacío → no-op (mensaje no pertenece a ninguna entrevista activa)
   - si >1 → tomar el más reciente por createdAt, console.warn
2. interview = interviewRepository.findByProcessId(process.id)
   - si null → interview = interviewRepository.start(process.id)   // primera respuesta arranca la entrevista
3. pendingTopics = INTERVIEW_TOPICS filtrado por topics ya presentes en interview.turns
4. intervieweeTurn = { turnType:'note', speakerRole:'interviewee', content:text, order:turns.length, ... } — placeholder previo a la llamada IA
5. result = interviewAgent.nextTurn({ employeeName, pendingTopics, turns: interview.turns, incomingMessage: text })
   — try/catch: si falla, addTurns([intervieweeTurnCrudo]) igual (no perder info),
     sendDirectMessage(fallback), return
6. turnoInterviewee final = intervieweeTurn con topic/sentiment/answerText de result
   turnoInterviewer = { turnType:'question', speakerRole:'interviewer', content: result.replyText, order:+1 }
   interviewRepository.addTurns(process.id, [turnoInterviewee, turnoInterviewer])
7. messagingPort.sendDirectMessage(userId, result.replyText)
8. si result.isComplete:
     interviewRepository.complete(process.id)
     eventBus.publish(new InterviewCompletedEvent(process.id, interview.id, allTurns))
```

Pausar/retomar: implícito. No hay estado de "pausa" — si el user no escribe, no pasa nada; cuando
vuelve a escribir (aunque sea días después), el flujo relee `interview.turns` completo desde el
backend y continúa. No hace falta trackear nada adicional.

### `infrastructure/adapters/geminiInterviewAgent.ts`

- `new GoogleGenAI({ apiKey: SETTINGS.GEMINI_API_KEY })`
- Mapea `turns` → `contents` (`speakerRole:'interviewer'` → `role:'model'`,
  `'interviewee'` → `role:'user'`), añade `incomingMessage` como último turno `user`.
- System instruction: persona empática tipo entrevistador de RRHH, lista los 5 topics con
  `pendingTopics`, instruye follow-ups contextuales y cuándo devolver `isComplete: true`.
- `generateContent({ config: { responseMimeType: 'application/json', responseSchema } })` —
  `responseSchema` refleja `InterviewAgentTurnResult`.
- Parsea `response.text`, valida shape con type guard (mismo patrón que
  `isOffboardingStartedPayload` en los handlers existentes); si inválido, throw `Error` tipado.

### `infrastructure/controllers/interviewController.ts`

```ts
app.message(async ({ message }) => {
  if (message.channel_type !== 'im') return;
  if ('subtype' in message) return;       // ignora edits, joins, bot_message
  if (!('text' in message) || !message.text || !('user' in message)) return;
  await interviewService.handleIncomingDirectMessage(message.user, message.text);
});
```

### `application/events/kafkaInterviewCompletedForwarder.ts`

Mismo patrón que `kafkaOffboardingStartedForwarder`: type-guard sobre `InterviewCompletedEvent`,
publica `{ eventType: OUTBOUND_INTERVIEW_COMPLETED, payload: { process_id, turns } }` mapeando
`InterviewTurn[]` → `OutboundInterviewTurnPayload[]` (mapper ya insinuado por
`mapInterviewTurnToRequest`, reusar lógica de shape similar).

### Settings

`constants.ts`: añadir `GEMINI_API_KEY` (sin default, requerido) y `GEMINI_MODEL`
(default `'gemini-2.5-flash'`).

### `appFactory.ts`

Instanciar `GeminiInterviewAgent`, `InterviewService(interviewRepository,
offboardingProcessRepository, interviewAgent, messagingPort, eventBus)`, registrar
`InterviewController`, y `eventBus.subscribe(InterviewCompletedEvent.EVENT_NAME,
createKafkaInterviewCompletedForwarder(publisher))`.

### Dependencia nueva

`@google/genai` en `package.json`.

## Testing

Vitest, mismo patrón que el resto del repo (mocks manuales, `vi.fn()`, sin frameworks de mocking
adicionales):

- `interviewService.test.ts` — mockea los 5 puertos, cubre: arranque en primera respuesta,
  continuación con historial existente, selección del proceso activo, fallback en error del
  agente, publicación del evento al completar.
- `interviewController.test.ts` — usa `src/testing/slackMocks.ts`, verifica filtro de
  `channel_type`/`subtype`/mensajes sin texto.
- `geminiInterviewAgent.test.ts` — mock del cliente `@google/genai`, valida construcción de
  `contents`/`system_instruction`, parseo de JSON válido, error en JSON inválido o campos
  faltantes.
- `kafkaInterviewCompletedForwarder.test.ts` — mismo esqueleto que
  `kafkaOffboardingStartedForwarder.test.ts`.

## Fuera de alcance (explícitamente)

- Auto-poblar "proyectos actuales" desde Jira/Trello (MCP) dentro de la entrevista — la AC solo
  pide que el tema se cubra conversacionalmente; integrarlo con `IMcpService` sería un tema
  aparte, no mencionado en los AC de esta issue.
- `channelId`/`tasks`/`assignedReviewer` en `OffboardingProcess` (comentarios `// SA-3` en
  `process.ts`) — no se necesitan para esta issue: la búsqueda del proceso activo se hace por
  `employeeId` vía `findAll`, no por canal.
- SA-14 (`InterviewStarted` a Kafka) — issue separada, no se implementa aquí.
