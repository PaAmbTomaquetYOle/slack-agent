<div align="center">

![Offboard-Me · Slack Agent](https://capsule-render.vercel.app/api?type=waving&color=0:4A154B,50:611f69,100:ECB22E&height=200&section=header&text=Offboard-Me%20%C2%B7%20Slack%20Agent&fontSize=44&fontColor=ffffff&desc=Guided%20offboarding%20interviews%20%26%20SOP%20capture%2C%20right%20inside%20Slack&descSize=17&descAlignY=62&animation=fadeIn)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Slack Bolt](https://img.shields.io/badge/Slack-Bolt%20SDK-4A154B?logo=slack&logoColor=white)](https://slack.dev/bolt-js/)
[![Gemini](https://img.shields.io/badge/LLM-Gemini-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![CI](https://github.com/PaAmbTomaquetYOle/slack-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/PaAmbTomaquetYOle/slack-agent/actions/workflows/ci.yml)

**🔌 [mcp-server](https://github.com/PaAmbTomaquetYOle/mcp-server)** &nbsp;·&nbsp; **🗄️ [backend](https://github.com/PaAmbTomaquetYOle/backend)** &nbsp;·&nbsp; **💬 slack-agent**

</div>

Repository for the challenge's Slack app — part of **OffBoardMe**, a system that fights knowledge loss caused by high volunteer turnover in NGOs.

The live development stack is composed from the separate `infra/` repository. That stack runs the bot together with the backend, MCP server, Kafka, Neo4j, PostgreSQL, and the Cloudflare tunnel for the public `kire.ovh` names.

Deployment note: pushes to `main` now trigger the Slack CLI deploy flow and then the infra redeploy through GitHub Actions.

### 📚 Contents

- [Architecture](#architecture)
- [Kafka event contract (AsyncAPI)](#kafka-event-contract-asyncapi)
- [🗓 Periodic review interviews](#-periodic-review-interviews)
- [🚀 Local development](#-local-development)
- [⚙️ Configuration](#️-configuration)

## Architecture

Three services connected end to end: **slack-agent** (TypeScript · Slack Bolt) ↔ **Kafka** (the only write path, BE-7) ↔ **Backend** (Python · FastAPI) ↔ **Postgres + Neo4j**, with **MCP Server** (Python · FastMCP) as a shared tool/LLM provider (Gemini drives the interview here in slack-agent; Claude/Anthropic writes the dossier in mcp-server's `generate_dossier`), plus the external APIs (Jira, Trello, Slack Real-Time Search). Phase badges ①②③ trace the data flow of each delivery phase.

![OffBoardMe architecture diagram](docs/architecture/architecture.png)

> Full write-up: [`docs/architecture/README.md`](docs/architecture/README.md) · Source: [`docs/architecture/architecture.d2`](docs/architecture/architecture.d2) · Vector: [`architecture.svg`](docs/architecture/architecture.svg)

### Phases

- **① Phase 1 · Smart Offboarding (MVP):** when an employee announces departure, the MCP Server pulls their open tasks from Jira/Trello, the agent runs a guided interview over Slack driven by **Gemini**, and the backend generates a *Handover Dossier* by calling mcp-server's `generate_dossier` tool (**Claude/Anthropic** — the LLM lives in mcp-server, not the backend).
- **② Phase 2 · Dynamic SOPs:** the agent monitors channels; when a veteran answers a procedure question it offers to save a Standard Operating Procedure, using the Real-Time Search API (via mcp-server) to link similar past questions.
- **③ Phase 3 · Knowledge Graph:** Neo4j (with the GDS plugin) maps who interacts with whom and which topics each person dominates — live today — so the agent can recommend experts during a crisis.

### Regenerate the diagram

The diagram is authored in [D2](https://d2lang.com/). Logos are fetched from Iconify at render time.

```bash
d2 --theme 0 --pad 40 docs/architecture/architecture.d2 docs/architecture/architecture.svg   # vector
d2 --theme 0 --pad 40 --scale 2 docs/architecture/architecture.d2 docs/architecture/architecture.png   # raster
```

## Kafka event contract (AsyncAPI)

slack-agent and the backend exchange domain events over Kafka following an [AsyncAPI 3.0.0](https://www.asyncapi.com/) contract (BE-9/BE-11, BE-7). **BE-7 made the backend's REST surface read-only** — every write (offboarding state, interview turns, dossier creation, cancellation) now goes out as a Kafka command/event; slack-agent's HTTP adapters (`http*Repository.ts`) keep only their read methods, used for `OffboardingOrchestrator.recover()` and active-process lookups. Topics:

- `slack-agent.*` — **produced by slack-agent**, consumed by the backend: `offboarding.triggered`, `offboarding.cancellation_requested` (BE-7, replaces the old `PATCH .../cancel`), `interview.started`, `interview.turn_recorded` (SA-16, per-turn), `interview.completed`, `tasks.extracted` (SA-18), `dossier.generation_requested`, `sop.creation_requested`, `sop.candidate_offered` (SA-16), `sop.candidate_decided` (SA-16), plus SA-20's `monthly_review.*`/`annual_review.*` equivalents (`triggered`, `cancellation_requested`, `interview_completed`, `dossier_generation_requested`) — see below.
- `offboarding.*` — **produced by the backend**, consumed by slack-agent: `offboarding.state_changed`, `interview.completed`, `dossier.generated`, `offboarding.completed`, `sop.created`, plus `monthly_review.state_changed`/`monthly_review.completed`/`annual_review.state_changed`/`annual_review.completed` (SA-20).
- `offboarding.dlq` — dead-letter queue for either direction (malformed envelopes or handler failures).

Every message uses the same JSON envelope: `{ event_id, event_type, occurred_at, payload }` (snake_case, see `src/domain/events/kafkaEventEnvelope.ts`). The Kafka record key is `payload.process_id` when present, otherwise `event_id`. Delivery is at-least-once with manual offset commits. The local Compose broker uses plaintext by default; set `KAFKA_SASL_USERNAME` and `KAFKA_SASL_PASSWORD` to enable **SASL_SSL / SCRAM-SHA-512** for secured brokers.

`InterviewService` keeps each in-flight conversation in an in-memory `IInterviewSessionStore`, but (SA-16) every appended turn is also published as `interview.turn_recorded` so the backend persists it incrementally into its own `interview_turns` table; `interview.completed` still carries every turn as a full-set reconciliation backstop. On restart, `InterviewService` rehydrates the in-memory session from the backend's interview read model (`GET /offboarding/{id}/interview`) instead of losing in-flight turns. Similarly, `SopService` persists each SOP candidate offer/decision to the backend (a new `SopCandidate` aggregate) via `sop.candidate_offered`/`sop.candidate_decided`, and rehydrates candidates still awaiting a decision from `GET /sop-candidates` on startup — so an author's Yes/No click still resolves after a restart.

`OffboardingProcess` models the departing employee's pending Jira/Trello tasks as a real `Task` value object (SA-18, replacing an earlier `never[]` placeholder). `GeminiInterviewAgent` parses the structured JSON `get_pending_jira_issues`/`get_pending_trello_cards` MCP tool results into `Task[]`; `InterviewService` publishes them as `tasks.extracted`, and the backend persists them into its own `offboarding_tasks` table, exposed read-only at `GET /offboarding/{id}/tasks`. `OffboardingOrchestrator` rehydrates them onto its tracked process both live (subscribing to `TasksExtractedEvent`) and on restart (via `recover()`/`#rehydrate`, mirroring the interview rehydration above).

Note the backend mints `process_id` when it consumes `offboarding.triggered` and owns dossier generation (reads the interview transcript from its DB) — slack-agent's outbound payloads for those two events carry no process_id/content, only what the backend needs to act.

**Staying in sync with the contract:**
- The canonical spec lives at `backend/docs/asyncapi/asyncapi.yml`. A copy is vendored here at [`docs/asyncapi/asyncapi.yml`](docs/asyncapi/asyncapi.yml) for reference — it is not regenerated automatically.
- slack-agent does **not** consume the Modelina-generated TypeScript classes in `backend/docs/asyncapi/generated/ts/` (they're camelCase classes with `export default`, which don't match the snake_case wire format). Instead, payload shapes are hand-written as snake_case interfaces in `src/domain/events/outboundEvents.ts` (published) and `inboundEvents.ts` (consumed).
- When the backend changes the contract: re-copy `asyncapi.yml` into `docs/asyncapi/`, diff it against `outboundEvents.ts`/`inboundEvents.ts`, and update the payload interfaces + the forwarders/handlers in `src/application/events/` to match.

## 🗓 Periodic review interviews

SA-20: alongside offboarding (triggered by a user in Slack), the backend automatically starts `MonthlyReviewProcess`/`AnnualReviewProcess` instances on a schedule (BE-24) — a lightweight monthly check-in on recent work, and an exhaustive annual knowledge-retention review. slack-agent runs the guided interview for these exactly like it does for offboarding, but through a **parallel, simpler stack** (`ReviewInterviewService`/`GeminiReviewInterviewAgent`), not a generalization of `OffboardingOrchestrator`/`InterviewService`:

- **No HTTP read model.** Unlike offboarding, the backend exposes no REST endpoint for review processes (BE-23 kept them Kafka-only) — there is nothing to poll to answer "does this employee have an active review?" `IActiveReviewStore` (in-memory, `InMemoryActiveReviewStore`) tracks it instead, populated when `{monthly,annual}_review.state_changed` reaches `in_progress`. **Known limitation:** this does not survive a restart — a future issue could add a backend read endpoint to support rehydration, mirroring `OffboardingOrchestrator.recover()`.
- **No nudge/abandon.** These processes aren't time-critical departures; `DirectMessageController` just forwards every DM to both `OffboardingOrchestrator.handleInterviewMessage` and `ReviewInterviewService.handleIncomingDirectMessage` — each is a safe no-op when it has nothing tracked for the sender.
- **No Jira/Trello task extraction.** `GeminiReviewInterviewAgent` calls no MCP tools; it reuses `INTERVIEW_TOPICS`' vocabulary but scopes which ones apply per review type (`reviewTopicsFor`): monthly asks about `current_projects` only, annual asks about all five — see `src/domain/interview/reviewInterviewTopics.ts`.
- **Own wire events**, not shared with offboarding's (BE-23): `{monthly,annual}_review.triggered`/`cancellation_requested`/`interview_completed`/`dossier_generation_requested` inbound (`slack-agent.*`), `{monthly,annual}_review.state_changed`/`completed` outbound (`offboarding.*`). `ReviewInterviewCompletedEvent`/`ReviewDossierGenerationRequestedEvent` are single local event classes carrying a `reviewScope: 'monthly' | 'annual'` field — their Kafka forwarders pick the wire event type from it, so one subscription covers both scopes.

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

In the shared dev deployment, the public services currently resolve to:

- `https://braintrust-api.kire.ovh`
- `https://braintrust-mcp.kire.ovh`
- `https://braintrust-kafka.kire.ovh`
- `https://braintrust-neo4j.kire.ovh`

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
| `KAFKA_*` | Broker, topic prefixes, consumer group, DLQ topic — see the event contract above. Leave `KAFKA_SASL_USERNAME`/`KAFKA_SASL_PASSWORD` empty for local plaintext Kafka; set both plus optional `KAFKA_SSL_CA` for SASL_SSL brokers. |

---

<div align="center">

Part of **OffBoardMe** — fighting knowledge loss from volunteer turnover in NGOs.

[mcp-server](https://github.com/PaAmbTomaquetYOle/mcp-server) &nbsp;·&nbsp; [backend](https://github.com/PaAmbTomaquetYOle/backend) &nbsp;·&nbsp; MIT © [Pa Amb Tomàquet Y Olé](LICENSE)

</div>
