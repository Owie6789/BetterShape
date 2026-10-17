# D08: Run records, the event log, and the audit trail

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/08-run-records`) |
| Roadmap source | mausCode steps 07, 09, 41 (issues #9, #11, #43) |
| Issue title | `D08: Run records, the event log, and the audit trail` |
| Labels | `port`, `dossier:08`, `area:core`, `size:M`, `stage:2` |
| Depends on | D01 (SQLite store, receipts, turn coordinator), D02 (failures), D06 (cursor contract) |
| Blocks | D09 (queue), D11 (usage), D24 (schedules), D25 (orchestration), D31 (CI loop), D33 (remote) |
| Effort | 14 days |

**Port verdict: BUILD. mausCode steps 07, 09, and 41 all say the same thing from three angles: a run's state, its events, and its audit record must be durable, or the UI lies after a restart. BetterShape keeps all three in memory and in a JSON blob that is rewritten wholesale.**

## 1. Today

`AgentState` (`agent/models/mod.rs:258`) holds the live turn: `current_conversation_id`, cancel tokens, pending approvals (`:275`, `:280`), and generation flags. `is_generating_conversation`, `conversation_cancel_token`, and `clear_pending_approvals` (`:979`) are the state machine. `send_chat.rs:291` clears approvals at turn start.

Consequences:

- Restarting the app loses every pending approval and every in-flight turn. The transcript keeps a half-written assistant message and no explanation.
- The sidebar's "working" dot is inferred. There is no record that says a run started, what model it used, how much it cost, or who approved a command.
- Events are `app.emit` calls with free-form payloads (`agent-stream`, `agent-browse`, `chat_renamed`). Nothing can be replayed, so the loopback API in D06 serves a bounded in-memory ring.
- Usage is appended to `usage_ledger` by D01-B1 only when a turn completes; a failed turn leaves no cost row and no reason.

## 2. Schema

Added in one migration; every table is additive.

```sql
CREATE TABLE runs (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  turn_id        TEXT NOT NULL,
  parent_run_id  TEXT,
  origin         TEXT NOT NULL,   -- user | queue | schedule | api | subagent | plugin | move
  state          TEXT NOT NULL,   -- queued | running | waiting_approval | waiting_input |
                                  -- cancelling | done | failed | cancelled | orphaned
  provider       TEXT,
  model          TEXT,
  effort         TEXT,
  started_at     INTEGER NOT NULL,
  ended_at       INTEGER,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_micros    INTEGER,
  error_kind     TEXT,
  error_code     TEXT,
  execution_location TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX runs_session ON runs(session_id, started_at DESC);
CREATE INDEX runs_open ON runs(state) WHERE state IN ('queued','running','waiting_approval','waiting_input','cancelling');

CREATE TABLE run_events (
  run_id     TEXT NOT NULL,
  seq        INTEGER NOT NULL,   -- per run, gap-free
  at         INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,      -- JSON, already redacted
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE run_summaries (
  run_id       TEXT PRIMARY KEY,
  tool_calls   INTEGER NOT NULL,
  failed_tools INTEGER NOT NULL,
  bytes_written INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  summarized_at INTEGER NOT NULL
);

CREATE TABLE run_approvals (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  tool       TEXT NOT NULL,
  action     TEXT NOT NULL,      -- JSON: argv, paths, hosts
  decision   TEXT NOT NULL,
  rule_id    TEXT,
  scope      TEXT NOT NULL,
  at         INTEGER NOT NULL
);
```

`runs` is the source of truth for state; `run_events` is the audit trail. A cost row is written at `started_at` with nulls and completed at the end, so a crashed run still occupies a row with `state='orphaned'`.

## 3. One writer

Only the turn coordinator (D01-B3) mutates `runs.state`. Every transition is a single transaction that updates the row and appends one `run_events` row with the next `seq`. The coordinator exposes:

```rust
pub fn begin(req: BeginRun) -> Result<RunId, Failure>;
pub fn transition(run: &RunId, to: RunState, event: RunEvent) -> Result<(), Failure>;
pub fn finish(run: &RunId, outcome: RunOutcome) -> Result<(), Failure>;
```

A transition that is not in the allowed set is rejected with `invalid_transition` and logged; it does not silently clamp. The allowed set is one table in `agent/run/state.rs`, and a test enumerates it.

After commit, the coordinator publishes the same event to the D05 bus with the `run_events.seq` as the cursor. The bus publish happens outside the transaction; if the process dies between commit and publish, a subscriber reconnecting with its cursor reads the durable log and catches up. That is the outbox rule: durable first, broadcast second.

## 4. Event kinds

Twenty-three run-scoped kinds, one enum, each with a schema-versioned payload. Plugin, memory, and critic events ride the same bus (D05) but are not run events:

| Group | Kinds |
| --- | --- |
| Lifecycle | `run.started`, `run.completed`, `run.failed`, `run.cancelled`, `run.orphaned` |
| Model | `provider.request`, `provider.first_token`, `provider.retry`, `usage.recorded` |
| Tools | `tool.requested`, `tool.approved`, `tool.denied`, `tool.started`, `tool.finished` |
| Workspace | `file.edited`, `patch.applied`, `checkpoint.created` |
| Context | `context.assembled`, `compaction.started`, `compaction.finished`, `title.updated`, `summary.updated` |
| Movement | `move.started`, `move.finished` |

Payloads carry ids and counts, never file contents or prompts. `provider.request` records model, effort, message count, and a hash of the request body; the body itself is not stored. That hash is what makes "the same turn, replayed" comparable without retaining user text twice.

## 5. Crash recovery

On startup, before the window shows:

1. Mark every `running` or `cancelling` run as `orphaned` with `error_code = interrupted_by_restart`.
2. Mark every `waiting_approval` or `waiting_input` run as `orphaned` with `error_code = interrupted_by_restart` too. The in-memory approval and input requests died with the process, so no answer can ever arrive and the run would otherwise sit open forever. The transcript tail keeps the last known stage so the user can see what was pending.
3. Append one `run.orphaned` event per run marked in steps 1 and 2, with the last known stage.
4. If the session has a checkpoint newer than the run start (D15), mark the transcript tail as `interrupted` and offer "Resume from checkpoint" and "Discard partial turn".
5. Never auto-resume. Auto-resume plus a provider retry is how a user gets charged twice for the same turn.

## 6. Replay and audit

- `GET /sessions/:id/events?cursor=<seq>` reads `run_events` ordered by `(at, run_id, seq)`. The cursor is opaque base64 of `{at, run_id, seq}`. A cursor from the future returns an empty stream and a `cursor_ahead` warning. This replaces D06's `410 cursor_expired` for cursors within retention; outside retention it still returns `410` with the oldest available cursor.
- `GET /sessions/:id/audit` returns runs, approvals, and events in one JSON document for one session. `?format=jsonl` streams it. The export excludes prompts and file contents by default; `include=content` is a separate explicit flag and is refused for sessions marked confidential.
- Retention: events older than 90 days are aggregated into `run_summaries(run_id, tool_calls, failed_tools, bytes_written, duration_ms)` and deleted. `runs` rows are never deleted while they carry cost.

## 7. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/migrations/0002_runs.sql` | schema |
| `src-tauri/src/agent/run/{mod,state,store,events,recover,audit}.rs` | coordinator-facing API |
| `src-tauri/src/agent/commands/{send_chat,streaming,approvals}.rs` | call `begin`/`transition`/`finish`; delete ad-hoc flags |
| `src-tauri/src/agent/tools/dispatch/common.rs` | `record_tool_event` writes `tool.*` events |
| `src-tauri/src/session/api/routes.rs` | durable cursor query |
| `features/agent/run/*`, `features/session/audit/*` | live state and audit view |

## 8. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | migration, store, state table, `begin/transition/finish` | 3 |
| P1 | wire `send_chat`, streaming, approvals, and tool dispatch | 3 |
| P2 | event kinds, payload schemas, redaction, bus publish | 3 |
| P3 | durable cursor query, retention job, audit export | 2 |
| P4 | crash recovery, orphan flow, resume prompt | 2 |
| P5 | tests: transition matrix, gap-free seq, restart, retention | 1 |
| | **total** | **14** |

## 9. Acceptance criteria

1. Every turn produces exactly one `runs` row with a non-null `origin`, `state`, `started_at`, and `execution_location`.
2. A test walks 1,000 random transitions through the state table and asserts only allowed edges commit and `seq` stays gap-free per run.
3. Killing the process during a turn and restarting marks the run `orphaned`, writes one `run.orphaned` event, and shows the resume prompt; no auto-resume occurs.
4. `GET /sessions/:id/events?cursor=0` returns every retained event in order; reconnecting with the last cursor returns only new events.
5. Restarting with 95-day-old events deletes them, writes one `run_summaries` row per run, and leaves `runs.cost_micros` intact.
6. `/audit` contains approvals with the same `rule_id` and `scope` the prompt recorded (D03), and contains no prompt text unless `include=content`.
7. A failed turn has `error_kind`/`error_code` from D02 and a cost row that records tokens spent before the failure.
8. The sidebar's working indicator reads `runs.state`, not a separate boolean; two windows agree after a refresh.
9. The D05 bus subscriber that misses a publish can catch up from `run_events` with no duplicate events.
10. The full gate passes.

## 10. Traps

- **Do not write the event log from the UI.** The coordinator is the only writer, or the log becomes a second source of truth with gaps.
- **Do not store the request body.** Hash it. Storing prompts in the audit trail creates a second copy of sensitive text with a longer retention than the transcript.
- **Do not update `runs` outside a transaction with its event.** A row without an event is an unexplained state; an event without a row is a lie.
- **Do not delete open runs during retention.** Only terminal states are aggregated.
- **Do not let `origin` default to `user`.** A scheduler run labelled `user` corrupts every "who started this" question; the field is required at `begin`.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/08-run-records.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D08: Run records, the event log, and the audit trail. Scope: the `runs`, `run_events`, and `run_approvals` schema, the single-writer coordinator API with an explicit transition table, 23 event kinds with redacted payloads, durable cursor replay, retention and aggregation, audit export, and crash recovery with an explicit orphan state. Do not build the queue (D09), do not build the audit UI beyond the list and export, do not change the streaming protocol the model sees, and do not auto-resume an interrupted run.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/08-run-records` from the current `draft/mega-absorb-all` only after dossier 07 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
