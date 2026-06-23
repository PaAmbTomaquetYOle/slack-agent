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
