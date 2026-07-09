---
name: github-issue
description: >
  Execute a development task starting from a GitHub issue URL. Use this skill whenever the user
  gives a github.com issue link (e.g. "https://github.com/org/repo/issues/42") and asks to
  implement it, resolve it, work on it, or "hazte cargo de este issue" / "implementa esta tarea".
  Also trigger on `/github-issue <url> [optional extra instructions]`. The skill fetches the full
  issue (description, comments, labels) via the gh CLI or the GitHub MCP, cross-references
  Obsidian vault notes for prior context, and then implements the change following this project's
  hexagonal architecture, strict OOP, SOLID principles, and clean code — while checking in with
  the user on every non-trivial technical, architectural, or business-logic decision before acting.
  Do NOT use this for generic coding requests that don't reference a GitHub issue URL.
---

# GitHub Issue Executor

Turn a GitHub issue into a correctly implemented, well-designed change — without silently making
the calls that belong to the user, and without silently discarding what the team already knows.

## 0. Parse the input

The skill receives:
1. **A GitHub issue URL** (required) — format `https://github.com/<owner>/<repo>/issues/<number>`.
2. **An optional free-text prompt** after the URL, with extra detail, constraints, or clarification.

If the optional prompt conflicts with anything in this skill's default behavior (scope, approach,
priorities), **the user's prompt wins**. Treat this skill's instructions as the default behavior,
not as a ceiling on what the user can ask for.

If no valid GitHub issue URL is present in the input, stop and ask the user for one — do not guess
a repo or issue number.

## 1. Fetch the issue

Prefer the `gh` CLI (faster, already authenticated in this environment). Check whether it's
available first, since the user's shell may be bash, PowerShell, or cmd:

- bash: `command -v gh`
- PowerShell: `Get-Command gh -ErrorAction SilentlyContinue`
- cmd: `where gh`

**If `gh` is missing**, don't silently fall back — ask the user (`AskUserQuestion`) whether they
want it installed now. If yes, install it for their platform (e.g. `winget install --id GitHub.cli`
on Windows, `brew install gh` on macOS, the appropriate package manager on Linux), then
`gh auth login` if not already authenticated. If they decline, fall back to the GitHub MCP tools,
and if those aren't connected either, fall back further to `WebFetch` against the issue's public
URL (works for public repos; for private repos you'll need one of the other two paths).

**Primary — `gh` CLI** (same command, just quoted per shell):
```bash
# bash
gh issue view "<url>" --json title,body,comments,labels,assignees,state,milestone,url
```
```powershell
# PowerShell
gh issue view "<url>" --json title,body,comments,labels,assignees,state,milestone,url
```
```cmd
:: cmd
gh issue view "<url>" --json title,body,comments,labels,assignees,state,milestone,url
```

**Fallback 1 — GitHub MCP:**
- `mcp__github__get_issue` for title/body/state/labels/assignees.
- Fetch comments too (issue comments often contain the real requirements, edge cases, or a
  decision the team already made — do not skip them).

**Fallback 2 — WebFetch:**
- Fetch the issue URL directly and parse the rendered page for title, body, and comments. Less
  structured than the other two options, so double-check nothing important got dropped (comments
  in particular can be easy to miss this way).

Pull out and hold onto: title, full description, every comment (in order), labels, assignees,
milestone, and current state. If the issue is already closed, tell the user and ask whether they
still want it implemented (e.g. it might document a decision, not a pending task).

## 2. Check the Obsidian vault for prior context

Before touching any code, search the Obsidian vault for anything relevant to this issue's domain,
feature area, or the entities it touches:

- Use `mcp__obsidian__search-vault` with terms drawn from the issue title/body/labels (e.g. the
  bounded context, the feature name, a component name like "Dossier" or "OffboardingProcess").
- Read any matching notes with `mcp__obsidian__read-note`.

This vault holds decisions and gotchas from previous sessions — architecture rationale, domain
rules clarified by the user, pitfalls already hit. Use it to avoid re-litigating settled decisions
or repeating past mistakes. If the vault contradicts something in the issue, surface that to the
user rather than picking one silently.

**Prefer the [obsidian-skills](https://github.com/kepano/obsidian-skills) plugin skills** (e.g.
`obsidian-cli`, `obsidian-markdown`) over raw `mcp__obsidian__*` calls whenever they're installed —
they encode the vault's conventions (frontmatter, tagging, wikilinks, note structure) better than
ad-hoc MCP calls would. Check the available-skills list for them before falling back to calling
the MCP tools directly. If they aren't installed, ask the user (`AskUserQuestion`) whether they'd
like to install the `obsidian-skills` plugin now; if they decline or it's genuinely unavailable,
proceed with the `mcp__obsidian__*` tools directly as described above.

## 3. Learn the project's actual architecture

Don't assume — verify. Read the relevant `CLAUDE.md` file(s) for the sub-project(s) the issue
touches (`slack-agent/`, `backend/`, `mcp-server/`, or more than one if the issue spans services).
Then look at the actual directory structure and a couple of representative existing files to
confirm the real layering (typically `domain/` → `application/` (`ports/`, `services/`) →
`infrastructure/` (`adapters/`, controllers/routers, composition root)), naming conventions, and
testing setup. Match what you build to what's actually there, not to a generic template.

## 4. Implementation standards — non-negotiable

Every line of code you write for this issue must satisfy all of the following:

**Clean code**
- No code smells: no god classes, no long parameter lists, no deep nesting, no duplicated logic,
  no dead code, no magic values without a named constant.
- No antipatterns: no service-locator-style hidden dependencies, no anemic domain models doing
  nothing but holding data, no leaking infrastructure concerns into domain/application layers.
- Names describe intent, not implementation. Methods and classes stay small and single-purpose.

**Strictly object-oriented — no exceptions**
- Every behavior lives inside a class with a clear responsibility. No bare/loose functions
  floating in a module, no utility grab-bag files, no logic scattered across unrelated files.
- Model concepts as objects (entities, value objects, services, ports/adapters) even where a
  quick script-style function would "work" — that shortcut is exactly what this skill exists to
  prevent.

**SOLID, applied for real, not just cited**
- **S**ingle Responsibility — one reason to change per class.
- **O**pen/Closed — extend behavior via new classes/polymorphism, don't keep editing a growing
  switch/if-chain.
- **L**iskov Substitution — subtypes/implementations must be usable anywhere their
  interface/abstract base is expected, without surprising callers.
- **I**nterface Segregation — define narrow ports (this codebase already does this — follow the
  existing pattern of small, focused interfaces like `IMessagingPort`, `IEventPublisher`), don't
  bolt new unrelated methods onto an existing one.
- **D**ependency Inversion — application/domain code depends on abstractions defined in
  `application/ports` (or `service_interfaces`), never on a concrete adapter. Wire concrete
  implementations only in the composition root (`appFactory.ts` / `composition.py` /
  `server_factory.py`).

**Architecture compliance**
- Respect the inward dependency rule: `infrastructure` → `application` → `domain`, never reversed.
- New capabilities get a port in `application/ports` (or `service_interfaces`) plus an adapter in
  `infrastructure/adapters`, wired in the composition root — mirror how existing features do it.

## 5. Consult the user before deciding — this is the most important rule

You do not have authority to unilaterally settle anything beyond straightforward, obviously-correct
mechanics. Before proceeding, explicitly ask the user whenever you're about to:

- Choose between more than one reasonable **technical approach** (e.g. which library, which data
  structure, sync vs. async, how to model an edge case).
- Make an **architectural** call: introducing a new port/adapter, changing an existing interface,
  deciding which layer something belongs in, introducing a new domain state or event type.
- Resolve **ambiguous or underspecified business logic** — anything the issue or its comments
  don't pin down precisely (validation rules, what happens on a particular edge case, what "done"
  means for this ticket).
- Trade off **scope**: the issue implies more work than seems intended, or less detail than needed
  to implement confidently.

Batch related questions together with `AskUserQuestion` rather than trickling them out one at a
time, but do not proceed past a real fork in the road without asking. Purely mechanical steps
(naming a private helper, formatting, following an existing established pattern exactly) don't
need a check-in — the bar is "would a competent teammate reasonably want a say in this?".

## 6. Use available tools and MCPs when they genuinely help

Don't limit yourself to editing files blind. When it improves the result, use what's connected:
GitHub MCP or `gh` for richer issue/PR context, browser automation to inspect a live UI or
reproduce a bug, web search for library/API specifics, project-memory/graph tools to understand
unfamiliar code faster. Reach for a tool because it makes the implementation more correct or
better-informed — not as a box-ticking exercise.

## 7. Save what you learn back to the Obsidian vault

As you work — and especially once the user clarifies a decision you asked about in step 5 — persist
it so the next session doesn't have to rediscover it. Use the `obsidian-skills` plugin skills if
available (same preference as step 2), otherwise `mcp__obsidian__create-note` for new knowledge or
`mcp__obsidian__edit-note` to extend an existing related note. Worth capturing:

- Architectural or technical decisions and the reasoning the user gave for them.
- Business/domain rules the user clarified that weren't obvious from the issue.
- Gotchas, pitfalls, or non-obvious constraints you hit while implementing.
- Reusable patterns worth applying again in similar future issues.

Tag or title notes so they're findable by domain/feature term next time (matching what you
searched for in step 2). Skip anything trivial or already documented in code/CLAUDE.md — this is
for the tacit knowledge that would otherwise evaporate at the end of the session.

## 8. Workflow summary

1. Parse issue URL (+ optional prompt).
2. Fetch full issue (description + comments + labels) via `gh` CLI or GitHub MCP.
3. Search and read relevant Obsidian vault notes.
4. Read CLAUDE.md + inspect real code to confirm architecture and conventions.
5. Ask the user any technical/architectural/business questions the issue leaves open.
6. Implement, respecting clean code, 100% OOP, SOLID, and the existing hexagonal architecture.
7. Verify: run the relevant sub-project's tests/lints for what you touched.
8. Save new decisions/learnings to the Obsidian vault.
9. Summarize what was implemented and what remains for the user to review — leave git operations
   (branching, committing, pushing) to the user unless they explicitly ask you to handle them.
