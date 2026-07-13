# OffBoardMe — demo video script (SUB-2)

> Timed shot list + narration for the < 3 minute Devpost demo video (SUB-2, #16).
> Everything here is prepared so recording is just: open the Slack sandbox
> (SUB-3), follow the beats below, screen-record with narration, upload to
> YouTube/Vimeo/Loom. SA-10 (agent orchestration) is done — the flow below
> works end to end today.

## Before recording

- Have two Slack accounts/windows visible: the **manager** (triggers
  offboarding) and the **departing employee** (answers the interview DM).
- Have a Jira or Trello board with 1-2 open tasks assigned to the departing
  employee's account, so task extraction has something real to show.
- Pre-open the channel where the handover dossier will be posted
  (`DOSSIER_MANAGERS_CHANNEL_ID`) in a third window/tab, ready to cut to.
- Recommended tool: Loom (built-in webcam bubble + one-click Slack/YouTube
  export) or OBS if you want more control over cuts.

## Shot list (target: 2:40, leaves margin under the 3:00 cap)

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | Title card / architecture diagram (`docs/architecture/architecture.png`) | "This is OffBoardMe — an agent that fights knowledge loss from volunteer turnover in NGOs, by capturing what people know before they leave, not after." |
| 0:15–0:35 | Manager's Slack window, run `/offboarding` | "When a volunteer announces they're leaving, a manager triggers offboarding right from Slack with a single command." |
| 0:35–0:45 | Cut to departing employee's DM — bot's opening message arrives | "The agent immediately opens a guided handover interview over DM with the departing person." |
| 0:45–1:20 | Scroll through 2-3 interview turns — bot asking about current projects / key contacts, employee replying naturally | "This isn't a form — it's a real conversation. Slack AI asks open, empathetic questions and follows up on incomplete answers, one topic at a time." |
| 1:20–1:45 | Cut to the moment the agent mentions pending tasks / show the Jira board briefly | "Behind the scenes, the agent calls out to the MCP Server — a Model Context Protocol server — which pulls the employee's open Jira and Trello tasks so nothing falls through the cracks." |
| 1:45–2:05 | Interview reaches its closing message ("that covers everything, thanks!") | "Once every topic is covered, the interview wraps itself up automatically." |
| 2:05–2:25 | Cut to the managers' channel — the generated Handover Dossier message / Canvas appears | "Slack AI then generates a structured Handover Dossier — responsibilities, contacts, pending tasks, and key knowledge areas — and posts it straight to the team." |
| 2:25–2:40 | Back to architecture diagram, phase badges ①②③ | "That's phase one, live today. Phase two turns great answers in any channel into searchable SOPs using the Real-Time Search API. Phase three maps who knows what in a knowledge graph, so the right expert is one recommendation away — even under pressure." |

## Required technology callouts (must be visible/audible)

- **Slack AI** — narrated at 0:45–1:20 (guided interview) and 2:05–2:25 (dossier generation).
- **MCP Server** — narrated at 1:20–1:45 (Jira/Trello task extraction).
- **Real-Time Search API** — narrated at 2:25–2:40 (phase 2 roadmap mention); if Phase 2 (SOP capture) is live in the sandbox by recording time, prefer showing it live instead of just mentioning it — swap in a real SOP-offer screenshot for extra credibility.

## Compliance checklist (AC from #16)

- [ ] Total runtime < 3:00
- [ ] Shows the full MVP flow live in Slack (not slides only)
- [ ] All 3 technologies named above are shown or narrated
- [ ] Uploaded to YouTube, Vimeo, or Loom (accessible link, not download-only)
- [ ] No copyrighted music or third-party trademarks in the recording
- [ ] Clear narration throughout — a judge with the video muted should still
      follow along from on-screen text/UI, but audio should carry the "why"
