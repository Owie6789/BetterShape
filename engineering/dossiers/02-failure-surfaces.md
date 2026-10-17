# D02: Typed failure surfaces

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/02-failure-surfaces`) |
| Issue title | `D02: Typed failure surfaces` |
| Labels | `port`, `dossier:02`, `area:core`, `size:M`, `stage:1` |
| Depends on | D01-B3 (turn coordinator) for turn-scoped failures |
| Blocks | nothing hard, but D09, D25, and D33 are worse without it |
| Effort | 9 days |

**Port verdict: BUILD. No upstream has this either, and every dossier in this plan adds a failure mode. BetterShape currently turns all of them into a string.**

Evidence: `AppError` has a `Message(String)` variant used at 461 call sites and serializes with `serialize_str`. The frontend displays the string. Tool status is partly inferred by searching text for "error" or a cross glyph (`features/chat/ui/blocks/turn.tsx:154`). There is no distinction between "the model refused", "the network dropped", "the sandbox is stopped", "you cancelled", and "this will never work".

That is survivable while every operation is local and synchronous. It is not survivable once D33 can lose a connection mid-turn, D09 can hold a prompt for an hour, and D25 lets another agent drive the app.

## 1. The problem, concretely

```
Rust:  Err(AppError::Message("failed to connect".into()))
         |
JSON:  "failed to connect"
         |
TS:    catch (e) { setError(String(e)) }
         |
UI:    a red line
```

Five different situations produce that line:

1. The SSH host key changed. The user must review a fingerprint, not retry.
2. The Daytona sandbox auto-stopped. Retry after resume works.
3. The provider returned 429 with `retry-after: 30`. Retry works, later.
4. The user pressed stop. This is not an error at all.
5. `git` is not installed. Retrying forever will not help.

The UI cannot tell them apart, so it does the only safe thing: shows text and a generic retry. That wastes the user's time and, for cases 1 and 4, actively misleads.

## 2. Design

### 2.1 One boundary type

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub kind: FailureKind,
    pub code: String,            // stable, machine-readable, e.g. "ssh_host_key_changed"
    pub message: String,         // one sentence, no stack, already redacted
    pub detail: Option<String>,  // expandable, redacted
    pub retryable: Retry,        // never | now | after | after_action
    pub retry_after_ms: Option<u64>,
    pub action: Option<FailureAction>,  // e.g. { label, id } for "Reconnect", "Open settings"
    pub scope: FailureScope,     // turn | tool | command | app
    pub cause_id: Option<String>,// correlation id for local logs
}

pub enum FailureKind {
    Cancelled, UserActionRequired, Permission, NotFound, Conflict,
    InvalidInput, Provider, Network, Timeout, RemoteUnreachable,
    RemoteStopped, Budget, Tool, Internal,
}
```

`Failure` implements `From<AppError>` with a classification function, and `AppError` stays as it is. The 461 call sites do not change. The boundary converts once, in the Tauri command wrapper, so every command returns the same shape.

`FailureAction` is a closed set: `retry`, `resume_target`, `reconnect_target`, `open_settings`, `review_host_key`, `switch_model`, `open_logs`. The frontend maps ids to handlers it already owns. No arbitrary callbacks over IPC.

### 2.2 Classification

A single `fn classify(err: &AppError) -> (FailureKind, &'static str, Retry)` table, plus explicit constructors at about fifteen high-value sites:

| Source | Kind | Code | Retry |
| --- | --- | --- | --- |
| `reqwest` connect error | Network | `network_unreachable` | now |
| `reqwest` timeout | Timeout | `network_timeout` | now |
| HTTP 429 with `retry-after` | Provider | `provider_rate_limited` | after |
| HTTP 5xx | Provider | `provider_unavailable` | after |
| HTTP 401/403 from provider | Provider | `provider_auth` | after_action |
| Streaming ends with no finish reason | Provider | `stream_truncated` | now |
| Context length exceeded | InvalidInput | `context_overflow` | after_action |
| Anthropic overloaded | Provider | `provider_overloaded` | after |
| Turn cancelled by user | Cancelled | `turn_cancelled` | never |
| Approval denied | Permission | `approval_denied` | never |
| Path outside root | Permission | `path_outside_root` | never |
| SSH host key mismatch | UserActionRequired | `ssh_host_key_changed` | after_action |
| SSH auth failed | UserActionRequired | `ssh_auth_failed` | after_action |
| SSH unreachable | RemoteUnreachable | `remote_unreachable` | after |
| Sandbox stopped | RemoteStopped | `target_stopped` | after_action |
| Sandbox TTL expired | RemoteStopped | `target_expired` | after_action |
| Git worktree add failed | Conflict | `worktree_failed` | after_action |
| File not found | NotFound | `file_not_found` | never |
| Disk full | Internal | `disk_full` | after_action |
| Budget exhausted | Budget | `budget_exhausted` | after_action |
| Anything else | Internal | `unexpected` | after_action |

The table is data, tested per row, and the fallback is deliberately the least useful one so that new code gets classified rather than guessed.

### 2.3 Redaction at serialization

`Failure.message` and `Failure.detail` pass through `redact()`:

- Values matching `boat_[a-zA-Z0-9]+`, `dtn_[a-zA-Z0-9]+`, `sk-[a-zA-Z0-9]{20,}`, `gh[pousr]_[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`.
- `Authorization: Bearer <...>` and `x-daytona-preview-token: <...>` headers.
- Signed preview URLs (`https://<port>-<token>.`) keep the host and drop the token.
- The home directory is replaced with `~`.

A unit test feeds a fixture of each shape through every path (`message`, `detail`, logs) and asserts the secret does not appear.

### 2.4 Retry

- `Retry::never`: the UI shows no retry button. Cancelled and permission failures render muted, not red.
- `Retry::now`: a retry button that re-runs the last step. Idempotency comes from D01-B2 receipts; a retried tool call passes the same `command_id`.
- `Retry::after`: the button is disabled with a countdown from `retry_after_ms`, then enables.
- `Retry::after_action`: the button is replaced by the action (Reconnect, Resume, Open settings, Review host key).

Retrying a turn re-sends from the last assistant message, not from the top. The transcript keeps the failed attempt collapsed under the retried one, the same way D17 collapses thinking rows.

### 2.5 Surfaces

Three components, one visual language:

1. `FailureRow` inside the transcript, for tool and command failures. Icon by kind, one line, expandable detail, action on the right. Replaces the current string rendering.
2. `FailureBar` above the composer, for turn failures that stopped generation. Keeps the draft, keeps attachments, offers the action.
3. `FailureToast` for background work (scheduled tasks, queue dispatch, subagent completion).

Rules:

- Cancelled is never red. It uses `--text-muted` and no icon emphasis.
- User-action-required uses `--warn`, not `--danger`, because nothing is broken yet.
- Only `Internal`, `Provider`, and `RemoteUnreachable` use `--danger`.
- Every failure row has an accessible name and is reachable by keyboard.
- No failure row contains a stack trace. Detail is the redacted provider message or the command's stderr tail, capped at 40 lines with a "copy" action.

### 2.6 Logging

- One line per failure at `warn` with `{code, kind, scope, cause_id}` and no message body. The body is already in the transcript.
- `cause_id` is a short random id, shown in the detail area as "Reference: a1b2c3" so a user can quote it.
- No telemetry, no remote sink. This is a local log file the user can open.

### 2.7 What stays a string

- Validation messages the user types into a form (settings, target config) stay plain strings; they are rendered by the form, not by the transcript.
- The agent's own tool result text stays a string, because it goes back to the model. `Failure` is for the human-facing layer. When a tool fails, the model still receives a text outcome and the UI receives a structured row. Do not change the tool protocol for this.

## 3. Files

New:

- `src-tauri/src/core/failure.rs` (type, classification, redaction, tests)
- `src-tauri/src/core/redact.rs` if redaction does not already exist as a module
- `features/chat/ui/failure/{failure-row.tsx,failure-bar.tsx,failure-toast.tsx,kind-icon.ts}`

Modified:

- `src-tauri/src/core/error.rs`: `impl From<AppError> for Failure`
- `src-tauri/src/lib.rs`: command wrapper returns `Failure` on error
- `features/chat/ui/blocks/turn.tsx` and `action-line.tsx`: use `FailureRow`, remove the substring status sniffing at line 154
- `features/chat/lib/use-chat-session.ts`: keep the last failure per turn, clear on success
- `lib/backend/commands.ts`: error type
- `features/terminal/ui/terminal.tsx`: exit code and signal become a `Failure` with `code: "command_failed"`

## 4. Port plan

### F0 - type, classification, redaction (4d)

- `Failure`, `FailureKind`, the table, `From<AppError>`, `redact`, tests for every row and every secret shape.
- The command wrapper emits the new shape. Frontend still stringifies it, so nothing breaks.

### F1 - surfaces (3d)

- `FailureRow`, `FailureBar`, `FailureToast`, kind icons, retry behavior with countdown, keyboard and screen reader pass.
- Replace the string rendering in the transcript.

### F2 - retry plumbing and logging (2d)

- Receipt-backed retry, turn retry from the last assistant message, correlation ids, log line format.
- Tests: a failed tool retried with the same receipt runs once; a cancelled turn shows no red.

Total 9 days.

## 5. Acceptance criteria

- Every Tauri command returns either a value or a `Failure` with a kind, code, retry policy, scope, and redacted message. A test iterates the command list and fails if any command can return a non-`Failure` error shape.
- Cancellation renders muted, never red, and offers no retry.
- A 429 shows a countdown, then enables retry, and the retried request carries the same receipt id.
- A host key mismatch offers "Review host key" and does not offer retry.
- No secret shape from the redaction fixture appears in a failure, a log line, or a transcript entry.
- Tool failures render through `FailureRow`; the old string path and the substring status check are deleted.
- The failure log line contains a code and a correlation id and no message body.
- Screen reader announces the failure with its kind and action label.

## 6. Traps

- **Do not rewrite 461 call sites.** Classify at the boundary. The enum can grow over time.
- **Do not put stack traces in the UI.** Detail is a provider message or a stderr tail, capped.
- **Do not let the model see `Failure`.** Tools still return text to the model; the human row is a separate channel.
- **Do not retry non-idempotent commands without a receipt.** That is how duplicate commits happen.
- **Do not use red for cancellation.** It trains users to fear the stop button.
- **Do not add a logging service.** Local file, no telemetry.

## 7. Effort

| Stage | Days |
| --- | ---: |
| F0 type, classification, redaction | 4 |
| F1 surfaces | 3 |
| F2 retry plumbing and logging | 2 |
| **Total** | **9** |

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/02-failure-surfaces.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D02: Typed failure surfaces. Scope: a Failure type with a kind, a stable code, a retry policy, a scope, an optional action, redaction at serialization, the classification table, three UI surfaces, receipt-backed retry, and local correlation logging. Do not rewrite existing AppError call sites, do not change the tool protocol the model sees, do not implement other dossiers, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/02-failure-surfaces` from the current `draft/mega-absorb-all` only after dossier 01 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
