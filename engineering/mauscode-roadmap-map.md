# mausCode roadmap: every step, and where it lands

This file resolves all 45 mausCode roadmap steps (issues #3 to #47, step N = issue N+2) and the index issue #48 to a BetterShape dossier or an explicit "not ported, and why". It exists because the roadmap is the largest single body of planned work across the three upstreams, and "port as much as we can" needs a per-step answer rather than a general intention.

Read it with `engineering/dossiers/README.md`, which carries the merge order, and `engineering/upstream-port-plan.md`, which carries the evidence and the decisions.

## How the mausCode plan was read

- Every issue body is in `/home/user/research/mauscode-issues.md` (15,168 lines). Each body opens with the repository's `AGENTS.md` verbatim, then the step.
- Every CodeRabbit coding plan is digested in `/home/user/research/mauscode-plans.md`, built from `gh api repos/maus-inc/mausCode/issues/{n}/comments`.
- The roadmap index (#48) claims each step is committed under `.dump/app/roadmap/`. It is not: `gh api repos/maus-inc/mausCode/contents/.dump/app/roadmap` returns 404 and the recursive tree has no `.dump` path. The issues are the only copy of the step text, which is why they were saved.
- The plans repeatedly name files that do not exist in that checkout: no test runner, no `.github/`, no `.dump/`, no `run_events` table, no credential store. Treat each step as intent and re-ground it against BetterShape, which is what the verdict column does.
- Two issues have no usable plan: #4 (step 02) and #44 (step 42) carry `INCOMPLETABLE_TASK`. Their work is authored in D01 and this file respectively.
- mausCode's two critical gates are #12 (step 10, permission floor) and #13 (step 11, secrets). In this plan they are D03 and D04, and they come before any unattended work, which is the ordering mausCode intended but did not enforce.

Verdicts:

| Verdict | Meaning |
| --- | --- |
| `port` | The step's intent survives with its mechanism adapted to BetterShape's architecture. |
| `build` | BetterShape has no equivalent, and the step needs new code with no upstream reference. |
| `extend` | A BetterShape surface already does part of it; the step is the missing half. |
| `shipped` | The step already exists in BetterShape; the row says what to verify, not what to write. |
| `not applicable` | The step depends on a surface BetterShape does not have, and adding that surface is not worth its cost. |

## The 45 steps

| Step | Issue | mausCode title | Verdict | Lands in | What we take, and what changes |
| --- | --- | --- | --- | --- | --- |
| 01 | #3 | Make the instruction files describe the tree that exists | port | D01 | Rewrite `AGENTS.md` and `DESIGN.md` against the real tree; the mausCode version describes files it does not have. |
| 02 | #4 | Write the gate policy down so baselines cannot drift silently | extend | D01 | The gate exists; add recorded baselines (bundle size, test count, lint count) and a script that fails on drift. No new gate. |
| 03 | #5 | Prove the app builds end to end and record the numbers | extend | D01, D32 | The build exists; record cold build time, bundle size, and install size in the same baseline file. |
| 04 | #6 | Answer the four program decisions that gate later steps | shipped | plan ADR-01 to ADR-20 | The decisions are answered in the plan. No code. |
| 05 | #7 | Give Codex one default model constant | port | D19 | One model default table replaces scattered literals; BetterShape has no Codex process, so the table covers its own providers. |
| 06 | #8 | Wire or delete the shortcuts that do nothing | port | D13 | The when-clause config file, plus a startup check that names unbound declared shortcuts. |
| 07 | #9 | Record run state in the database so runs stop lying | build | D08 | `runs` plus a single-writer coordinator; BetterShape has no run table at all. |
| 08 | #10 | Move the queue out of React and onto the run record | port | D09 | Queue items attach to a run id; the store becomes a view over rows, not the source of truth. |
| 09 | #11 | Map the harness events that vanish today | build | D08 | The 23 run-scoped event kinds and the durable cursor. |
| 10 | #12 | Put a permission floor under every agent action | port | D03 | Critical gate. Rules, argv matching, immutable floor, receipts. |
| 11 | #13 | Keep every secret in one store and make the fallback loud | port | D04 | Critical gate. One store, three backends, consent, redaction. |
| 12 | #14 | Move the SDK and binary pins together and register the missing tools | extend | D05, D32 | The tool registry is D05; the pins and the release manifest are D32. BetterShape has no SDK bridge to pin. |
| 13 | #15 | Persist pull request state as a snapshot with provenance | port | D16 | PR snapshot keyed by `(repo, number, head_sha)`; 60 s ETag. |
| 14 | #16 | Ship a real changeset, export and pull request | port | D16 | Changeset export and PR draft, using the existing GitHub auth. |
| 15 | #17 | Detect repo, branch and pull request state in the sidebar | port | D16 | One repository-state probe, cached, with a typed "detached HEAD" state. |
| 16 | #18 | Fix failing CI from the app, bounded, with PR feedback | build | D31 | New loop with a signature and an attempt cap; the local gate before any push. |
| 17 | #19 | Make sub-chat creation instant and ordering real | port | D10 | Settle, snooze, and stable ordering; creation returns before the first token. |
| 18 | #20 | Make multi-pane behaviour correct | port | D22 | One split tree, focus, persistence, two-pane cap. |
| 19 | #21 | Let sub-chats fan out, be supervised and report back | port | D25 | Orchestrator with a child-run tree and a report contract. |
| 20 | #22 | Add critics for plans and patches, with bounded rounds | extend | D26 | Upgrade the existing two-critic debate to a schema, a gate, and two rounds. |
| 21 | #23 | Run scheduled tasks locally and own commit authorship | port | D24 | Local scheduler with a claim transaction, battery and concurrency guards, authorship policy. |
| 22 | #24 | Mine TODOs and performance findings into an inbox, with a label trigger | port | D21 | One suggestions table and three producers; the inbox is a panel, not a new app section. |
| 23 | #25 | Load instructions so they survive the context budget | build | D12 | Discovery, budget, cut order, stable hash. BetterShape has no loader. |
| 24 | #26 | Give the agent a memory it can show and audit | build | D28 | Provenance, approval, decay, and volatile-only recall. |
| 25 | #27 | Improve the review and composer surfaces users touch hourly | port | D16, D07 | Stacked diff mode, code panel width persistence, pinned files, task dialog. |
| 26 | #28 | Expose a loopback session API and no-repo scratch sessions | build | D06 | Bearer-gated `127.0.0.1`, scratch sessions, promotion by patch. |
| 27 | #29 | Add the research lane with an egress policy | build | D27 | Policy object, pinned resolver, records, honest capability descriptor. |
| 28 | #30 | Give MCP one source of truth | extend | D19, D25 | BetterShape has an MCP registry; add the `mcp_servers` store, provider projections, and one router. D25 consumes it. |
| 29 | #31 | Clear the critical advisories and promote the audit gate | extend | D01, D32 | `npm audit` ratchet in `ci.yml`; the workflow exists, the gate does not. |
| 30 | #32 | Make the renderer build fit its memory budget and hold it there | extend | D01, D32 | A bundle budget file and a failing check; BetterShape already lazy-loads some heavy viewers. |
| 31 | #33 | Fix identity drift and repository hygiene | extend | D01 | One identity constant, undeclared dependencies fixed, generated files marked. |
| 32 | #34 | Ship the release workflow with unsigned artifacts and checksums | extend | D32 | The workflow exists; add `SHA256SUMS`, manifest verification, and the unsigned marker. |
| 33 | #35 | Build the environment import flow | build | D30 | Five stages, manifest, rollback, no secret import. |
| 34 | #36 | Decide the remote placement profile, and park it until then | extend | D33 | The parked decision becomes a real transport plugin with session moves. |
| 35 | #37 | Close the Codex app-server schema and parity gaps | not applicable | none | BetterShape has no Codex app-server bridge; adding one is a new integration, not a port. If it is ever wanted, it is a D05 sidecar. |
| 36 | #38 | Finish the harvested provider and sidebar payload | port | D11, D21 | Usage footer from provider quota events, restore last chat, chat reorder. |
| 37 | #39 | Decide the sidebar lineage and ship reorder, archive and emoji picker | port | D21 | One ordering column, archive, accent and emoji. |
| 38 | #40 | Install skills and manage third-party tooling | extend | D29 | The vendored tree and verifier exist; add install, enable, and the tooling inventory. |
| 39 | #41 | Give the security boundaries a test suite and a finding record | extend | D03, D04, D27 | One test per floor rule, one per redaction pattern, one per egress class; findings live in `gap-register.md`. |
| 40 | #42 | Add release configuration, the banner model and changelog URLs | extend | D32 | Config module, pure banner selector, built changelog URL. |
| 41 | #43 | Ship the run audit trail, the acceptance-record convention and i18n groundwork | extend | D08 | The audit trail is D08. Acceptance records stay in the dossier; i18n is deferred until the interface settles, as mausCode's own plan suggests. |
| 42 | #44 | Close the harvest ledger | shipped | this file, `upstream-read-ledger.md` | A program-management step. The ledger is the artifact; no code. |
| 43 | #45 | Distil skills from finished work and load them by disclosure | build | D29 | Proposal with provenance, diff, accept; disclosure already scoped. |
| 44 | #46 | Search past sessions and let memory decay | build | D28 | FTS5 over messages plus the decay job. |
| 45 | #47 | Remove the built-in app sign-in | not applicable | none | BetterShape has no built-in sign-in and no hosted identity gate. Nothing to remove; provider OAuth stays. |

Counts: 17 `port`, 10 `build`, 14 `extend`, 2 `shipped`, 2 `not applicable`. Every step has an answer.

## Milestones against the merge order

| mausCode milestone | Steps | Merges as |
| --- | --- | --- |
| M1 foundation | 01 to 09 | D01, D08, D09, D13 |
| M2 safety and PRs | 10 to 15 | D03, D04, D16 |
| M3 supervised work | 16 to 21 | D10, D22, D24, D25, D26, D31 |
| M4 context and memory | 22 to 26, 29 to 31 | D01, D06, D12, D21, D28, D32 |
| M5 research and environment | 27, 28, 32 to 35 | D25, D27, D30, D32, D33 |
| M6 cleanup and release | 36 to 45 | D03, D04, D08, D11, D21, D27, D28, D29 |

Milestones are mausCode's grouping, not the merge order: a step lands in the stage where BetterShape's matching surface arrives, so step 05 lands in D19 and steps 36 and 37 land in D21 even though their milestones are earlier. The dossier column is authoritative.

The ordering differs from mausCode on purpose. mausCode put unattended work (16, 19 to 22, 26, 27, 43, 44) behind the two critical gates but still inside M3 to M6. This plan puts D03 and D04 in stage 1, before the plugin host and before any transport, because a plugin with ambient authority over an agent that can run commands is exactly the combination those gates exist to prevent.

## What is deliberately not taken

| mausCode idea | Why not |
| --- | --- |
| Electron main/renderer split, tRPC, Drizzle | BetterShape is Tauri with Rust commands and a SQLite store; porting the stack is a rewrite. |
| A background daemon for unattended runs | D24 runs the scheduler in process and D08 records the state; a daemon adds a second lifecycle with no user-visible gain. |
| The Claude Agent SDK bridge and Codex ACP bridge | BetterShape owns its model loop; a bridge would be a second loop. |
| i18n groundwork before the interface settles | mausCode's own plan flags this; the copy is still moving. |
| A separate "harvest ledger" process | The reading ledger already exists and is updated per revision. |
| `safeStorage`-style Electron crypto | D04 uses the OS keyring; Electron's API is not available in Tauri. |

## What is taken that mausCode did not have

- A real permission rule compiler with argv matching (mausCode's step 10 had a TOML table and no parser).
- A plugin host with capability grants (mausCode had no plugin system).
- Session portability and remote transports (mausCode's step 34 parked the decision).
- A CI loop with a local gate before push (mausCode step 16 had no gate of its own).
- A theme engine and model variant system from opencode, which no mausCode step covers.

## How to use this file when opening issues

1. Open the dossier named in "Lands in" first. The dossier carries the title, labels, body, acceptance criteria, and prompt.
2. If a step has two targets, open the earlier one. The later dossier carries the remaining row and a dependency on the first.
3. If the verdict is `shipped`, do not open an issue; the row is a verification note for the dossier that follows.
4. If the verdict is `not applicable`, do not open an issue; the rationale is the record.
5. When a dossier covers several steps, paste the step numbers into the issue body under "Roadmap source" so the mausCode trace survives.
