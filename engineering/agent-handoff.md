# Handing a dossier to a fresh agent

The dossiers are written to be run one at a time by a fresh chat with no memory of this planning session. This page is the short guide for the human driving those chats: what to paste, what to say when the agent drifts, and how to review before the branch merges.

## 1. The rule

One dossier per chat. One branch per dossier. One PR per branch, merged before the next dossier starts.

The numbering in `engineering/dossiers/` is the merge order. D07 is not started until D06 has merged, even if D07 looks independent. Every dossier's `Depends on` row assumes that order, and the plan's stage gates assume it too.

## 2. Before the first chat

The prompts tell the agent to read `engineering/dossiers/NN-*.md`. That file has to exist on the branch the agent works from.

- If `engineering/` is on `draft/mega-absorb-all`, do nothing.
- If it lives on a side branch, tell the agent to fetch it first. The prompt block in section 3 has a slot for that line.

A single docs commit with no parents, for keeping the plan off the app history:

```bash
git fetch origin arena/de274efa-app
tree=$(git rev-parse FETCH_HEAD:engineering)
commit=$(git commit-tree "$tree" -m "docs(plan): 33-dossier port chain")
git push origin "$commit":refs/heads/draft/upstream-port-plan
```

After that, an agent can read the plan without checking out the app:

```bash
git fetch origin draft/upstream-port-plan
git show FETCH_HEAD:engineering/dossiers/05-plugin-host.md
```

## 3. The kickoff message

Every dossier ends with a block under "Prompt for a fresh agent" that is already self-contained. Use it as the first message, then add two lines: the base branch and, if needed, where the plan lives.

```text
Base branch: draft/mega-absorb-all. Create dossier/NN-<slug> from it only after dossier NN-1 has merged.
Plan location: engineering/ on <branch>. Run `git fetch origin <branch>` before reading if it is not in your checkout.
```

Do not summarize the dossier in the first message. The dossier is the spec, and a summary competes with it. If you want to add context, add facts the dossier does not contain, such as "the last PR changed `foo.ts`, rebase before starting".

Recommended extras, one line each:

- `Work only on DNN. If you find work that belongs to another dossier, write it in the PR body under "Follow-ups" and leave it alone.`
- `Stop after the plan and the file list if anything in the dossier contradicts AGENTS.md or DESIGN.md, and tell me what the conflict is.`
- `Run the full gate before you call it done: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. Cargo fmt and clippy if you touched Rust.`

## 4. Referencing scope while it works

The failure mode is an agent that does the dossier plus three adjacent improvements. Keep references concrete:

| You want | Say |
| --- | --- |
| Progress | `Which section of the dossier are you in, and which acceptance criteria are already met?` |
| Less scope | `You are outside the dossier. Revert everything that is not named in sections 3 to 6, then continue from section 4.` |
| A decision explained | `Quote the dossier line that justifies this choice. If there is none, stop and ask.` |
| The gate | `Run the full gate now and paste the exact output, including warnings.` |
| Drift into another dossier | `That is DNN+1. Remove it, add a Follow-ups line to the PR body, and continue.` |
| A missing piece | `Add it only if the dossier names it. Otherwise propose it as a follow-up and wait.` |

Reference sections by number, not by description. "Section 5.2" is unambiguous; "the part about the queue" is not.

## 5. Review before merge

Read the PR against the dossier, not against your memory of the plan.

- Every acceptance criterion is either met or explicitly reported as not met with a reason.
- The diff touches the files the dossier names, plus their tests. Anything else needs a sentence in the PR body.
- No new dependency without a named reason. The gate list does not include one for a reason.
- No telemetry, no analytics, no remote logging beyond the network calls the dossier names.
- The traps section is checked line by line. Traps are the failure modes the dossier exists to prevent.
- The branch is one branch, based on the current base, with no merge commits from the base.
- The PR body names the dossier, the base commit it was cut from, and any follow-up rows it added.

## 6. When a dossier is wrong

It will happen. A line will reference a file that moved, or a constraint that no longer holds. The rule is the same as in `engineering/dossiers/README.md`:

1. Stop the agent.
2. Add a row to the earlier dossier's follow-ups section if the fix belongs there, or correct the current dossier if it is local.
3. Land the correction before the implementation continues, so the PR and the dossier do not disagree.

Do not let the agent silently deviate and do not rewrite the dossier to match whatever the agent built. The dossier is the record of why the work looks the way it does.

## 7. The chain

| Dossier | Branch | Size | Days | Stage | Issue title |
| --- | --- | --- | ---: | --- | --- |
| D01 | `dossier/01-foundations` | L | 25.5 | 1 | D01: BetterShape foundations and gap remediation |
| D02 | `dossier/02-failure-surfaces` | M | 9 | 1 | D02: Typed failure surfaces |
| D03 | `dossier/03-permission-floor` | M | 12 | 1 | D03: Permission floor under every agent action |
| D04 | `dossier/04-secrets-vault` | S | 8 | 1 | D04: Secrets vault with a loud fallback |
| D05 | `dossier/05-plugin-host` | XL | 26 | 1 | D05: Plugin host, manifests, capabilities, and the event bus |
| D06 | `dossier/06-session-portability` | L | 14 | 1 | D06: Session bundles, the loopback API, scratch sessions, and the move contract |
| D07 | `dossier/07-composer-core` | M | 13 | 2 | D07: Composer core, drafts, context records, and citations |
| D08 | `dossier/08-run-records` | M | 14 | 2 | D08: Run records, the event log, and the audit trail |
| D09 | `dossier/09-stash-and-queue` | M | 11 | 2 | D09: Prompt stash and queue control |
| D10 | `dossier/10-thread-management` | M | 14 | 2 | D10: Thread management: settle, snooze, titles, forks, and find |
| D11 | `dossier/11-usage-and-budgets` | L | 17 | 2 | D11: Usage, pricing, and budget controls |
| D12 | `dossier/12-context-assembly` | M | 10 | 2 | D12: Context assembly, instruction files, and the budget |
| D13 | `dossier/13-keybindings` | M | 12 | 2 | D13: Keybindings: when-clauses, conflicts, and a real config file |
| D14 | `dossier/14-worktrees-and-isolation` | L | 20 | 3 | D14: Worktrees, setup scripts, and cleanup |
| D15 | `dossier/15-rewind-and-checkpoints` | L | 17 | 3 | D15: Rewind, checkpoints, and rollback safety |
| D16 | `dossier/16-source-control-and-review` | XL | 27 | 3 | D16: Source control and review depth |
| D17 | `dossier/17-tool-calls-and-thinking` | M | 9 | 3 | D17: Tool call and thinking presentation |
| D18 | `dossier/18-theme-system` | M | 16 | 3 | D18: Theme system |
| D19 | `dossier/19-providers-and-models` | M | 13 | 4 | D19: Providers, instances, models, and handoff |
| D20 | `dossier/20-model-variants-and-verbosity` | M | 15 | 4 | D20: Model variants, reasoning effort, and verbosity |
| D21 | `dossier/21-mauscode-ui-systems` | L | 18 | 4 | D21: mausCode UI systems: kanban, voice, skills, commands, and agent browsing |
| D22 | `dossier/22-tabs-panes-and-composition` | XL | 55 | 4 | D22: Tab groups, panes, and the composition of the chat surface |
| D23 | `dossier/23-snapshot-preview-and-html` | M | 13 | 4 | D23: SnapShot, preview browser, HTML renders, and MCP apps |
| D24 | `dossier/24-scheduled-tasks-and-webhooks` | M | 14 | 5 | D24: Scheduled tasks and webhooks |
| D25 | `dossier/25-orchestrator-mcp-and-delegation` | L | 19 | 5 | D25: Orchestrator MCP, delegation, and cross-agent control |
| D26 | `dossier/26-critics-and-review-gates` | M | 10 | 5 | D26: Critics for plans and patches, with bounded rounds |
| D27 | `dossier/27-governed-research` | M | 10 | 5 | D27: The research lane and its egress policy |
| D28 | `dossier/28-memory-and-session-search` | L | 16 | 5 | D28: Auditable memory and search across past sessions |
| D29 | `dossier/29-skills-and-tooling` | M | 12 | 5 | D29: Skills, install, disclosure, and distillation |
| D30 | `dossier/30-environment-import` | M | 12 | 5 | D30: Environment import from other agent tools |
| D31 | `dossier/31-ci-failure-loop` | S | 8 | 6 | D31: The bounded CI failure loop |
| D32 | `dossier/32-release-engineering` | S | 8 | 6 | D32: Release artifacts, checksums, and an honest update check |
| D33 | `dossier/33-remote-backends-plugin` | XL | 34 | 6 | D33: Remote backends as plugins that move sessions |

## 8. If the agent cannot find the dossier

Three causes, in order of likelihood:

1. It is on the wrong branch. The prompt names `draft/mega-absorb-all`; if the plan lives elsewhere, add the fetch line from section 2.
2. It read a stale checkout. `git fetch origin && git log -1` should show the base commit named in the PR body.
3. The file name is wrong. `ls engineering/dossiers/` prints all 33; the number is the first two characters and the slug is the rest.
