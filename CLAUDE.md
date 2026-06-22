# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision: BrainTrust

A Slack agent that fights knowledge loss caused by high volunteer turnover in NGOs. When a key volunteer leaves, operational knowledge (how to run the food bank, who to contact at city hall) walks out the door. The agent captures and retrieves it. Planned in three phases:

1. **Phase 1 (MVP — Smart Offboarding):** When a volunteer announces departure, an MCP server pulls their open tasks from Jira/Trello. The agent runs a guided interview over Slack to document the state of each item, then Slack AI summarizes it into a "Handover Dossier."
2. **Phase 2 (Dynamic SOPs):** The agent monitors channels where newcomers ask questions. When a veteran gives a detailed answer about a procedure, the agent offers to save it as a Standard Operating Procedure (SOP), using the Real-Time Search API to link it to similar past questions.
3. **Phase 3 (Knowledge Graph backend):** A graph database (e.g. Neo4j) maps who interacts with whom, which documents are shared, and which topics each person dominates. On a crisis the agent recommends experts ("based on 2 years of history, Laura and Carlos are the experts on this — contact them") rather than only searching documents.

The codebase is currently an early scaffold: the hexagonal skeleton and Slack bootstrap exist, but business logic is not yet implemented.

## Commands

```bash
npm run dev      # nodemon + ts-node, watches src/, runs src/index.ts
npm run build    # tsc -> compiles src/ to dist/
npm start        # node dist/index.js (run build first)
```

There is **no test runner yet** — `npm test` is a placeholder that exits 1. There is no linter configured.

The bot runs in **Slack Socket Mode** (`socketMode: true` in `appOptions.ts`), so local dev needs no public URL/tunnel. Requires a `.env` (see `.env.example`) with `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, and optional `PORT` (default 3000).

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

### Conventions

- **ESM + barrel files.** `"type": "module"` and every directory exposes a barrel `index.ts` that re-exports its contents (e.g. `infrastructure/index.ts` → `settings`, `settings/index.ts` → `constants` + `appOptions`). Import from the directory, not the deep file.
- **Entry point** (`src/index.ts`) only wires `APP_OPTIONS` + `SETTINGS` into a Bolt `App` and starts it. Keep wiring here thin; put logic in the layers.
- **Config flows through `settings/`.** `constants.ts` reads `process.env` (loads dotenv) into `SETTINGS`; `appOptions.ts` builds the Bolt `AppOptions`. Add new env vars here, not by reading `process.env` elsewhere.
- **Strict TypeScript.** `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Optional Slack tokens are spread conditionally (`...(x ? { token: x } : {})`) to satisfy `exactOptionalPropertyTypes` — follow that pattern rather than assigning `undefined`.
