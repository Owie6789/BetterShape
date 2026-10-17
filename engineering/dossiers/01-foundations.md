# D01: BetterShape foundations and gap remediation

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/01-foundations`) |
| Issue title | `D01: BetterShape foundations and gap remediation` |
| Labels | `port`, `dossier:01`, `area:core`, `size:L`, `stage:1` |
| Depends on | none |
| Blocks | D07, D09, D15, D10, D11, D16, D14, D24, D25, D19, D22 |
| Effort | 25.5 days |

**Port verdict: DO THIS FIRST. Six of the ten ports in this plan need a durable store, a command receipt, or an honest update path. Building those on top of the current JSON-per-conversation model would create three parallel sources of truth.**

This dossier has two halves. Part A fixes documented gaps that the earlier plan listed and that a fresh read shows are partly stale. Part B is the foundation work that every other dossier quietly assumes.

## Part A: the gap report, re-verified

`.github/SERVER_INDEPENDENCE.md` was verified at commit `71b776d`. The tree is now `289b134`. Three of its nine gaps are stale:

| gap | report claim | current tree | action |
|---|---|---|---|
| 5, Windows dictation unreachable | nothing calls `dictation_start`, nothing listens | `lib/editor/dictation.ts` records and encodes WAV, `commands.ts:1095-1097` invoke `dictation_start/stop/push`, `dictation-button.tsx` listens for `dictation-text` and re-broadcasts | **closed**; fix the report |
| 8, status bar never mounted | complete but unmounted | `features/agent/layout.tsx:678` renders `{project_path ? <Status /> : null}` | **closed**; the remaining work is a design pass, not a mount |
| 7, `chat_renamed` duplicate | keep one | verify at runtime | low priority cleanup |

The remaining gaps are real:

1. **Update check is inert.** `checkForAppUpdates` returns `upToDate` without any network call, and `downloadAndInstallUpdate` tells the user to visit GitHub. The titlebar chip, dismissal storage, and `describeUpdateStatus` are already built and waiting.
2. **Icon CDNs.** Simple Icons and DuckDuckGo favicons fail offline with no cache.
3. **MCP registry search** requires the network every time.
4. **Composio base URL** is hardcoded to `backend.composio.dev`.
5. **`agent-design-pick-pending`** has no listener; the turn blocks silently if the user scrolls away.
6. **Editor menu actions with no engine.** Go to Definition, References, Rename, Quick Fix, Organize Imports, and Inline Edit dispatch `bettershape-editor-action` and nothing handles them. There is no LSP in the repo, yet `lib/settings/store.ts` carries `lsp.typescript`, `lsp.css`, `lsp.html`, `lsp.json`, and `lsp.tailwindcss` flags. The settings promise a capability the app does not have.

### A1. Update check (2 days)

Rust command `check_app_update()`:

```
GET https://api.github.com/repos/<repo>/releases/latest
headers: Accept: application/vnd.github+json, User-Agent
compare: semver(release.tag_name) > app.package_info().version
return { available, version, notes, url, published_at }
```

Rules:

- No silent install. The action is "Open release page".
- Cache the response for 24 hours and respect the `autoUpdate` setting.
- Handle rate limiting (60 requests per hour unauthenticated) by caching and by showing the last known result with its timestamp.
- Never send telemetry; the request is a plain GET to GitHub.
- The repository slug must come from build metadata, not a hardcoded string, so forks work.

### A2. Editor actions (choose one, 1 day)

Either delete the six menu items or implement them. Deleting is the honest choice until an LSP exists. If they stay, add a single `unavailable` handler that shows "Language server not configured" rather than doing nothing silently.

Building an LSP client is a separate project (process lifecycle, JSON-RPC, document sync, diagnostics, ~2,000 lines minimum). Put it on the long list, not this plan.

### A3. Offline caches (2 days)

- Icon cache: content-addressed files under app cache, 30 day TTL, stale-while-revalidate. On network failure, use the cached icon; if absent, render a deterministic monogram.
- MCP registry: cache the last response with an ETag, allow a custom registry URL, and show "showing cached results from {date}" when offline.

### A4. Composio base URL (half a day)

Add `composio_base_url` to plugin settings, validate it is http(s) and not a bare host, and pass it to the client.

### A5. Design pick pending (1 day)

`lib/agent-preview/store.ts` already records the pending pick. Render a status chip in the titlebar or a toast: "Waiting for a design pick" with a jump-to action. Clear it when the pick is submitted or the turn ends.

## Part B: foundations the ports need

### B1. A durable store (6-8 days)

Current state:

- Conversations: JSON files per project under `chat_history/` (`agent/commands/history.rs`, 458 lines), merged on save.
- Checkpoints: JSON per conversation (`checkpoints.rs`, 65 lines).
- Settings: JSON.
- Usage: in-memory per-turn meter plus `MessageStats` on each message.
- No PR links, no scheduled tasks, no draft store, no queue persistence.

Every dossier in this plan adds one of those. Doing each as another JSON file produces five stores with five consistency models.

Recommendation: **SQLite for derived and operational data, JSON stays for transcripts.**

```
sqlite (app data / bettershape.db)
  conversations(id, project_path, title, created_at, updated_at,
                settled_override, settled_at, snoozed_until, ...)
  messages(id, conversation_id, idx, role, created_at)         // index only
  usage_ledger(...)                                             // D11
  scheduled_tasks, scheduled_task_runs                          // D24
  pull_request_links                                            // D16
  drafts                                                        // D07
  queue_items                                                   // D09
  checkpoints(id, conversation_id, message_index, scope_id, ...) // D15
  checkpoint_blobs(hash, bytes)                                 // D15
  keybindings? no, config file                                  // D13
```

Transcript bodies remain in the existing JSON files, addressed by conversation id. The database stores what queries need: order, status, timestamps, counters. This is the same split t3 makes between event storage and projections, minus the Effect machinery.

Migration: on first launch, scan existing JSON, insert rows, record a schema version. Keep the JSON as the source of truth for message bodies; if the DB and JSON disagree about a conversation's existence, the JSON wins and the DB is repaired.

Why SQLite and not sled or a custom format: BetterShape already needs SQL for usage aggregation and scheduled tasks; `rusqlite` is mature, synchronous, and easy to test; the index already wants FTS for search (D10 find).

### B2. Command receipts and idempotency (3 days)

D25's MCP server and D09's queue both need "run this command once even if the caller retries".

Add to the Rust command layer:

```rust
struct CommandReceipt { command_id: String, kind: String, result: serde_json::Value, at: i64 }
```

- Every mutating command that can be retried takes an optional `command_id`.
- Before executing, look up the receipt; if present, return the stored result.
- A receipt records the outcome, not just a success. `result` carries `{status: "ok" | "error", value | failure}`. A retry with a matching `command_id` whose stored status is `error` re-executes rather than replaying the cached failure, so a transient failure stays retryable. A stored `ok` is replayed as-is. This is what D02's `Retry::now` relies on: the receipt makes a successful call idempotent without freezing a failure.
- After executing, store the receipt with a TTL (7 days) and a cap (10,000 rows). Only `ok` results are replayed; an `error` receipt is advisory and is overwritten by the next attempt with the same id.
- Tauri IPC calls do not need it; MCP calls and scheduled tasks do.

This is 200 lines and it prevents a whole class of duplicate sends, duplicate subagents, and duplicate scheduled runs.

### B3. A single turn lifecycle owner (4 days)

Today the turn lifecycle is spread across `run_turn.rs`, `streaming.rs`, `send_chat.rs`, `approvals.rs`, and frontend state in `use-chat-session.ts` (1,927 lines). Events are strings (`chat_complete`, `chat_title`, `bettershape-file-edited`, and 51 others).

The ports add: queue dispatch, scheduled dispatch, MCP dispatch, subagent completion delivery, and handoff. Each needs to know "is this conversation running, and what is the current turn id".

Recommendation: a `TurnCoordinator` in Rust that owns:

```
start(conversation_id, input) -> turn_id
cancel(turn_id)
state(conversation_id) -> { status, turn_id, started_at }
subscribe() -> stream of TurnEvent
```

with a closed enum of events instead of ad hoc strings. The frontend `use-chat-session` subscribes to one stream. This is the single highest-leverage refactor in the plan because it removes the races that the queue and MCP dossiers would otherwise inherit.

Do not port t3's Effect-based orchestrator. Port the **ownership boundary**: one place decides whether a turn may start, and everything else asks it.

### B4. Event naming and audit (1 day)

The server independence report found 51 emitted events and 4 with no frontend mention. Two of those are now used. Add a test that parses every `app.emit("...")` in Rust and asserts each name appears in the frontend or in an explicit allowlist of intentionally internal events. This is cheap and prevents dead events from accumulating.

### B5. Settings schema versioning (2 days)

Every new feature adds settings. The current store is a single JSON blob. Add:

- `settings_version` integer.
- Forward migrations with tests.
- A `settings_export` / `settings_import` pair (JSON, no secrets).
- Unknown keys preserved on write, so a downgrade does not destroy a newer build's settings.

## Part C: sequencing against the ports

| foundation | blocks |
|---|---|
| B1 SQLite | D07, D09, D15, D10, D11, D16, D24 |
| B2 receipts | D24, D25 |
| B3 turn coordinator | D09, D24, D25 |
| B5 settings versioning | D13, D24, D19, D21 |
| A1 update check | nothing, ship anytime |
| A3 caches | nothing, ship anytime |

The recommended order is A1, B5, B1, B2, B3, then the feature waves. B1 and B3 are the two that justify a dedicated wave zero.

Part D rows 29 to 31 (the audit ratchet and the bundle budget) add 2 days to this dossier; the other rows are records and tests inside A2, B4, and the security dossiers.

## Part D: roadmap hygiene rows (mausCode steps 01, 02, 03, 29, 30, 31, 39, 41)

These steps are not features; they are the baselines and records that make the rest of the chain honest. They land in this dossier because it is the first PR and because every later gate references them.

| Row | Work | Acceptance |
| --- | --- | --- |
| Step 01 | Rewrite `AGENTS.md` and `DESIGN.md` against the tree that exists; delete the stale light-theme note | every path named in `AGENTS.md` exists; a link check runs in `npm run lint` |
| Step 02 | Record baselines in `engineering/baselines.json`: test file count, bundle size after `build:runtime`, cold build seconds, hex literal count | a script fails when a value drifts beyond its stated tolerance |
| Step 03 | Record an end-to-end build proof: `npm ci` through `cargo build` with the commit and timings | the record is committed with the gate output, not pasted into a PR comment |
| Step 29 | Add an `npm audit --json` ratchet to `ci.yml` with a frozen critical baseline | a new critical advisory fails CI; a cleared one updates the baseline |
| Step 30 | Add a renderer bundle budget file and a failing check | the budget is a number in the repo, not a dashboard |
| Step 31 | One identity constant for app name, bundle id, and repository URL; fix undeclared dependencies | `grep` for a literal app name outside the constant returns nothing |
| Step 39 | One test per permission floor rule, one per redaction pattern, one per egress class; findings live in `gap-register.md` | the tests are red before their dossier and green after |
| Step 41 | The audit trail is D08; acceptance records stay in the dossier; i18n is explicitly deferred | the deferral is recorded in `gap-register.md`, not in silence |

## 4. Effort

| item | days |
|---|---:|
| A1 update check | 2 |
| A2 editor actions decision | 1 |
| A3 offline caches | 2 |
| A4 Composio URL | 0.5 |
| A5 design pick status | 1 |
| B1 SQLite store and migration | 7 |
| B2 command receipts | 3 |
| B3 turn coordinator | 4 |
| B4 event audit test | 1 |
| B5 settings versioning | 2 |
| **total** | **23.5** |

## 5. Acceptance criteria

1. The update check reports the actual latest GitHub release, caches for 24 hours, and never installs silently.
2. No editor menu item is a silent no-op; each either works or says why it cannot.
3. Icons and MCP registry results render offline from cache, with their age visible.
4. All operational data lives in one SQLite database with a schema version and a tested migration from the current JSON state.
5. Replaying a mutating command with the same `command_id` returns the stored `ok` result and performs no second side effect. A stored `error` receipt does not block a retry with the same id; the retry re-executes and overwrites the receipt.
6. Exactly one component can start a turn for a conversation; a second start returns the existing turn id or a typed busy error.
7. Every emitted Rust event is either consumed by the frontend or explicitly allowlisted as internal.
8. A custom Composio base URL set in plugin settings is validated as http(s) and not a bare host, and reaches the client (A4).
9. The pending design pick shows a status chip that clears when the pick is submitted or the turn ends (A5).

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/01-foundations.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D01: BetterShape foundations and gap remediation. Scope: the SQLite store and migration, command receipts, the turn coordinator, settings versioning, the real update check, offline caches, the editor-action decision, the Composio base URL setting (A4), and the pending-design status chip (A5). Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/01-foundations` from the current `draft/mega-absorb-all`; this is the first dossier in the chain, so nothing precedes it. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
