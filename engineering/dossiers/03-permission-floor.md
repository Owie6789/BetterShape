# D03: Permission floor under every agent action

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/03-permission-floor`) |
| Roadmap source | mausCode step 10 (issue #12) |
| Issue title | `D03: Permission floor under every agent action` |
| Labels | `port`, `dossier:03`, `area:agent`, `size:M`, `stage:1` |
| Depends on | D01 (store, receipts), D02 (typed failures) |
| Blocks | D05 (grants), D27 (egress), D33 (remote execution) |
| Effort | 12 days |

**Port verdict: BUILD. mausCode step 10 is one of its two critical gates, and BetterShape has the pieces but no floor: a hardcoded trust list, per-surface approval mutexes, and a read-only mode that each gate a different subset of actions.**

Port the invariant, not the table: every agent action resolves through one ordered rule set, the default is ask, a deny cannot be argued away by the model, and every decision is recorded.

## 1. Today

| Concern | Where it lives | Gap |
| --- | --- | --- |
| Workspace trust | `agent/tools/dispatch/mod.rs:26` `TRUST_GATED_TOOLS` (21 names) | a name list, not a rule; no path or host scope |
| Read-only mode | `common::is_read_only_mode` in dispatch | applies to tools, not plugins or MCP |
| Terminal approval | `AgentState` pending map (`agent/models/mod.rs:275`), `approve_terminal_command` (`commands/approvals.rs:195`) | in memory, lost on restart, one mode for all commands |
| Edit approval | `AgentState` pending (`models/mod.rs:280`), `resolve_edit_approval` (`approvals.rs:223`) | staged edits, no path policy |
| Settings | `terminalApprovalMode`, `stageEdits`, plugin approval (`lib/settings/store.ts:130`) | three unrelated switches, no rules |
| Path checks | `agent/security/paths.rs` | canonicalisation helpers, no policy |
| Plugins | `plugin_run` is trust-gated | Composio actions use one global approval default |

There is no rule table, no project-level policy, no per-host network rule, and no record of who approved what. A prompt injection that talks the model into `run_terminal` gets the same treatment as a deliberate user request.

## 2. Model

### 2.1 One decision function

```rust
pub enum Decision { Allow, Ask { reason: String }, Deny { reason: String } }

pub struct Action<'a> {
    pub tool: &'a str,
    pub argv: Option<Vec<String>>,
    pub paths: Vec<PathBuf>,
    pub hosts: Vec<String>,
    pub plugin_id: Option<&'a str>,
    pub session_id: &'a str,
    pub turn_id: &'a str,
    pub read_only: bool,
}

pub fn decide(action: &Action) -> Decision
```

Every call site that can mutate state, spawn a process, touch the network, or write a file calls `decide` exactly once, before it does anything. `decide` is pure with respect to the action; it reads rules and active grants.

### 2.2 Rules

Stored in `permission_rules` (D01) and edited in Settings > Agent > Permissions. JSON, not TOML: the settings pipeline is already JSON with a version field (D01-B5), and a TOML parser is a new dependency for no user-visible gain.

```json
{
  "id": "prj-allow-tests",
  "match": {
    "tool": "run_terminal",
    "argvPrefix": ["npm", "run", "test"]
  },
  "action": "allow",
  "scope": "project",
  "reason": "Test runs are routine in this repository"
}
```

Match fields: `tool` (exact or `*`), `argvPrefix` (array, tokens not a string), `pathGlob`, `host`, `plugin`. All present fields must match. Missing fields match everything.

Order: `deny` rules first (most specific wins), then `allow`, then the built-in floor, then `ask`. A tie between two denies is resolved by rule id so evaluation is deterministic. There is no "last match wins".

Scopes: `once` (this call), `turn`, `session`, `project`, `global`. `once` and `turn` are in-memory receipts; `session`, `project`, and `global` persist. A persisted allow always names the rule that created it and shows in the audit view.

### 2.3 Built-in floor

Ships as immutable rules, `builtin: true`, cannot be edited or deleted, only tightened:

1. Writes outside the workspace root: deny.
2. Reads or writes of `.env`, `**/.ssh/**`, `**/.aws/**`, `**/.config/gh/hosts.yml`, `**/id_rsa*`: deny unless a global rule names the exact path.
3. `rm -rf /`, `format`, `diskpart`, `reg delete HKLM`, `shutdown`, `mkfs*`: deny.
4. `git push --force` to a protected branch, `git reset --hard` with uncommitted changes: ask with the branch and file count in the reason.
5. Any host not in the rule set: ask.
6. `plugin_run` for an unconnected integration: deny with an "Open Integrations" action.
7. Read-only mode: deny every mutating action, even if an allow rule matches.

The floor lives in `src-tauri/src/agent/security/floor.rs` as data, and a test asserts each entry's message.

### 2.4 Command matching

`argvPrefix` compares token arrays. The string form of a command is parsed once with a shlex-compatible splitter in `agent/security/argv.rs`. If parsing fails (unbalanced quote, here-doc, shell operator), the decision is `ask` with `unparseable_command`, never `allow`. `sh -c "..."` is always `ask` unless a rule matches the inner command after one level of unwrapping, and nested `sh -c` beyond one level is denied.

This is stricter than substring matching on purpose: `npm test` and `npm test && curl evil` must not share a rule.

### 2.5 Approvals

One component, `ui/approval/PermissionPrompt`, replaces the terminal and edit prompts. It renders: the action, the exact argv or path, the rule that matched, the scope choices, and a "why" expandable that names the requesting tool and turn. Keys: `y` allow once, `a` allow for session, `Shift+A` allow for project, `n` deny, `Esc` deny and stop the turn.

An approval is a receipt (D01-B2): `permission_decisions(id, session_id, turn_id, tool, action_json, decision, rule_id, scope, decided_at, decided_by)`. Replaying a turn never re-prompts for a decision that was already made in that turn.

The model cannot grant itself a scope. A tool argument named `remember`, `always`, or `permission` is stripped before the prompt renders, and the prompt's scope radio is host-controlled.

## 3. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/security/{mod,floor,argv,rules,decision}.rs` | evaluator and built-ins |
| `src-tauri/src/agent/security/paths.rs` | add `within_root`, `redact_user_path` |
| `src-tauri/src/agent/tools/dispatch/mod.rs` | replace `TRUST_GATED_TOOLS` early return with `decide` |
| `src-tauri/src/agent/tools/dispatch/{terminal,computer,files,meta}.rs` | pass argv/paths/hosts |
| `src-tauri/src/agent/commands/approvals.rs` | one approval path, receipt-backed |
| `src-tauri/src/agent/models/mod.rs` | remove the two pending maps once receipts land |
| `features/approval/*`, `features/settings/ui/pages/permissions/*` | prompt and rule editor |

## 4. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | rule schema, store, migration, built-in floor as data | 3 |
| P1 | evaluator, argv parser, path and host matching, determinism test | 3 |
| P2 | wire all 21 gated tools plus MCP and plugin calls through `decide` | 2 |
| P3 | approval prompt, scopes, receipts, audit list | 2 |
| P4 | per-rule tests (one per built-in), docs, migration of existing settings | 2 |
| | **total** | **12** |

## 5. Acceptance criteria

1. Every name in `TRUST_GATED_TOOLS` and every MCP tool call passes through `decide`; a test enumerates the dispatch match arms and fails if a mutating arm lacks a `decide` call.
2. A deny rule cannot be overridden by a tool argument, an allow-once from an earlier turn, or a system prompt instruction. Two tests: one at the evaluator, one at the turn loop.
3. `npm run test` allowed by a rule does not allow `npm run test && curl https://evil.example`. The unparseable case asks.
4. `../../etc/passwd` and a symlink that resolves outside the root are both denied, with the resolved path in the message.
5. Read-only mode denies a matching allow rule and says why.
6. Every decision writes one receipt row; the audit view lists turn, tool, decision, rule, and scope, newest first.
7. Restarting the app keeps project and global grants and drops `once`/`turn` grants.
8. The approval prompt is keyboard-complete, has focus trapped, and announces the decision to a screen reader.
9. No decision path returns `Allow` when the rule set is empty and the tool is mutating.
10. The full gate passes.

## 6. Traps

- **Do not parse the command twice.** The argv the prompt shows must be the argv the executor runs. Pass the parsed vector down, not the original string.
- **Do not let the floor be a substring list.** `rm -rf /tmp/x` is not `rm -rf /`; the matcher works on argv.
- **Do not store approvals as booleans on the conversation.** They are receipts with scope and provenance; D08 renders them.
- **Do not add a settings toggle per tool.** The rule editor is the only surface; three legacy switches become three seed rules.
- **Do not make "ask" the failure mode for a missing rule in a headless run.** A scheduler with no matching rule fails closed, not open.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/03-permission-floor.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D03: Permission floor under every agent action. Scope: one `decide` function, the rule schema and store, the immutable built-in floor, argv parsing and prefix matching, path and host scoping, receipts, one approval prompt with scopes, and the rule editor. Do not implement the plugin grant model (D05), do not build the secrets vault (D04), do not change the tool protocol the model sees, and do not keep any of the three legacy approval switches as a separate code path.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/03-permission-floor` from the current `draft/mega-absorb-all` only after dossier 02 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
