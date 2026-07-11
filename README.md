<div align="center">

![BrainTrust · Slack Agent](https://capsule-render.vercel.app/api?type=waving&color=0:4A154B,50:611f69,100:ECB22E&height=200&section=header&text=BrainTrust%20%C2%B7%20Slack%20Agent&fontSize=44&fontColor=ffffff&desc=Guided%20offboarding%20interviews%20%26%20SOP%20capture%2C%20right%20inside%20Slack&descSize=17&descAlignY=62&animation=fadeIn)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Slack Bolt](https://img.shields.io/badge/Slack-Bolt%20SDK-4A154B?logo=slack&logoColor=white)](https://slack.dev/bolt-js/)
[![Gemini](https://img.shields.io/badge/LLM-Gemini-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![CI](https://github.com/PaAmbTomaquetYOle/slack-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/PaAmbTomaquetYOle/slack-agent/actions/workflows/ci.yml)

**🔌 [mcp-server](https://github.com/PaAmbTomaquetYOle/mcp-server)** &nbsp;·&nbsp; **🗄️ [backend](https://github.com/PaAmbTomaquetYOle/backend)** &nbsp;·&nbsp; **💬 slack-agent**

</div>

Repository for the challenge's Slack Agent — part of **BrainTrust**, a system that fights knowledge loss caused by high volunteer turnover in NGOs.

### 📚 Contents

- [Architecture](#architecture)
- [Kafka event contract (AsyncAPI)](#kafka-event-contract-asyncapi)
- [🚀 Local development](#-local-development)
- [⚙️ Configuration](#️-configuration)

## Architecture

Three services connected end to end: **slack-agent** (TypeScript · Slack Bolt) ↔ **MCP Server** (Python · MCP SDK) ↔ **Backend** (Python · FastAPI) ↔ **Postgres + Neo4j**, plus the external APIs (Jira, Trello, Slack AI, Real-Time Search). Phase badges ①②③ trace the data flow of each delivery phase.

![BrainTrust architecture diagram](docs/architecture/architecture.png)

> Source: [`docs/architecture/architecture.d2`](docs/architecture/architecture.d2) · Vector: [`architecture.svg`](docs/architecture/architecture.svg)

### Phases

- **① Phase 1 · Smart Offboarding (MVP):** when a volunteer announces departure, the MCP Server pulls their open tasks from Jira/Trello, the agent runs a guided interview over Slack, and Slack AI summarizes it into a *Handover Dossier* (stored in Postgres).
- **② Phase 2 · Dynamic SOPs:** the agent monitors channels; when a veteran answers a procedure question it offers to save a Standard Operating Procedure, using the Real-Time Search API to link similar past questions.
- **③ Phase 3 · Knowledge Graph:** Neo4j maps who interacts with whom and which topics each person dominates, so the agent can recommend experts during a crisis.

### Regenerate the diagram

The diagram is authored in [D2](https://d2lang.com/). Logos are fetched from Iconify at render time.

```bash
d2 --theme 0 --pad 40 docs/architecture/architecture.d2 docs/architecture/architecture.svg   # vector
d2 --theme 0 --pad 40 --scale 2 docs/architecture/architecture.d2 docs/architecture/architecture.png   # raster
```

## Kafka event contract (AsyncAPI)

slack-agent and the backend exchange domain events over Kafka following an [AsyncAPI 3.0.0](https://www.asyncapi.com/) contract (BE-9/BE-11, BE-7). **BE-7 made the backend's REST surface read-only** — every write (offboarding state, interview turns, dossier creation, cancellation) now goes out as a Kafka command/event; slack-agent's HTTP adapters (`http*Repository.ts`) keep only their read methods, used for `OffboardingOrchestrator.recover()` and active-process lookups. Topics:

- `slack-agent.*` — **produced by slack-agent**, consumed by the backend: `offboarding.triggered`, `offboarding.cancellation_requested` (BE-7, replaces the old `PATCH .../cancel`), `interview.started`, `interview.turn_recorded` (SA-16, per-turn), `interview.completed`, `tasks.extracted` (SA-18), `dossier.generation_requested`, `sop.creation_requested`, `sop.candidate_offered` (SA-16), `sop.candidate_decided` (SA-16).
- `offboarding.*` — **produced by the backend**, consumed by slack-agent: `offboarding.state_changed`, `interview.completed`, `dossier.generated`, `offboarding.completed`, `sop.created`.
- `offboarding.dlq` — dead-letter queue for either direction (malformed envelopes or handler failures).

Every message uses the same JSON envelope: `{ event_id, event_type, occurred_at, payload }` (snake_case, see `src/domain/events/kafkaEventEnvelope.ts`). The Kafka record key is `payload.process_id` when present, otherwise `event_id`. Delivery is at-least-once with manual offset commits. The broker requires **SASL_SSL / SCRAM-SHA-512** (BE-7) — see `KAFKA_SASL_*`/`KAFKA_SSL_CA` below.

`InterviewService` keeps each in-flight conversation in an in-memory `IInterviewSessionStore`, but (SA-16) every appended turn is also published as `interview.turn_recorded` so the backend persists it incrementally into its own `interview_turns` table; `interview.completed` still carries every turn as a full-set reconciliation backstop. On restart, `InterviewService` rehydrates the in-memory session from the backend's interview read model (`GET /offboarding/{id}/interview`) instead of losing in-flight turns. Similarly, `SopService` persists each SOP candidate offer/decision to the backend (a new `SopCandidate` aggregate) via `sop.candidate_offered`/`sop.candidate_decided`, and rehydrates candidates still awaiting a decision from `GET /sop-candidates` on startup — so an author's Yes/No click still resolves after a restart.

`OffboardingProcess` models the departing employee's pending Jira/Trello tasks as a real `Task` value object (SA-18, replacing an earlier `never[]` placeholder). `GeminiInterviewAgent` parses the structured JSON `get_pending_jira_issues`/`get_pending_trello_cards` MCP tool results into `Task[]`; `InterviewService` publishes them as `tasks.extracted`, and the backend persists them into its own `offboarding_tasks` table, exposed read-only at `GET /offboarding/{id}/tasks`. `OffboardingOrchestrator` rehydrates them onto its tracked process both live (subscribing to `TasksExtractedEvent`) and on restart (via `recover()`/`#rehydrate`, mirroring the interview rehydration above).

Note the backend mints `process_id` when it consumes `offboarding.triggered` and owns dossier generation (reads the interview transcript from its DB) — slack-agent's outbound payloads for those two events carry no process_id/content, only what the backend needs to act.

**Staying in sync with the contract:**
- The canonical spec lives at `backend/docs/asyncapi/asyncapi.yml`. A copy is vendored here at [`docs/asyncapi/asyncapi.yml`](docs/asyncapi/asyncapi.yml) for reference — it is not regenerated automatically.
- slack-agent does **not** consume the Modelina-generated TypeScript classes in `backend/docs/asyncapi/generated/ts/` (they're camelCase classes with `export default`, which don't match the snake_case wire format). Instead, payload shapes are hand-written as snake_case interfaces in `src/domain/events/outboundEvents.ts` (published) and `inboundEvents.ts` (consumed).
- When the backend changes the contract: re-copy `asyncapi.yml` into `docs/asyncapi/`, diff it against `outboundEvents.ts`/`inboundEvents.ts`, and update the payload interfaces + the forwarders/handlers in `src/application/events/` to match.

## 🚀 Local development

```bash
npm install
cp .env.example .env   # fill in SLACK_*, MCP_SERVER_URL, BACKEND_API_URL, BACKEND_CLIENT_ID/SECRET, GEMINI_API_KEY, ...

npm run dev             # watch mode (nodemon + ts-node)
npm run build            # tsc -> dist/
npm test                 # vitest run
npm run test:coverage    # vitest run --coverage
```

The bot needs `mcp-server` reachable at `MCP_SERVER_URL` (for the guided interview's tool calls and question suggestions) and `backend` reachable at `BACKEND_API_URL`. Leave `KAFKA_BROKERS` empty to run without Kafka — publishing falls back to a no-op and no consumer starts.

## ⚙️ Configuration

All settings are documented, with defaults and setup notes, in [`.env.example`](.env.example). Highlights:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Required for the guided offboarding interview (`GeminiInterviewAgent`). |
| `MCP_SERVER_URL` | mcp-server's streamable-HTTP endpoint — this repo uses its Jira/Trello/Slack-auth, `search_slack_workspace` and `test_search_query` tools (dossier generation itself is called by backend, not here). |
| `SOP_MONITORED_CHANNELS` / `SOP_MIN_MESSAGE_LENGTH` / `SOP_KEYWORDS` / `SOP_MIN_REACTIONS` | SA-7 — expert-answer detection thresholds for offering to save a message as an SOP. |
| `QUESTION_SUGGESTION_MONITORED_CHANNELS` / `QUESTION_MIN_MESSAGE_LENGTH` / `QUESTION_MAX_SUGGESTIONS` | SA-8 — question detection + how many related SOPs to suggest via `test_search_query`. |
| `DOSSIER_MANAGERS_CHANNEL_ID` | Channel where the generated handover dossier is posted / Canvas is created. |
| `BACKEND_CLIENT_ID` / `BACKEND_CLIENT_SECRET` | Client-credentials used by `BackendTokenProvider` to fetch a Bearer token from `POST {BACKEND_API_URL}/auth/token` (BE-7) — slack-agent no longer self-signs its JWT. |
| `KAFKA_*` | Broker, topic prefixes, consumer group, DLQ topic — see the event contract above. `KAFKA_SASL_MECHANISM`/`KAFKA_SASL_USERNAME`/`KAFKA_SASL_PASSWORD`/`KAFKA_SSL_CA` configure the SASL_SSL connection the broker now requires (BE-7). |

---

<div align="center">

Part of **BrainTrust** — fighting knowledge loss from volunteer turnover in NGOs.

[mcp-server](https://github.com/PaAmbTomaquetYOle/mcp-server) &nbsp;·&nbsp; [backend](https://github.com/PaAmbTomaquetYOle/backend) &nbsp;·&nbsp; MIT © [Pa Amb Tomàquet Y Olé](LICENSE)

</div>
