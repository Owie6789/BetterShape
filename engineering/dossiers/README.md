# Dossiers as issues

This folder holds one dossier per pull request. Each dossier is written to become a single GitHub issue: a title, a base branch, a scope, evidence, a plan, acceptance criteria, traps, and a self-contained prompt at the bottom. The prompt is the part to copy. It tells a fresh agent to read `AGENTS.md`, then `DESIGN.md`, then the dossier, then to implement only that dossier and run the repository's verification gate.

The plan behind the order lives in `engineering/upstream-port-plan.md`. The evidence ledger lives in `engineering/upstream-read-ledger.md`. The gap review lives in `engineering/gap-register.md`. The mausCode roadmap resolution lives in `engineering/mauscode-roadmap-map.md`. Read all four before changing a dossier, and update them when a decision changes.

## One chain, one PR at a time

The numbering is the merge order. Dossier `NN` is the `NN`th pull request, and it is not started until `NN-1` has merged.

| Rule | Value |
| --- | --- |
| Base branch | `draft/mega-absorb-all` |
| Plan branch | `milestone/v26-11-17` (parentless docs branch, holds `engineering/` only) |
| PR branch | `dossier/NN-<slug>` (the slug is in the file name) |
| When to branch | after dossier `NN-1` has merged into the base |
| Rebase | rebase on the base before opening, never merge the base into the branch |
| Merge | one dossier per PR, squash or merge, never a batch |
| Blocked by | a dossier may name a later dependency only if the plan says so; otherwise the order is the dependency |

A dossier that turns out to need a change in an earlier dossier gets a row in that earlier dossier's "follow-ups" section, and the change lands in the earlier PR. Editing the chain after work starts is the failure mode this ordering exists to prevent.

## How to open one as an issue

1. Create the labels in the table below once, in the repository settings.
2. Open the dossier and copy the `Issue title` value from the field table at the top.
3. Copy the body, starting from the line after the field table.
4. Add the labels listed for that dossier, plus `Backlog`.
5. Paste the block under "Prompt for a fresh agent" into a new chat when you are ready to implement it.

To create all 33 at once instead of by hand, run `python3 engineering/issues/create_issues.py`. It reads the same fields, adds `Backlog`, skips titles that already exist, and supports `--dry-run`. See `engineering/issues/README.md`.

For how to drive a fresh agent through one dossier, including the kickoff line, the follow-up messages, and the review checklist, see `engineering/agent-handoff.md`.

## Label set

| Label | Meaning |
| --- | --- |
| `port` | work that ports behavior from t3code, mausCode, or opencode |
| `dossier:NN` | which dossier this is |
| `area:chat`, `area:shell`, `area:git`, `area:agent`, `area:settings`, `area:preview`, `area:core`, `area:ui`, `area:usage`, `area:design`, `area:runtime` | the surface the work lands on |
| `size:S` (8 days or less), `size:M` (9 to 16), `size:L` (17 to 25), `size:XL` (over 25) | effort band |
| `stage:N` | the stage in the plan, which is also the merge window |

## The dossiers

| # | Issue title | Size | Days | Depends on | Stage |
| --- | --- | --- | ---: | --- | --- |
| D01 | BetterShape foundations and gap remediation | L | 25.5 | none | 1 |
| D02 | Typed failure surfaces | M | 9 | D01 | 1 |
| D03 | Permission floor under every agent action | M | 12 | D01, D02 | 1 |
| D04 | Secrets vault with a loud fallback | S | 8 | D01, D02 | 1 |
| D05 | Plugin host, manifests, capabilities, and the event bus | XL | 26 | D01 to D04 | 1 |
| D06 | Session bundles, the loopback API, scratch sessions, and the move contract | L | 14 | D01, D02, D05 | 1 |
| D07 | Composer core, drafts, context records, and citations | M | 13 | D01 | 2 |
| D08 | Run records, the event log, and the audit trail | M | 14 | D01, D02, D06 | 2 |
| D09 | Prompt stash and queue control | M | 11 | D07, D08 | 2 |
| D10 | Thread management: settle, snooze, titles, forks, and find | M | 14 | D07, D08 | 2 |
| D11 | Usage, pricing, and budget controls | L | 17 | D07, D08 | 2 |
| D12 | Context assembly, instruction files, and the budget | M | 10 | D07, D08 | 2 |
| D13 | Keybindings: when-clauses, conflicts, and a real config file | M | 12 | D09, D10, D11 | 2 |
| D14 | Worktrees, setup scripts, and cleanup | L | 20 | D01 | 3 |
| D15 | Rewind, checkpoints, and rollback safety | L | 17 | D01, D14 | 3 |
| D16 | Source control and review depth | XL | 27 | D01, D14 | 3 |
| D17 | Tool call and thinking presentation | M | 9 | none | 3 |
| D18 | Theme system | M | 16 | D01 | 3 |
| D19 | Providers, instances, models, and handoff | M | 13 | D01 | 4 |
| D20 | Model variants, reasoning effort, and verbosity | M | 15 | D01, D19 | 4 |
| D21 | mausCode UI systems | L | 24 | D07, D09, D11 | 4 |
| D22 | Tab groups, panes, and the composition of the chat surface | XL | 55 | D01, D13, D17 | 4 |
| D23 | SnapShot, preview browser, HTML renders, and MCP apps | M | 13 | D13 | 4 |
| D24 | Scheduled tasks and webhooks | M | 14 | D01, D08, D09 | 5 |
| D25 | Orchestrator MCP, delegation, and cross-agent control | L | 19 | D01, D08, D14 | 5 |
| D26 | Critics for plans and patches, with bounded rounds | M | 10 | D08, D16, D19 | 5 |
| D27 | The research lane and its egress policy | M | 10 | D03, D04, D05, D08 | 5 |
| D28 | Auditable memory and search across past sessions | L | 16 | D03, D04, D08, D12 | 5 |
| D29 | Skills, install, disclosure, and distillation | M | 12 | D03, D05, D08, D12 | 5 |
| D30 | Environment import from other agent tools | M | 12 | D04, D12, D19, D25, D29 | 5 |
| D31 | The bounded CI failure loop | S | 8 | D08, D16, D26 | 6 |
| D32 | Release artifacts, checksums, and an honest update check | S | 8 | D01 | 6 |
| D33 | Remote backends as plugins that move sessions | XL | 34 | D04, D05, D06, D08, D14 | 6 |

Totals: 33 dossiers, 537.5 person-days. At the plan's 20 percent integration overhead, about 645 working days, or roughly 29 months solo.

| Stage | Dossiers | Days | Theme |
| --- | --- | ---: | --- |
| 1 | D01 to D06 | 94.5 | foundations, safety, plugin host, portability |
| 2 | D07 to D13 | 91 | composer, run records, memory of work, control |
| 3 | D14 to D18 | 89 | workspace, rewind, review, presentation, theme |
| 4 | D19 to D23 | 120 | models, variants, maus UI, composition, preview |
| 5 | D24 to D30 | 93 | schedules, orchestration, critics, research, memory, skills, import |
| 6 | D31 to D33 | 50 | CI loop, release, remote |

## What changed from the previous ordering

The first ordering grouped work by upstream and by feature wave. This ordering is a single chain: safety before autonomy, portability before transports, foundations before everything.

| Old | New | Reason |
| --- | --- | --- |
| D14 foundations | D01 foundations | first, unchanged in content |
| D20 failure surfaces | D02 failure surfaces | every later dossier adds a failure mode |
| (new) | D03 permission floor, D04 secrets vault | mausCode's two critical gates, before any autonomy |
| (new) | D05 plugin host | the plugin system is a deliverable, not a hook API |
| (new) | D06 session portability | the move contract exists before any transport |
| D01 composer | D07 composer | |
| (new) | D08 run records | the queue and every unattended feature need it |
| D02 stash and queue | D09 stash and queue | now depends on run records |
| D04 thread management | D10 thread management | |
| D05 usage | D11 usage | |
| (new) | D12 context assembly | instruction budget before memory and skills |
| D06 keybindings | D13 keybindings | |
| D08 worktrees | D14 worktrees | |
| D03 rewind | D15 rewind | |
| D07 source control | D16 source control | |
| D16 tool calls | D17 tool calls | |
| D18 theme | D18 theme | number unchanged, content revised |
| D11 providers | D19 providers | |
| D17 variants | D20 variants | |
| D12 maus UI | D21 maus UI | |
| D15 composition | D22 composition | |
| D13 preview | D23 preview | |
| D09 schedules | D24 schedules | |
| D10 orchestrator | D25 orchestrator | |
| (new) | D26 critics | upgrades the existing debate |
| (new) | D27 research lane | egress policy |
| (new) | D28 memory and search | |
| (new) | D29 skills | |
| (new) | D30 environment import | |
| (new) | D31 CI loop | |
| (new) | D32 release engineering | |
| D19 cloud backends | D33 remote backends | rewritten as plugins that move sessions |

## Conventions these dossiers assume

- Dark only, per `DESIGN.md`. D18 adds a theme engine and a theme picker, but no light mode and no mode switcher (ADR-18).
- No telemetry, no analytics, no remote logging beyond the named network calls in a dossier.
- One concern per branch. Never push `main`.
- The verification gate is `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build:runtime`, `npm run test:all`, `npm run skills:verify`, plus `cargo fmt --check` and `cargo clippy` when Rust changed.
- Labels use lower case, sentence case in prose, and `...` rather than the ellipsis character.
- A dossier that needs a dependency installed, a vendor account, or a second machine says so in its "Effort" and its "Traps"; it does not assume one.
