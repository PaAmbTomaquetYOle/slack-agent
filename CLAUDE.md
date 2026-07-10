# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision: OffboardMe

A Slack agent that fights knowledge loss caused by high employee turnover. When a key person leaves, operational knowledge walks out the door. The agent captures and retrieves it. Planned in three phases:

1. **Phase 1 (MVP — Smart Offboarding):** When a volunteer announces departure, an MCP server pulls their open tasks from Jira/Trello. The agent runs a guided interview over Slack to document the state of each item, then Slack AI summarizes it into a "Handover Dossier."
2. **Phase 2 (Dynamic SOPs):** The agent monitors channels where newcomers ask questions. When a veteran gives a detailed answer about a procedure, the agent offers to save it as a Standard Operating Procedure (SOP), using the Real-Time Search API to link it to similar past questions.
3. **Phase 3 (Knowledge Graph backend):** A graph database (e.g. Neo4j) maps who interacts with whom, which documents are shared, and which topics each person dominates. On a crisis the agent recommends experts ("based on 2 years of history, Laura and Carlos are the experts on this — contact them") rather than only searching documents.

Phase 1 business logic is implemented: the offboarding state machine, the guided Slack DM interview, dossier generation, and the SA-10 orchestrator coordinating trigger → interview → dossier are all wired up. Phase 2/3 work (dynamic SOPs, knowledge graph) is partial or not yet started.

### Backend contract (BE-7)

slack-agent talks to `backend` over two channels with a strict split:

- **Kafka is the only write path.** The backend's REST surface is **read-only** — it no longer exposes `POST/PATCH/DELETE` for offboarding/interview/dossier. All state changes (trigger, interview turns, completion, cancellation, dossier generation, SOP creation) are Kafka command/event topics; see "Kafka event contract" in `README.md`. `httpOffboardingProcessRepository.ts`, `httpInterviewRepository.ts`, and `httpDossierRepository.ts` implement only their surviving read methods (`findById`/`findAll`/`findByProcessId`), kept for `OffboardingOrchestrator.recover()` and `InterviewService#findActiveProcess`.
- **Interview turns live in memory.** Since the backend can't persist them over REST anymore, `InterviewService` keeps the conversation in `IInterviewSessionStore` (`InMemoryInterviewSessionStore`) and only crosses over to Kafka at `interview.started` and `interview.completed` (the latter carrying every turn). A process restart mid-interview loses unsent turns — accepted trade-off.
- **Kafka requires SASL_SSL/SCRAM-SHA-512.** The broker no longer accepts PLAINTEXT; see `KAFKA_SASL_*`/`KAFKA_SSL_CA` in `.env.example` and the `Kafka` client construction in `appFactory.ts`.
- **REST reads use a backend-issued token.** slack-agent no longer self-signs its JWT. `BackendTokenProvider` (`infrastructure/http/backendTokenProvider.ts`) exchanges `BACKEND_CLIENT_ID`/`BACKEND_CLIENT_SECRET` for an access token via `POST {BACKEND_API_URL}/auth/token` (client-credentials grant), caching and refreshing it; `createBackendHttpClient` attaches it as `Authorization: Bearer <token>`.

## Commands

```bash
npm run dev      # nodemon + ts-node, watches src/, runs src/index.ts
npm run build    # tsc -> compiles src/ to dist/
npm start        # node dist/index.js (run build first)
```

There is **no test runner yet** — `npm test` is a placeholder that exits 1. There is no linter configured.

The bot runs in **Slack Socket Mode** (`socketMode: true` in `appOptions.ts`), so local dev needs no public URL/tunnel. Requires a `.env` (see `.env.example`) with `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, and optionally `PORT` (default 3000), `MCP_SERVER_URL` (default `http://localhost:8000/mcp`), `CLIENT_NAME`, `CLIENT_VERSION`.

## Architecture

**Hexagonal (Ports & Adapters).** Three layers under `src/`, with a strict inward dependency rule — never violate it:

- **`domain/`** — Pure business logic (entities, value objects, domain errors). Zero external dependencies: no `@slack/bolt`, no ORMs, no HTTP clients. Depends on nothing. Rule of thumb: swapping Slack for MS Teams must not touch this folder.
- **`application/`** — Use cases and the interfaces that bound them. May import `domain/` only — **never** `infrastructure/`. Framework-agnostic.
  - `ports/` — Boundary interfaces. Inbound/driving ports (the API the app exposes, called by controllers) and outbound/driven ports (what the app needs from the outside, implemented by adapters/repositories).
  - `serviceInterfaces/` — Contracts each application service implements, so infrastructure depends on abstractions (dependency inversion).
  - `services/` — Use case implementations that orchestrate domain entities through ports.
- **`infrastructure/`** — The only layer allowed to import external SDKs, DB drivers, and frameworks. Implements the application's ports.
  - `controllers/` — Primary adapters: Slack event/command/interaction handlers via `@slack/bolt`.
  - `adapters/` — Secondary adapters wrapping external APIs/SDKs (e.g. Jira/Trello clients, LLM wrappers).
  - `repositories/` — Persistence adapters implementing application repository ports (e.g. the Neo4j graph in Phase 3).
  - `settings/` — Env config and framework setup.

Dependency direction: `infrastructure` → `application` → `domain`. Outer layers depend on inner; inner layers never know about outer.

### Wiring: AppFactory

`infrastructure/appFactory.ts` is the composition root. It instantiates adapters, injects them into services, injects services into controllers, and registers controllers against the Bolt `App`. `src/index.ts` only calls `new AppFactory().createApp()` and starts it. Add new controllers/services here, not in `index.ts`.

### MCP Integration

`McpClient` (`infrastructure/adapters/mcpClient.ts`) connects via `StreamableHTTPClientTransport` to an external MCP server (Jira/Trello proxy). It is lazy-connected: `McpService` calls `ensureConnected()` before every operation. The port contract is `IMcpClient` (`application/ports/mcpClient.ts`). Slack commands (`/jira-login`, `/trello-login`, `/extract-jira-tasks`, `/extract-trello-tasks`) are registered in `McpPromptController`.

### Offboarding Domain State Machine

`domain/offboardingProcess/` models the lifecycle of an offboarding as a State pattern:

- `OffboardingProcess` holds a `state: OffboardingProcessState`.
- Concrete states: `NotStartedState`, `InProgressState`, `PendingRevisionState`, `FinishedState` — each returns its `OffboardingStateEnum` value.
- State transitions are wired via `OffboardingOrchestrator` (SA-10), which advances the in-memory process object as it reacts to domain events (`OffboardingStartedEvent`, `InterviewStartedEvent`, `InterviewCompletedEvent`) and inbound Kafka events (`onDossierGenerated`, `onOffboardingCompleted`). The backend, not this in-memory copy, remains the durable source of truth.

### Conventions

- **ESM + barrel files.** `"type": "module"` and every directory exposes a barrel `index.ts` that re-exports its contents (e.g. `infrastructure/index.ts` → `settings`, `settings/index.ts` → `constants` + `appOptions`). Import from the directory, not the deep file.
- **Config flows through `settings/`.** `constants.ts` reads `process.env` (loads dotenv) into `SETTINGS`; `appOptions.ts` builds the Bolt `AppOptions`. Add new env vars here, not by reading `process.env` elsewhere.
- **Strict TypeScript.** `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Optional Slack tokens are spread conditionally (`...(x ? { token: x } : {})`) to satisfy `exactOptionalPropertyTypes` — follow that pattern rather than assigning `undefined`.
- **Private class fields** use `#` syntax (not `private` keyword) — see `McpService`, `McpClient`, `McpPromptController` for the pattern.
