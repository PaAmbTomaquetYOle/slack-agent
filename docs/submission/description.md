# BrainTrust — Devpost submission description

> Ready to paste into the Devpost submission form (SUB-4). Source of truth for the project
> pitch; keep in sync with the README/architecture diagram if either changes materially.

## The problem

NGOs run on volunteers, and volunteers turn over fast. Every time someone with months of
tenure leaves, they take undocumented context with them: which Jira tickets are actually
in progress, who to ask about the flaky deploy script, which workaround unblocks the
broken migration. Onboarding the next person means re-discovering all of it from scratch,
usually by interrupting whoever is left. Knowledge loss from turnover isn't a one-time
event — it's a recurring tax on every NGO's ability to operate.

## The solution

**BrainTrust** is a proactive knowledge-capture agent that lives inside Slack. It doesn't
wait for someone to write documentation — it captures institutional knowledge at the
moments it naturally surfaces:

- **Smart offboarding.** When a volunteer announces they're leaving, BrainTrust pulls
  their open Jira/Trello tasks, runs a guided interview with them over Slack, and uses
  Slack AI to summarize the conversation into a *Handover Dossier* the next person can
  actually use.
- **Dynamic SOPs.** BrainTrust watches team channels; when a veteran gives a detailed
  answer to a procedural question, it offers to save that answer as a Standard Operating
  Procedure — using the Real-Time Search API to link it to similar past questions instead
  of creating duplicates.
- **Knowledge graph.** A Neo4j graph maps who talks to whom and which topics each person
  owns, so BrainTrust can recommend the right expert to ask during an incident, before
  that expert also walks out the door.

Under the hood, three services collaborate over Kafka and MCP: a **Slack Agent**
(TypeScript, Slack Bolt) that owns the conversational surface, an **MCP Server** (Python)
that exposes Jira/Trello/search tools plus the LLM dossier writer, and a **Backend**
(Python, FastAPI) that owns process state, persistence, and event orchestration.

## Technologies used

- **Slack AI** — summarizes guided offboarding interviews into structured handover
  dossiers, posted straight into the relevant Slack channel/Canvas.
- **MCP Server** — a Model Context Protocol server exposing Jira/Trello task lookups,
  Slack-workspace search, and the `generate_dossier` tool as callable tools for both the
  Slack Agent and the Backend.
- **Real-Time Search API** — powers duplicate-SOP detection and the "related answers"
  suggestions offered when someone asks a question that's already been solved.

## Impact

- Every offboarding interview produces a durable, structured dossier instead of tribal
  knowledge that leaves with the person.
- Every high-value Slack answer becomes a searchable SOP instead of scrolling history no
  one will ever find again.
- The knowledge graph turns "who do I even ask?" into a lookup instead of a guess —
  directly shortening incident response time for small, volunteer-run teams that can't
  afford a dedicated ops desk.

## Roadmap

1. **Phase 1 · Smart Offboarding (MVP)** — trigger on departure, guided Slack interview,
   Jira/Trello task extraction via MCP, Slack-AI-generated handover dossier.
2. **Phase 2 · Dynamic SOPs** — passive monitoring of expert answers, Real-Time-Search-backed
   deduplication, opt-in SOP capture.
3. **Phase 3 · Knowledge Graph & periodic reviews** — Neo4j expert recommendation, plus
   scheduled monthly/annual knowledge-retention reviews that capture institutional
   knowledge proactively, not only on departure.
