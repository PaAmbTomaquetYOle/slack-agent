# slack-agent — Architecture

Part of **BrainTrust**, a system that fights knowledge loss caused by high employee turnover. This document is the canonical architecture reference for `slack-agent`; it consolidates what's spread across the repo's `README.md`/`CLAUDE.md` and cross-references `backend`'s and `mcp-server`'s own `docs/architecture/`.

## System diagram

![BrainTrust system architecture diagram](architecture.png)

> Source: [`architecture.d2`](architecture.d2) · Vector: [`architecture.svg`](architecture.svg)

Three services connected end to end: **slack-agent** (TypeScript · Slack Bolt) ↔ **Kafka** (the only write path) ↔ **Backend** (Python · FastAPI) ↔ **Postgres + Neo4j**, with **MCP Server** (Python · FastMCP) as a shared tool/LLM provider both slack-agent and backend talk to, plus external APIs (Jira, Trello, Gemini, Slack Real-Time Search). Phase badges ①②③ trace the delivery-phase flow; dashed edges are read-only or scheduled, not phase-gated.

### Phases

- **① Phase 1 · Smart Offboarding (MVP):** when an employee announces departure, mcp-server pulls their open tasks from Jira/Trello, slack-agent runs a guided interview over Slack driven by **Gemini**, and the backend generates a *Handover Dossier* by calling mcp-server's `generate_dossier` tool (which runs **Claude/Anthropic** — the LLM lives in mcp-server, not the backend).
- **② Phase 2 · Dynamic SOPs:** slack-agent monitors channels; when a veteran answers a procedure question it offers to save a Standard Operating Procedure, using the Slack Real-Time Search API (via mcp-server) to link similar past questions. mcp-server also reactively refreshes its SOP cache from backend's `sop.*` events.
- **③ Phase 3 · Knowledge Graph:** Neo4j (with the GDS plugin) maps who interacts with whom and which topics each person dominates — live today, not a future placeholder — so the agent can recommend experts during a crisis, backed by Louvain community detection, weighted PageRank, and betweenness/broker scoring.

### Regenerate the diagram

Authored in [D2](https://d2lang.com/); logos are fetched from Iconify at render time.

```bash
d2 --theme 0 --pad 40 architecture.d2 architecture.svg          # vector
d2 --theme 0 --pad 40 --scale 2 architecture.d2 architecture.png  # raster
```

> **Known issue:** as of d2 v0.7.1, `--pad`/PNG export needs Playwright's headless-browser driver, and the driver's default CDN (`playwright.azureedge.net` and its mirrors) currently 404s on the pinned version — PNG export fails with `failed to install Playwright: could not install driver`. Workaround: render the SVG with the command above, then rasterize it directly (icons are embedded as base64 data URIs in the SVG, so no network access is needed):
> ```bash
> npx -y @resvg/resvg-js-cli architecture.svg architecture.png
> ```

## Hexagonal layers (Ports & Adapters)

Three layers under `src/`, with a strict inward dependency rule — never violate it:

- **`domain/`** — Pure business logic (entities, value objects, domain errors). Zero external dependencies. Rule of thumb: swapping Slack for MS Teams must not touch this folder.
- **`application/`** — Use cases and the interfaces that bound them. May import `domain/` only — never `infrastructure/`.
  - `ports/` — Boundary interfaces (inbound/driving — the API controllers call; outbound/driven — what the app needs from adapters/repositories).
  - `serviceInterfaces/` — Contracts each application service implements (dependency inversion).
  - `services/` — Use case implementations orchestrating domain entities through ports.
- **`infrastructure/`** — The only layer allowed to import external SDKs, DB drivers, frameworks.
  - `controllers/` — Primary adapters: Slack event/command/interaction handlers via `@slack/bolt`.
  - `adapters/` — Secondary adapters wrapping external APIs/SDKs (Jira/Trello, Gemini, MCP client, Kafka, HTTP-to-backend).
  - `repositories/` — Persistence adapters implementing application repository ports.
  - `settings/` — Env config and framework setup.

`infrastructure/appFactory.ts` is the composition root: instantiates adapters, injects them into services, injects services into controllers, registers controllers against the Bolt `App`. `src/index.ts` only calls `new AppFactory().createApp()`.

### Offboarding domain state machine

`domain/offboardingProcess/` models the lifecycle as a State pattern (`NotStartedState` → `InProgressState` → `PendingRevisionState` → `FinishedState`). `OffboardingOrchestrator` (SA-10) advances the in-memory process as it reacts to domain events and inbound Kafka events — the backend, not this in-memory copy, remains the durable source of truth.

### MCP integration

`McpClient` connects via `StreamableHTTPClientTransport` to mcp-server (Jira/Trello proxy + search). Lazy-connected: `McpService` calls `ensureConnected()` before every operation. Slack commands (`/jira-login`, `/trello-login`, `/extract-jira-tasks`, `/extract-trello-tasks`) live in `McpPromptController`.

## Kafka is the only write path (BE-7)

The backend's REST surface is **read-only** — every write (offboarding trigger/cancel, interview turns, dossier generation, SOP creation) goes out as a Kafka command/event. `httpOffboardingProcessRepository.ts`, `httpInterviewRepository.ts`, `httpDossierRepository.ts` keep only their read methods, used for `OffboardingOrchestrator.recover()` and active-process lookups.

- **`slack-agent.*`** (produced by slack-agent, consumed by backend): `offboarding.triggered`, `offboarding.cancellation_requested`, `interview.started`, `interview.turn_recorded` (SA-16, per-turn), `interview.completed`, `tasks.extracted` (SA-18), `dossier.generation_requested`, `sop.creation_requested`, `sop.candidate_offered`/`sop.candidate_decided` (SA-16), plus SA-20's `{monthly,annual}_review.*` equivalents.
- **`offboarding.*`** (produced by backend, consumed by slack-agent): `offboarding.state_changed`, `interview.completed`, `dossier.generated`, `offboarding.completed`, `sop.created`, plus `{monthly,annual}_review.state_changed`/`completed` (SA-20).
- **`offboarding.dlq`** — dead-letter queue for either direction.

Envelope: `{ event_id, event_type, occurred_at, payload }` (snake_case). Kafka record key = `payload.process_id` when present, else `event_id`. At-least-once delivery, manual offset commits. Broker requires **SASL_SSL / SCRAM-SHA-512**.

The canonical contract is `backend/docs/asyncapi/asyncapi.yml` (AsyncAPI 3.0.0) — **if this doc and the spec ever disagree, the spec wins**. A vendored copy lives at `slack-agent/docs/asyncapi/asyncapi.yml` for reference only.

### Incremental persistence and rehydration (SA-16 / SA-18)

`InterviewService` keeps the live conversation in `IInterviewSessionStore` but crosses to Kafka at `interview.started`, on every turn (`interview.turn_recorded`), and at `interview.completed` (full-set reconciliation backstop). On restart it rehydrates from the backend's interview read model instead of losing in-flight turns. `SopService` mirrors this for SOP candidate offers/decisions, rehydrating from `GET /sop-candidates`. `OffboardingProcess` models pending Jira/Trello tasks as a real `Task` value object (SA-18); `OffboardingOrchestrator` rehydrates them live and on restart.

### Periodic reviews (SA-20)

Backend automatically starts `MonthlyReviewProcess`/`AnnualReviewProcess` on a schedule (BE-24). slack-agent runs the same guided-interview UX through a **parallel, simpler stack** (`ReviewInterviewService`/`GeminiReviewInterviewAgent`), not a generalization of the offboarding stack — no HTTP read model (in-memory `IActiveReviewStore` only, doesn't survive a restart), no nudge/abandon, no task extraction, own wire events (`{monthly,annual}_review.*`).

## Auth

`BackendTokenProvider` exchanges `BACKEND_CLIENT_ID`/`BACKEND_CLIENT_SECRET` for a Bearer token via `POST {BACKEND_API_URL}/auth/token` (client-credentials grant), caching and refreshing it — slack-agent no longer self-signs its JWT.

## Related

- [`backend/docs/architecture/`](../../../backend/docs/architecture/) — backend component diagram + doc.
- [`mcp-server/docs/architecture/`](../../../mcp-server/docs/architecture/) — mcp-server component diagram + doc.
- [`slack-agent/README.md`](../../README.md) — day-to-day dev commands, env config, full Kafka contract detail.
