# Upstream port plan: t3code, mausCode, and opencode into BetterShape

Status: deep plan, revision 6. Supersedes revision 5. This revision renumbers every dossier into one merge chain, adds thirteen dossiers (permission floor, secrets vault, plugin host, session portability, run records, context assembly, critics, research, memory, skills, import, CI loop, and release engineering), rewrites D33 so remote backends are plugins that move sessions, and resolves all 45 mausCode roadmap steps in `engineering/mauscode-roadmap-map.md`. All 33 dossiers are issue-ready with a base branch, labels, dependencies, and a copy-paste prompt.
Date: 2026-10-17.
Scope: plan only. No implementation is included in this branch.

Upstream pins:

| repo | commit | date | license |
|---|---|---|---|
| `pingdotgg/t3code` | `db5919d87daffd2d2db16e72602a586feb002adb` | 2026-10-17 | MIT |
| `maus-inc/mausCode` (1Code v0.0.72) | `9f1bc76fa4372c18c565b5a4f8daf38ae3595f0e` | 2026-02-24 | Apache-2.0 |
| `anomalyco/opencode` | `8c173a8f3805d8e749d44311054b07e37a1b2ce1` | 2026-10-17 | MIT |
| BetterShape base | `289b1344838fb5eea700505483125774ce6649be` | 2026-10-15 | BUSL-1.1 |

---

## 1. Executive summary

BetterShape is a Tauri desktop agent workbench: 1,783 tracked files, 762 indexed source files (176,795 lines including 106 test files), 268 Tauri commands, 64 palette commands, and roughly 60 agent tools. It has a strong single-conversation experience, a real git surface, checkpoints, subagents, skills, plugins, MCP as a client, and a design preview pipeline.

t3code is a TypeScript monorepo (5,444 indexed source files, 1,597,450 lines, 41 percent of them tests) built around an event-sourced orchestration core. It has the deepest **lifecycle** layer of any of the three: thread settlement, queue control, provider rollback, worktree cleanup, usage accounting, keybinding semantics, PR stacks, and an MCP server that lets an agent drive the app.

mausCode is an Electron app (506 source files, 152,788 lines, zero tests) built on a remote backend. Its useful surface is UI patterns, the kanban board, and a handful of self-contained utilities (command namespacing, Whisper transcription, port scanning).

The plan finds **33 dossiers** totaling **531.5 person-days** (about 638 working days, or roughly 29 months solo with a 20 percent integration overhead). That is the honest full number for everything the three upstreams and the mausCode roadmap contain that is worth porting. The staged path in section 8 delivers a usable product long before that.

The shape of the plan changed this revision. It is no longer a set of feature waves; it is one chain of pull requests against `draft/mega-absorb-all`, numbered in merge order. Safety lands before autonomy: the permission floor (D03) and the secrets vault (D04) are mausCode's two critical gates, and they come before the plugin host (D05) and before any remote execution. Portability lands before transports: D06 defines the session bundle, the loopback API, and the move contract that D33's plugins drive.

Three structural decisions carried most of the work:

1. **A plugin system is a deliverable, not a hook API.** D05 defines a manifest, declared capabilities, per-capability grants, three runtimes (declarative, sidecar, WASM later), one sequenced event bus, bounded hooks, and a conformance suite. opencode v2 is the shape reference; BetterShape's closed 268-command surface is the reason it cannot be an in-process module loader.
2. **Remote execution is a plugin that moves sessions.** D33 no longer builds a `Runner` into the tool layer. A transport is a `remote.transport` capability; first-party transports ship as `builtin` manifests; the session moves as a D06 bundle and the desktop reattaches to a session host on the target. t3code's remote runner is the closest prior art, and it is a project runner, not a portable session.
3. **The mausCode roadmap is fully resolved.** `engineering/mauscode-roadmap-map.md` maps all 45 steps: 18 port, 9 build, 12 extend, 3 already shipped, 3 not applicable. Nine of the builds become dossiers here (run records, permission floor, secrets, plugin host, portability, context, memory, import, CI loop); the rest land as rows in dossiers that already had the surface.

Five best bets, in order of value per day:

1. **Prompt stash and queue control** (D09, 11 days). Small, visible, and now backed by real run records.
2. **Thread lifecycle: settle, snooze, find** (D10, 14 days). The sidebar becomes a working set.
3. **Rewind that is honest** (D15, 17 days). The current checkpoint model is storage-heavy and provider-blind; fixing it prevents data loss.
4. **Usage accounting** (D11, 17 days). The `cost` field exists and is hardcoded to zero; the ledger makes budgets possible.
5. **The plugin host** (D05, 26 days). It is the largest structural bet, and it is what makes the remote work a plugin rather than a fork of the tool layer.

Three things not to do:

1. **Do not port the Effect-based orchestration core.** The value is in its semantics, not its runtime. Translating 164 orchestration-v2 files into Rust would consume the budget and produce an unfamiliar system.
2. **Do not port six source-control hosts or nine provider packages.** Ship GitHub and the HTTP provider path BetterShape already has.
3. **Do not port telemetry, cloud relay, subscription auth, or Electron/tRPC plumbing.** They contradict the repository's constraints and the BUSL product boundary.

D22 remains the largest single dossier at 55 days: Dia-style tab groups, the horizontal strip option, chat drag to open, a herdr-style pane manager with Windows-style placement previews, and a detached composer. It splits at 37 days for everything visible with one live chat, plus 18 for two concurrent live chats.

The gap review remains `engineering/gap-register.md`, now with the defects introduced by this revision's surfaces (plugin grants, session moves, egress). Every defect has a dossier or a named reason.

---

## 2. Evidence and method

This revision is grounded in a per-file read, not a feature grep. The evidence artifact is `engineering/upstream-read-ledger.md`, backed by `audit/index.json`: 6,712 files parsed for line count, doc block, exports, imports, and test status, plus a named list of files read line by line and the notes each produced.

Coverage, stated precisely:

| repo | indexed files | indexed lines | test files | first-pass deep reads |
|---|---:|---:|---:|---:|
| t3code | 5,444 | 1,597,450 | 1,835 | 32 |
| mausCode | 506 | 152,788 | 0 | 12 |
| opencode | 8,552 | 4,994 TypeScript files, not line-indexed | 1,072 | 24 |
| BetterShape | 762 | 176,795 | 106 | 20 |

A "deep-read entry" is one row in the ledger's Tier A table. Some entries bundle several files (for example the 86 t3 docs), so the number of files read line by line is higher than the row count; the ledger names the extent of every entry.

The deep-read set was chosen by port surface: contracts first, then the implementation of each candidate feature, then the BetterShape counterpart read immediately after so the gap is measured against code rather than assumed. Every dossier contains exact file paths, line ranges, symbol names, and in most cases the failure mode the upstream code is defending against.

What this method cannot claim: every line of 1.6 million was not read in this session. Section 2 of the ledger says exactly which files were structurally indexed instead. Any part of the plan that depends on files outside the deep-read set is a design hypothesis to validate in the first spike of its stage.

The read forced four corrections to revision 1, each of which changed the plan:

| revision 1 claim | what the code shows | consequence |
|---|---|---|
| BetterShape has no stash | git stash exists (`git_stash_*`, 6 commands, plus UI); what is missing is a **prompt** stash | D09 became an 11-day feature, not a git project |
| BetterShape has no queue | `message-queue.ts` is a real policy module with conversation binding and draft adoption | D09 ports control, not a queue |
| BetterShape has no isolation | `agent/checkout.rs` creates sibling worktrees for subagents; `git_worktree` tool exists | D14 ports the lifecycle, not the primitive |
| dictation and status bar are unwired | both are wired (`dictation-button.tsx`, `layout.tsx:678`); the gap report is stale at `71b776d` | D21 and D01 shrink |

---

## 3. Architecture comparison

### 3.1 Runtime and state ownership

The first table compares the two systems the plan was originally built around. opencode is compared separately in 3.3, because it differs on the axis that matters for D20 and D18: it treats models and colors as data generated per capability, not as code.

| dimension | BetterShape | t3code | mausCode |
|---|---|---|---|
| process model | Tauri: Rust core + webview | Node server + web/desktop/mobile clients | Electron main + renderer |
| state owner | Rust `AgentState` plus JSON files; React mirrors in `use-chat-session.ts` | event store plus projections in SQLite; clients hold bounded snapshots | main-process managers plus renderer stores |
| transport | Tauri IPC commands and events | typed RPC over HTTP/WebSocket | tRPC over IPC and remote |
| conversation store | one JSON file per project under `chat_history/`, merged on save | append-only events, projected | SQLite (drizzle) |
| turn lifecycle | spread across `run_turn.rs`, `streaming.rs`, `send_chat.rs`, approvals, and a 1,927-line hook | one orchestrator with command receipts and effect workers | split across main routers |
| concurrency | mutexes per subsystem, no workspace lease | thread locks, workspace leases, drainable workers | ad hoc |
| extension point | tools dispatch plus MCP client | provider drivers plus MCP server plus toolkits | plugins plus MCP |
| tests | 106 files, mostly Vitest plus some Rust unit tests | 1,835 files, 655,152 lines, including 6,962 lines for one git manager | none |

The decisive difference is not language or framework. It is that t3 has a **lifecycle owner** and BetterShape has a **turn handler**. Every hard feature in t3 (queue, rollback, settle, cleanup, delegation) is a policy attached to that owner. Porting those policies without the owner produces races that the upstream tests exist to prevent.

That is why D01 (foundations) includes a `TurnCoordinator` before any feature stage.

### 3.2 What each repo is actually good for

| repo | use it for | do not use it for |
|---|---|---|
| t3code | product semantics, lifecycle policies, security checks, test cases as specifications, schema design | runtime architecture, Effect idioms, multi-host and multi-provider breadth, mobile and relay |
| mausCode | UI patterns, kanban, command namespacing, Whisper fallback, quick-switch palettes | architecture, state management, anything cloud-shaped, test confidence |
| opencode | model capability and variant modeling, protocol-specific request shaping, theme derivation math, config schema discipline, client/server separation | its Effect-based core, its 60-package adapter table, its TUI theme format, its npm-at-startup plugin runtime |
| BetterShape | the substrate: Rust tool loop, design preview, git, skills, plugins, keychain, dark design system | lifecycle depth, usage accounting, PR review, scheduling, sandboxing |

### 3.3 opencode's architecture, in one table

opencode is the newest of the three and the most config-driven. It is worth naming what it does well before porting three subsystems out of it.

| dimension | opencode | what the port takes |
|---|---|---|
| runtime | TypeScript core plus a self-hostable HTTP server; TUI, desktop, and web clients | the separation only. D33's session-host boundary is the same idea in Rust. |
| model layer | one `Model.Info` descriptor with capabilities, overlays, and variants resolved per protocol package | D20's descriptor, overlay merge, and capability-driven generation |
| configuration | one schema, nested overlays at provider, model, and variant level, V1 and native V2 accepted together | the merge semantics and the "accept both forms" discipline |
| themes | seed palettes to OKLCH scales to ~250 semantic tokens, injected as one CSS block with a preload cache | D18's engine, not its theme files wholesale |
| execution | local processes and PTYs, exposed through the server API; no sandbox provisioning | nothing for D33 except the API shape |
| tests | 1,072 test files, many colocated with the module they pin | the variant and theme-preload tests, ported as-is |

The pattern to copy is not a file, it is a habit: **declare capabilities as data, generate behavior from them, and test the generated wire format.** D20 and D18 both follow it.

### 3.4 Translation table

Where an upstream construct has a BetterShape-native equivalent, use the equivalent rather than a literal translation.

| t3 / maus construct | BetterShape target | rule |
|---|---|---|
| Effect `Schema` | `serde` structs plus `ts-rs`-style generated types (or hand-written mirrors) | one definition per contract, generated into TypeScript |
| Effect `Context` service plus `Layer` | a Rust struct owned by `AppState` with constructor injection at startup | no service locator, no global singleton per driver |
| event-sourced projections | SQLite tables updated in the same transaction as the command | do not build an event store; build the tables the UI queries |
| command receipts | `command_receipts` table keyed by `command_id` | required for MCP and scheduler |
| zustand store plus `persist` | Rust store plus a React store hydrated on mount | no localStorage for durable data |
| `when` clause AST | same AST, parsed in TS, evaluated in the webview | context built from focus providers |
| typed RPC contracts | Tauri commands with request and response structs | every command that mutates takes an optional `command_id` |
| Effect `Stream` events | Tauri event channel with a closed enum of event names | one subscription per concern |
| `HostProcess` | `std::process::Command` plus the existing git binary resolution | keep the Windows `creation_flags` handling |
| Dia tab group | `ChatCollection` extended with collapse, pin, order, closed-at | reuse the existing icon and color pickers; do not build a second grouping model |
| herdr pane | `WorkspaceLayout` binary split tree over `PaneSurface` values | mouse path first; every operation also has a command id |
| Windows zone template | a placement layer that writes `SplitNode` trees | no free-floating windows inside the app; zones resolve to the same tree |

---

## 4. Porting doctrine

1. **Port the invariant, not the implementation.** Every dossier names the failure mode upstream is defending against. If the port keeps the invariant, the code can look completely different.
2. **One source of truth per fact.** A thread's status is derived from timestamps and an override, not stored as an enum plus timestamps. A cost is computed once in the ledger, not in three components.
3. **No silent fallback.** BetterShape's worktree code falls back to shared on failure; t3 fails the run and holds the queue. Prefer the explicit failure with a choice.
4. **Honest labels.** "Rewind conversation" is not "Undo". "Continue in a new chat" is not "Fork". If the provider cannot roll back, say so before the user confirms.
5. **Storage follows the query.** Transcript bodies stay in JSON; everything the UI sorts, filters, or aggregates goes to SQLite.
6. **Idempotency at the boundary.** Any command reachable by an agent, a scheduler, or a retry carries a receipt.
7. **Security is a product surface.** Managed worktree paths, PR comment anchors, webhook signatures, and HTML render allowlists get tests, not just checks.
8. **Tests are the specification.** Where upstream has a test for a policy, port the test before the code. The 6,962-line `GitManager.test.ts` is a checklist.
9. **No new runtime dependencies without a named reason.** `xcap` replaces five compositor backends; `rusqlite` replaces five JSON stores. Those are justified. A charting library for one page is not.
10. **Dark only in the shipped product.** Every appearance surface resolves through tokens, and the token engine is mode-parametric so a light mode is a data file later. No light-mode branches enter a component, and no mode switcher ships (ADR-18).
11. **Declare capabilities as data, generate behavior from them.** A hardcoded per-model effort table and a hand-maintained theme palette are the same mistake. D20 and D18 replace both with generators.
12. **If it needs a vendor SDK, a daemon, or a second machine, call it a build.** D33 is the largest dossier with no upstream to port, and D05 is the second. Saying so changes the estimate, the review bar, and the failure planning.

---

## 5. Decisions log

| id | decision | alternatives considered | reason |
|---|---|---|---|
| ADR-01 | SQLite for operational data, JSON stays for transcripts | move everything to SQLite; keep JSON per feature | transcripts are large blobs read once; queries are about status and counters |
| ADR-02 | A `TurnCoordinator` owns start/cancel/state | keep dispatch spread across commands | queue, scheduler, MCP, and subagents all need the same gate |
| ADR-03 | Port t3 queue **control**, not t3 queue **semantics** | replace `message-queue.ts` with t3's run model | BetterShape's conversation binding is better for its multi-chat UI; only ordering and hold are missing |
| ADR-04 | Checkpoints move to content-addressed blobs | git snapshots per turn; keep full JSON strings | blobs fix UTF-8 and size limits without requiring git; git refs can be added later |
| ADR-05 | Provider rollback ships for one provider only | wait for all; skip provider rollback | honest partial feature; unsupported providers get a labeled fallback |
| ADR-06 | GitHub only for PR depth | abstract six hosts now | 24,000 lines per host; the trait boundary is enough |
| ADR-07 | MCP server is stdio first, loopback second | HTTP on LAN; cloud relay | a desktop app must not open a network control surface by default |
| ADR-08 | Scheduled tasks local only; webhooks loopback only | relay for public webhooks | privacy constraint; no outbound registration |
| ADR-09 | Worktrees per thread, one per thread, created at launch | worktree per run; worktree per message | disk and `git worktree list` sanity |
| ADR-10 | Keybindings move to a config file with a when-AST | stay on localStorage plus decorative `when` | conflicts and multi-window correctness |
| ADR-11 | SnapShot v1 is screenshot only | port accessibility tree with v1 | 40 percent of code and all the platform risk for a feature screenshots already deliver |
| ADR-12 | No Effect, no event sourcing, no mobile, no relay | literal port | cost and mismatch exceed any benefit |
| ADR-13 | Panes are one binary split tree per project, persisted in localStorage | nested `Panel` components with index-keyed sizes; real OS windows | one model for drag, keyboard, persistence and restore; index math breaks on reorder |
| ADR-14 | Only one live chat per window until the `LiveChat` spike lands | mount several `Chat` instances now; one window per chat | `AgentState` holds singular live fields; two mounts would fight over `activate_conversation` |
| ADR-15 | The composer moves without remounting, and never as a Tauri window | separate window; remount per dock mode | remount loses caret, IME and draft continuity; a window breaks drag and portal assumptions |
| ADR-16 | Two panes maximum, and the bar style is a global setting | four panes like Dia; per-project bar style | a chat pane carries a composer, a terminal and a diff; four leaves are unreadable, and a per-project bar means two windows can disagree about the window shape |
| ADR-17 | Agent activity renders through one normalized `WorkRow` layer | extend the 40-type chunk renderer; port t3's work log wholesale | labels, grouping, status and expansion are cross-cutting; computing them per renderer is what produced the current drift |
| ADR-18 | Dark remains the only shipped mode; the theme engine is mode-parametric | port OpenCode's light, dark, and system switcher; stay hardcoded | the chrome, shadows, scrims, and screenshots are tuned for dark; a half-audited second mode is worse than none, and the generator can take `isDark` without shipping it |
| ADR-19 | Transport order is VPS over SSH first, then Daytona, then boat, each as a plugin behind the same capability | port t3's SSH tunnel as-is; build Daytona only; build all three at once | SSH covers the VPS and boat; one working transport proves the capability before two vendor surfaces are added |
| ADR-20 | Model variants are named overlays generated from declared reasoning capabilities, never a free-text effort box | keep the hardcoded family table; expose an enum of effort levels | providers disagree on effort, budget, and toggle; an overlay model is the only shape that covers all three without another table |
| ADR-21 | A global plugin host with declared capabilities and per-capability grants, not an in-process module loader | copy opencode's dynamic npm plugin loading; hardcode every extension | BetterShape's agent can already run commands and write files; an in-process plugin would inherit that authority without the per-action review the tool layer has |
| ADR-22 | Remote execution moves the session to a session host; the transport is a plugin | local loop with remote tool calls; a compiled-in `Runner` only | the user asked for sessions that move between backends; local-loop/remote-tools is a different product with a different failure model, and it keeps tokens and state on one machine |
| ADR-23 | A session bundle is a directory with a manifest and checksums, not an archive | zip or tar with a binary header; a database dump | diffable, dependency-free, and verifiable file by file; a transport may tar it in flight |
| ADR-24 | Permission rules are JSON with argv-prefix matching, not TOML strings | port mausCode's TOML table; substring matching | the settings pipeline is JSON; a TOML parser is a dependency for no user gain, and substring matching cannot distinguish `npm test` from `npm test && curl` |
| ADR-25 | The mausCode roadmap is resolved step by step, with explicit not-applicable verdicts | port everything mechanically; ignore the roadmap | "as much as we can" needs a record of what was taken and what was refused, or the same step is re-litigated every revision |

---

## 6. Dossier index

Each dossier follows the same structure: base branch, upstream inventory, mechanism, tests worth porting, BetterShape today with file evidence, port plan, traps, effort, acceptance criteria, and a prompt. The numbering is the merge order.

| # | dossier | verdict | days | depends on |
|---|---|---|---:|---|
| D01 | Foundations and gap remediation | do first | 25.5 | none |
| D02 | Typed failure surfaces | build | 9 | D01 |
| D03 | Permission floor under every agent action | build, port mausCode 10 | 12 | D01, D02 |
| D04 | Secrets vault with a loud fallback | build, port mausCode 11 | 8 | D01, D02 |
| D05 | Plugin host, manifests, capabilities, event bus | build | 26 | D01 to D04 |
| D06 | Session bundles, loopback API, scratch, move contract | build, port mausCode 26 | 14 | D01, D02, D05 |
| D07 | Composer core, drafts, context records, citations | take, split | 13 | D01 |
| D08 | Run records, event log, audit trail | build, port mausCode 07/09/41 | 14 | D01, D02, D06 |
| D09 | Prompt stash and queue control | take | 11 | D07, D08 |
| D10 | Thread settle, snooze, titles, find | take | 14 | D07, D08 |
| D11 | Usage, pricing, budgets | take, re-derive sources | 17 | D07, D08 |
| D12 | Context assembly and the instruction budget | build, port mausCode 23 | 10 | D07, D08 |
| D13 | Keybindings, when-AST, conflicts | take | 12 | D09, D10, D11 |
| D14 | Worktrees, setup scripts, cleanup | take lifecycle | 20 | D01 |
| D15 | Rewind, checkpoints, rollback safety | re-derive storage, take safety | 17 | D01, D14 |
| D16 | Source control and review depth | take GitHub only | 27 | D01, D14 |
| D17 | Tool call and thinking presentation | re-design on existing primitives | 9 | none |
| D18 | Theme system | take the engine, ship dark only | 16 | D01 |
| D19 | Providers, instances, models, handoff | take shape, not packages | 13 | D01 |
| D20 | Model variants, reasoning effort, verbosity | take the model, not the config file | 15 | D01, D19 |
| D21 | mausCode UI systems | partial | 18 | D07, D09, D11 |
| D22 | Tab groups, panes, composition, detached composer | take, staged | 55 | D01, D13, D17 |
| D23 | SnapShot, preview, HTML renders, MCP apps | partial | 13 | D13 |
| D24 | Scheduled tasks and webhooks | take tasks, defer public hooks | 14 | D01, D08, D09 |
| D25 | Orchestrator MCP and delegation | take | 19 | D01, D08, D14 |
| D26 | Critics for plans and patches | upgrade the existing debate | 10 | D08, D16, D19 |
| D27 | Research lane and egress policy | build, port mausCode 27 | 10 | D03, D04, D05, D08 |
| D28 | Auditable memory and session search | build, port mausCode 24/44 | 16 | D03, D04, D08, D12 |
| D29 | Skills, install, disclosure, distillation | build on the verifier | 12 | D03, D05, D08, D12 |
| D30 | Environment import | build, port mausCode 33 | 12 | D04, D12, D19, D25, D29 |
| D31 | Bounded CI failure loop | build, port mausCode 16 | 8 | D08, D16, D26 |
| D32 | Release artifacts, checksums, update check | finish the existing pipeline | 8 | D01 |
| D33 | Remote backends as plugins that move sessions | build, do not port | 34 | D04, D05, D06, D08, D14 |
| | **total** | | **531.5** | |

Files: `engineering/dossiers/01-foundations.md` through `33-remote-backends-plugin.md`, plus `engineering/dossiers/README.md` for the merge rule, issue conventions, and the old-to-new number map. The evidence ledger is `engineering/upstream-read-ledger.md`; the gap review is `engineering/gap-register.md`; the roadmap resolution is `engineering/mauscode-roadmap-map.md`.

---

## 7. Stage plan

The stage numbers replaced the old waves. A stage is a merge window, not a parallel team: the chain is sequential, and every dossier names `draft/mega-absorb-all` as its base and a `dossier/NN-<slug>` branch.

### Stage 1: foundations, safety, plugins, portability (94.5 days)

D01 foundations, D02 failure surfaces, D03 permission floor, D04 secrets, D05 plugin host, D06 portability.

This is the longest stretch before a user-visible chat change, and it is deliberate. D05 gives every later extension a contract; D06 gives every later transport a move format; D03 and D04 are the gates mausCode itself called critical. Building the queue or the scheduler before run records would create the second source of truth D08 exists to prevent.

### Stage 2: composer, run records, work control (91 days)

D07 composer, D08 run records, D09 stash and queue, D10 thread lifecycle, D11 usage, D12 context, D13 keybindings.

The first stage where the chat surface changes daily. D08 lands before D09 because the queue attaches to a run, not to a React store. D12 lands before memory and skills in stage 5 so both can use the budget.

### Stage 3: workspace, rewind, review, presentation, theme (89 days)

D14 worktrees, D15 rewind, D16 source control and review, D17 tool calls, D18 theme.

D17 has no dependency and could be pulled earlier by anyone who wants the transcript to read better sooner; it is placed here because D22 reads its `WorkRow` model.

### Stage 4: models, variants, maus UI, composition, preview (114 days)

D19 providers, D20 variants and verbosity, D21 maus UI systems, D22 tabs and panes, D23 preview.

D22 is the largest dossier and depends on D13's command file and D17's rows. Everything before it exists so that the composition does not land on a moving transcript.

### Stage 5: schedules, orchestration, critics, research, memory, skills, import (81 days)

D24 schedules, D25 orchestrator, D26 critics, D27 research, D28 memory and search, D29 skills, D30 import.

Every dossier here is a consumer of the plugin host, the run log, the permission floor, or the context budget. None of them is a prerequisite for the others except as listed.

### Stage 6: CI loop, release, remote (62 days)

D31 CI loop, D32 release, D33 remote.

D33 is last because it depends on D05 and D06 and because it is the largest new-engineering surface in the plan. D32 is small and independent; it can be pulled forward if a release blocks the chain.

### Dependency graph

```
D01 -> D02 -> D03 -> D04 -> D05 -> D06
D01 -> D07 -> D09 -> D13 -> D22
D07 -> D10
D07 -> D11
D08 -> D09, D10, D11, D12, D24, D25, D26, D27, D28, D29, D31
D01 -> D14 -> D15, D16
D01 -> D18
D01 -> D19 -> D20
D16 -> D31
D05, D06, D14 -> D33
D04, D12, D19, D25, D29 -> D30
```

A dossier may start only when every arrow into it has merged. The dossiers' own dependency rows are authoritative when this graph and a dossier disagree; update both in the same change.

---

## 8. Effort scenarios

Full plan, solo, five productive days per week:

```
531.5 feature days + 20 percent integration overhead = 638 days
638 / 21.7 = about 29 months
```

That is the number to plan against if the goal is "everything". The scenarios below are the useful slices.

### Scenario A: the chat improvement (4 months)

D01, D02, D07, D09, D10. 72.5 days, about 87 with overhead. Ships durable drafts, stash, queue control, citations, typed failures, settle and snooze, and find in thread. No provider, worktree, or plugin risk.

### Scenario B: safe before autonomous (5 months)

Stage 1. 94.5 days, about 113 with overhead. Ships the permission floor, the secrets vault, the plugin host, session portability, and typed failures. Nothing in this scenario changes what the chat looks like; everything in it changes what the app is allowed to do.

### Scenario C: the working set (10 months)

Stages 1 and 2. 185.5 days, about 223 with overhead. Everything in B plus the composer, run records, queue, thread lifecycle, usage and budgets, context assembly, and keybindings. This is the first version that is meaningfully better than the current app for daily use.

### Scenario D: the composition request (3 months on top of stage 2)

D22 alone is 55 days, about 66 with overhead. Its dependency closure (D01, D02, D07, D08, D09, D10, D11, D13, D17, D22) is 179.5 days, about 215 with overhead. Stage 0 to Stage 6 of D22 delivers the whole visible request with one live chat; the last stage adds two concurrent chats.

### Scenario E: remote sessions (9 months from zero)

The D33 closure is D01, D02, D03, D04, D05, D06, D08, D14, D33: 162.5 days, about 195 with overhead. The VPS transport plus its prerequisites (T0 to T4) is 25 days of D33 plus the closure, which is the honest number for "move this session to my server".

### Scenario F: everything (29 months)

531.5 days, about 638 with overhead.

### Scenario G: the opencode workstreams (4.5 months)

D18 (16), D20 (15), and the plugin host rows that D19 needs. 31 days for the two visible opencode ports, about 4 months with D19. D20 depends on D19 and D01; D18 is independent.

Team of two, split frontend and Rust, with the dossiers as specs: wall clock drops to roughly 55 to 60 percent of solo because most dossiers have a clean seam between Rust storage and React surface. The exceptions are D06 (bundle transaction), D08 (single writer), D16 (review state), D22 (pane tree), and D33 (session host and transports), which are single-owner tasks.

---

## 9. Risk register

| risk | likelihood | impact | mitigation |
|---|---|---|---|
| SQLite migration corrupts existing conversations | low | high | JSON remains the source for bodies; migration is copy-only; keep a backup and a dry-run mode |
| Turn coordinator refactor regresses sending | medium | high | introduce behind the existing API, run both paths in a test harness, port the queue tests first |
| Provider rollback misbehaves for a specific API version | medium | medium | capability flag per provider plus a version probe; label unsupported providers |
| Worktree cleanup deletes user work | low | severe | managed-root check, uncommitted-change guard, dry run, lease, and a trash-first removal |
| MCP server becomes an attack surface | medium | severe | disabled by default, stdio first, loopback only, allowlist, audit log |
| Usage prices drift or are wrong | high | medium | cost source per row, overrides, visible "estimated" marker, never zero for missing |
| PR sync hits GitHub rate limits | high | low | ETag conditional requests, batching, backoff, stale marker |
| Scope creep into Effect orchestration | medium | high | ADR-12; any proposal to port a `Layer` or `Context` is rejected by default |
| Dark-only design system fights ported UI | medium | low | port structure only; all colors and spacing come from BetterShape tokens |
| Solo maintainer bus factor | certain | high | dossiers are written as specs; every stage ends with tests that encode the policy |
| Pane layout storage drifts or corrupts | medium | medium | versioned envelope, validation on read, fall back to a single chat leaf, never throw on boot |
| Two chat mounts fight over the single live chat | high | high | ADR-14: one mounted `Chat` until Stage 7; enforce with an explicit primary flag, not convention |
| Drag across dnd-kit contexts silently never drops | medium | high | one app-level provider above sidebar and panes; capture-phase drop; a UI regression test for sidebar-to-pane |
| Floating composer loses draft or IME on dock change | medium | high | move the wrapper without remounting; test with an IME composition fixture before shipping |
| Theme engine changes every color at once and visual regressions become unattributable | high | medium | the `bettershape` theme is a snapshot-tested oracle; the engine ships behind a settings flag for one release |
| A remote target silently falls back to local execution | low | severe | explicit test that a failed connection returns an error and spawns no local process; no fallback code path exists |
| Cloud credentials leak through logs, transcripts, or preview URLs | medium | severe | keychain only, redaction at serialization, a fixture test per secret shape, no vendor token in a stored URL |
| Daytona or boat changes its API or pricing under a closed-source vendor | medium | medium | a thin transport plugin with documented endpoints and no vendor SDK in the Rust tree; a second transport keeps the interface honest |
| Variant generation sends an overlay a provider rejects | medium | medium | golden request bodies per family; validation at load; an unknown variant cannot reach the wire |
| Subagent queueing changes delegation semantics | medium | medium | queue only when the cap is hit; keep the same completion delivery; test a fifth spawn and a cancelled parent |
| A plugin inherits enough authority to bypass the permission floor | medium | severe | capabilities are declared data, grants are per scope, sidecars get a scrubbed env and no Tauri commands; a test asserts a plugin cannot call a mutating tool without a grant |
| Event bus backpressure hides a failure | medium | medium | bounded ring plus one `events_lagged` event with the dropped count; run events are durable in D08 and are the source of truth |
| Moving a session leaves two writable copies | low | severe | D06 fences the source from `Exporting` until `Active`; a project-level move lock rejects a second move; failure before `Active` restores the source |
| A transport plugin falls back to local execution | low | severe | no fallback code path exists; a test asserts an error and zero local spawns |
| Runner token leaks through argv or logs | medium | severe | token over stdin or a 0600 env file, never argv; redaction fixture for the runner token shape |
| Permission rules become unreadable and users disable the floor | medium | medium | a rule editor with a plain-language summary and a "why was this asked" expandable; the floor is immutable |
| The chain stalls on D05 or D33 | medium | high | both are split into stages; stage 1 can ship D01 to D04 without D05, and D33's VPS path is usable before Daytona or boat |
| Six new dossiers in one revision inflate the estimate beyond credibility | high | medium | the roadmap map records each step's verdict and the dossiers are individually shippable; scenario B is the smallest coherent slice |

---

## 10. Licensing and notices

| repo | license | obligation |
|---|---|---|
| t3code | MIT | include the copyright notice and permission text in `THIRD_PARTY_NOTICES` and in the app's open-source licenses page |
| mausCode | Apache-2.0 | include the license, retain notices, state changes; check for a `NOTICE` file before copying |
| opencode | MIT | include the notice; D18 copies theme JSON files and small colour utilities, and D20 copies the variant shape, so `lib/theme/themes/README.md` records provenance per file |
| BetterShape | BUSL-1.1, change date 2030-06-22 | ported code enters under BUSL; upstream notices still apply to the ported portions |

Practical rules:

1. Ported files carry a header: `Portions adapted from <repo> (<commit>), <license>.`
2. The dossier keeps a per-file provenance table when code is copied rather than re-derived.
3. No GPL or AGPL dependency enters through a port. Check any new crate or npm package.
4. The open-source licenses page lists both upstreams with their license text.
5. The MIT and Apache texts are stored verbatim, not paraphrased.
6. No upstream plugin, theme, or skill bundle is redistributed; D05's manifests and D29's skill contract are original, and themes are data files with a provenance entry.

The plan deliberately ports **semantics and small utilities**. Whole-file copies should be rare; where they happen (for example the `when` AST parser shape, the stash store logic, or the theme scale generator), the provenance table is mandatory.

---

## 11. Explicit non-goals

| item | reason |
|---|---|
| orchestration-v2 Effect core (164 files) | runtime mismatch; semantics are ported individually |
| `.repos/` (21,835 vendored files) | vendored Effect sources |
| ACP, Codex app-server, Cursor, Pi, Muse, OpenCode packages | CLI protocol bridges, not applicable to a BYOK HTTP app |
| mobile, marketing, relay, SSH, Tailscale | different products |
| subscription OAuth and cloud automations | requires a backend BetterShape does not have |
| Electron, tRPC, drizzle | maus architecture |
| telemetry, analytics, device ids | contradicts `AGENTS.md` |
| light mode and a mode switcher | ADR-18; the theme engine accepts `isDark` but only dark ships |
| OpenVSX or VS Code theme import | the theme format is OpenCode's, not VS Code's; a converter is a separate tool |
| webhooks reachable from the internet | privacy and server-independence constraint |
| MCP app views in v1 | security cost exceeds value until D10 is stable |
| LSP client | a separate project; hide the dead menu items now |
| remote language servers and remote extensions | D33 covers session execution, files, terminals, and previews only |
| repository sync to a remote target | D33 clones or bundles on the remote side; a sync engine fights git |
| a remote runner daemon beyond the headless session host | one binary per session host; a daemon with its own lifecycle is a second product |
| Windows and macOS sandboxes | BetterShape's build and preview assumptions are Linux-shaped |
| vendor SDKs in the Rust backend | REST is testable and does not add a JavaScript runtime |
| multi-user or team features | no request, and it changes the storage model |
| a plugin marketplace or remote registry | install is a local, explicit, permission-sheeted action; hosting a registry is a service |
| an in-process JavaScript plugin runtime | the sidecar tier covers integrations without giving foreign code the app's address space |
| auto-install or auto-update of plugins | a plugin update is a new consent event when capabilities change; no background install |
| an auto-installing app updater | D32 opens the release page; silent install needs signing and a rollback story |

---

## 12. Verification

The repository gate (`npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build:runtime`, `npm run test:all`, `npm run skills:verify`, `cargo fmt --check`, `cargo clippy`) applies to every stage. On top of it, each stage adds:

| stage | additional gate |
|---|---|
| 1 | migration test from a fixture of the current JSON state; receipt replay; single-start race; every `TRUST_GATED_TOOLS` arm has a `decide` call; keyring grep; secret never crosses IPC; manifest rejection matrix; plugin env scrubbing; bundle round-trip and checksum corruption; move fencing and abort |
| 2 | restart test for drafts and stash; attachment byte equality; conversation scoping; one failure row per kind; redaction fixtures; receipt-backed retry runs once; transition matrix and gap-free sequence; durable cursor replay; budget arithmetic and cut order; stable hash under prompt caching |
| 3 | shared-workspace refusal; binary checkpoint round-trip; settle and snooze clock tests across DST; PR stack base selection with a forced push; diff budget; viewed-state reset on head change; theme oracle snapshot; preload first-paint; literal lint |
| 4 | golden request bodies per reasoning family; variant merge order; unknown variant failure; maus UI persistence; group persistence and layout restore; sidebar row dragged to a pane edge opens there; composer draft survives a dock change; two concurrent turns and independent stop |
| 5 | scheduler DST and missed-run tests; MCP contract and idempotency; critic schema retry and round cap; SSRF matrix and redirect hops; memory scope isolation and decay; skill lock hash parity with the Node verifier; import writes nothing before Confirm; rollback restores byte-for-byte |
| 6 | CI signature stop and local-gate refusal; checksum refusal on a truncated artifact; channel filter and 24-hour cache; a moved session spawns nothing locally; host key mismatch stops; runner binds loopback only; a third-party transport passes conformance |

Performance budgets are part of acceptance, not aspirational:

- conversation switch under 100 ms with 500 conversations in the list
- usage page under 200 ms for 100,000 ledger rows
- 5,000-line diff opens under 300 ms
- 500 KB draft store hydrates under 50 ms

---

## 13. Open questions

1. **Thread model.** One conversation per window, or t3's thread-with-runs model? The plan assumes the former with a coordinator; D08's `runs` table gives the latter an upgrade path.
2. **SQLite location.** Per project or app-wide? The plan assumes app-wide with a `project_path` column, because usage, schedules, and memory spans projects.
3. **GitHub auth.** Reuse the existing `gh` CLI and credential manager, or add OAuth? The plan assumes `gh` first.
4. **Windows first or macOS first** for SnapShot and keychain edge cases? The tree does not state the user base.
5. **BUSL boundary.** Does ported MIT code inside a BUSL repo create a notice requirement beyond attribution? Legal review before stage 3.
6. **Composition stage (answered).** D22 delivers the visible request with one live chat at 37 days; the last 18 add two concurrent chats.
7. **Pane cap (answered).** Two panes: the split tree caps at one split, and the template picker carries only two-zone templates.
8. **Top bar scope (answered).** Global.
9. **Kanban placement.** A separate route or a sidebar mode? The plan assumes a sidebar mode.
10. **Light mode (answered for now).** ADR-18 keeps dark as the only shipped mode and makes the engine mode-parametric. Revisit after D18 only if a real request appears.
11. **Remote backend order (answered).** VPS over SSH first, then Daytona, then boat.
12. **Plugin distribution.** Does D05 ship a sidecar installer only, or also a hosted index? The plan assumes local install from a folder or archive, with no registry.
13. **WASM tier.** Deferred to a later revision. The declarative and sidecar tiers cover D33 and the integrations in this plan.
14. **mausCode re-clone.** D21's line numbers come from an earlier read at `9f1bc76`. Re-clone before editing that dossier so the evidence matches the pin.
15. **Whether D33 ships beyond the VPS path in this port.** T0 to T4 (25 days of D33 plus prerequisites) makes remote sessions real; T5 and T6 are separate PRs that can wait for a user with a Daytona or boat account.

---

## Appendix A: measured inventory

BetterShape:

- 1,783 tracked files, 1,712 doc lines
- 762 indexed source files, 176,795 lines, of which 106 test files and 12,070 test lines
- `src-tauri/src` 156 files / 62,233 lines; `features/chat` 88 / 22,188; `features/git` 50 / 14,048; `features/agent` 70 / 13,315; `features/preview` 33 / 10,291
- 268 Tauri command attributes, 64 palette commands, about 60 agent tools

t3code:

- 5,444 indexed source files, 1,597,450 lines, 1,835 test files (655,152 lines)
- `apps/server/src` 1,169 files / 475,728 lines
- `apps/web/src` 1,526 files / 378,832 lines
- `packages/*` 1,400+ files including 9 provider packages and 8 source-control packages
- `docs/` 86 files / 11,897 lines

mausCode:

- 506 source files, 152,788 lines, zero test files
- `src/renderer/features/agents` 49,681 lines
- `src/main/lib/trpc/routers` 13,086 lines
- `src/main/lib/git` 7,228 lines

opencode:

- 8,552 tracked files, 231 MB including assets
- 4,994 TypeScript files under `packages/`, 1,072 test files
- `packages/core/src/variant.ts` 690 lines; `packages/schema/src/config/provider.ts` 263 lines; `packages/theme/src/tui/` 1,700+ lines across 11 files; `packages/ui/src/theme/` 1,610 lines; 36 desktop theme JSON files and 33 TUI theme assets
- `packages/server` 608 KB across 30 handler files; `packages/containers` 36 KB, five Dockerfiles

## Appendix B: upstream concept glossary

| term | meaning |
|---|---|
| thread | a conversation with lifecycle state (active, settled, snoozed) |
| run | one turn attempt with a status and an ordinal |
| node | an execution unit inside a run (assistant turn, tool, subagent, approval) |
| provider thread | the provider-native conversation identity |
| checkpoint scope | the filesystem scope a checkpoint belongs to |
| dispatch mode | how a new message relates to the active run: queue, steer, restart, start |
| delegation | a child thread created by a parent agent with a role and a completion delivery policy |
| handoff | transferring context between providers or threads with an explicit strategy |
| settle | lifecycle state for work that is done and shelved but not archived |
| stash | a saved prompt with attachments, restorable later |
| receipt | a stored command result keyed by a client request id |
| lease | a lock over a worktree path held by destructive operations |
| variant | a named overlay on one model (`provider/model#variant`) carrying settings, headers, and body |
| verbosity | `textVerbosity`, the OpenAI Responses answer-length control, defaulted to low where supported |
| reasoning capability | the declared reasoning controls for a model: effort values, an on/off toggle, or a token budget |
| seed palette | the ten colors a theme file declares before scales and semantic tokens are generated |
| scale | the 12-step OKLCH ramp generated from one seed for a mode |
| session host | the process that owns a session's agent loop, workspace, PTY, and previews; local or remote |
| target | a remote execution host a session can move to: a VPS, a Daytona sandbox, or a boat machine |
| failure | the structured error type with a kind, code, retry policy, scope, and optional action |
| plugin | a manifest-declared extension with capabilities and a per-capability grant |
| capability | a named contract a plugin may implement; a grant is the user's consent to one scope of it |
| move | the fenced transfer of a session between hosts, with export, upload, import, and verify stages |
| bundle | the directory format that carries a session, its messages, drafts, usage, and blobs |
| egress policy | the serializable rule set every research fetch passes before any bytes leave the app |
