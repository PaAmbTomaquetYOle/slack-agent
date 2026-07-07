# slack-agent

Repository for the challenge's Slack Agent — part of **BrainTrust**, a system that fights knowledge loss caused by high volunteer turnover in NGOs.

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

slack-agent and the backend exchange domain events over Kafka following an [AsyncAPI 3.0.0](https://www.asyncapi.com/) contract (BE-9/BE-11). Topics:

- `slack-agent.*` — **produced by slack-agent**, consumed by the backend: `offboarding.triggered`, `interview.started`, `interview.completed`, `dossier.generation_requested`, `sop.creation_requested`.
- `offboarding.*` — **produced by the backend**, consumed by slack-agent: `offboarding.state_changed`, `interview.completed`, `dossier.generated`, `offboarding.completed`, `sop.created`.
- `offboarding.dlq` — dead-letter queue for either direction (malformed envelopes or handler failures).

Every message uses the same JSON envelope: `{ event_id, event_type, occurred_at, payload }` (snake_case, see `src/domain/events/kafkaEventEnvelope.ts`). The Kafka record key is `payload.process_id` when present, otherwise `event_id`. Delivery is at-least-once with manual offset commits.

Note the backend mints `process_id` when it consumes `offboarding.triggered` and owns dossier generation (reads the interview transcript from its DB) — slack-agent's outbound payloads for those two events carry no process_id/content, only what the backend needs to act.

**Staying in sync with the contract:**
- The canonical spec lives at `backend/docs/asyncapi/asyncapi.yml`. A copy is vendored here at [`docs/asyncapi/asyncapi.yml`](docs/asyncapi/asyncapi.yml) for reference — it is not regenerated automatically.
- slack-agent does **not** consume the Modelina-generated TypeScript classes in `backend/docs/asyncapi/generated/ts/` (they're camelCase classes with `export default`, which don't match the snake_case wire format). Instead, payload shapes are hand-written as snake_case interfaces in `src/domain/events/outboundEvents.ts` (published) and `inboundEvents.ts` (consumed).
- When the backend changes the contract: re-copy `asyncapi.yml` into `docs/asyncapi/`, diff it against `outboundEvents.ts`/`inboundEvents.ts`, and update the payload interfaces + the forwarders/handlers in `src/application/events/` to match.
