# D06: Session bundles, the loopback API, scratch sessions, and the move contract

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/06-session-portability`) |
| Roadmap source | mausCode step 26 (issue #28), step 34 (issue #36) |
| Issue title | `D06: Session bundles, the loopback API, scratch sessions, and the move contract` |
| Labels | `port`, `dossier:06`, `area:core`, `size:L`, `stage:1` |
| Depends on | D01 (store, receipts), D02 (failures), D05 (plugins, event bus) |
| Blocks | D33 (remote transports), D30 (environment import) |
| Effort | 14 days |

**Port verdict: BUILD. mausCode steps 26 and 34 describe a loopback session API and a placement launcher; BetterShape has neither. This dossier ships the portable session, the local control surface, and the state machine that D33's transports drive. Without it, "move this session to my VPS" is a copy of a JSON file with no fencing, no resume point, and no way to move back.**

## 1. Today

- A conversation is `Conversation { id, title, history, project_path, summary, summary_fold_end, archived, kind }` at `agent/models/mod.rs:134`, persisted per project by `agent/commands/history.rs:72` into `chat_history/<project-key>.json`. Messages are inline. There is no bundle, no manifest, and no integrity check.
- `save_conversations_inner` merges with disk under a `<file>.lock` and tolerates a concurrent second window. That is the only concurrency story, and it assumes one machine.
- No HTTP server dependency exists. The only listeners are preview and devtools proxies (`commands/preview/design_proxy.rs:346`, `browser/devtools_dock.rs:200`), each bound to `127.0.0.1:0` for its own purpose.
- There is no scratch session: `project_path` is a `String`, and an empty value is not handled by the sidebar or the tool context.

## 2. Bundle format v1

A session bundle is a directory, not an archive. It is diffable, readable by a human, and needs no compression dependency:

```
<session-id>/
  manifest.json          # format, version, ids, counts, hashes
  messages.jsonl         # one message per line, original order
  conversation.json      # title, flags, summary boundary, settings snapshot (no secrets)
  drafts.json            # per-session composer drafts and context records
  usage.json             # ledger rows for this session (D11 reads it)
  provenance.json        # app version, platform, turns, execution locations
  blobs/sha256/<hex>     # attachments and checkpoint payloads, content-addressed
  CHECKSUMS              # sha256 of every file above, one per line
```

`manifest.json`:

```json
{
  "format": "bettershape.session",
  "version": 1,
  "sessionId": "0f6c...",
  "createdAt": 1776384000000,
  "source": { "app": "0.9.4", "platform": "windows", "location": "local" },
  "counts": { "messages": 214, "blobs": 3 },
  "rootHash": "sha256:..."
}
```

Rules:

1. `rootHash` is sha256 over the sorted `path:hash` lines of `CHECKSUMS`. Import recomputes it and refuses on mismatch with `bundle_corrupt`, naming the first bad file.
2. No secret ever enters a bundle. `provenance.json` records secret **labels** only. A test greps every file for the fixture token.
3. Unknown fields are preserved on import (`#[serde(flatten)] extra`), so a newer app's bundle survives a round trip through an older one.
4. Message ids are stable. If an imported message id collides with an existing conversation, the conflict policy decides; ids are never rewritten silently.
5. Blobs are referenced by hash. A missing blob fails import before the conversation is written (`bundle_missing_blob`).

Export writes to a temporary sibling directory and renames on success. Import writes into the store inside one transaction, so a failed import leaves no half-conversation.

### 2.1 Conflict policies

`Skip` (default), `Fork` (new session id, title suffix " (imported)"), `Replace` (only if the existing session is not live). A live session is never replaced; the command returns `session_live`.

## 3. Loopback API

Bound to `127.0.0.1`, off by default, enabled per app session in Settings > Agent > Local API. The port is ephemeral unless the user pins one; the pinned port is refused if occupied, never silently changed.

| Control | Rule |
| --- | --- |
| Token | 32 random bytes, base64url, generated on enable, shown once, stored in the vault (D04) as `LocalApi`, revocable |
| Auth | `Authorization: Bearer <token>`, constant-time compare; every route including `/health` |
| Origin | no `Origin` header (CLI) allowed; browser origins must be in an explicit allowlist; `Origin: null` rejected |
| Body | 1 MiB cap, `413` over |
| Rate | 60 requests per minute per token, 8 concurrent, `429` with `Retry-After` |
| Bind | `127.0.0.1` only; a test asserts no `0.0.0.0` |
| Logging | method, route, status, bytes; never the body or the token |

Routes:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | `{ok, version, pid}` |
| GET | `/sessions` | id, title, updatedAt, location, live |
| GET | `/sessions/:id` | conversation without blobs; `include=messages` adds the transcript |
| GET | `/sessions/:id/events?cursor=` | SSE stream of `AppEvent`; see replay rules |
| POST | `/sessions/:id/messages` | append a user message and start a turn; returns `turnId`; rejects when live with `turn_in_progress` |
| POST | `/sessions` | create a scratch session |
| POST | `/sessions/:id/promote` | apply a scratch session's patch to a project |

Replay: events are served from the D05 bus ring (10,000 events). A cursor older than the ring returns `410 cursor_expired` with `oldestCursor`, never a silent reset. D08 replaces this with durable replay from `run_events` and keeps the same wire shape; the dossier that adds durability must not change the client contract.

Implementation: `hyper` 1 with `http1` and `hyper-util`, named as the one new dependency (seven routes, bounded bodies, no framework). The server task is owned by `LocalApiServer`, started on enable and aborted on disable; a disable waits for in-flight requests with a 2 s cap.

## 4. Scratch sessions

A scratch session has no project. `Conversation.project_path` stays a `String` and gains `scratch: bool`; when `scratch` is true the path is empty and the following are denied: file tools, terminal, git tools, worktree creation, and previews that need a dev server. The composer stays usable, and the agent can still reason, search the web (D27), and call MCP tools that do not need a path.

Scratch files, if the agent writes any, live under `app_data/scratch/<session-id>/` with the same path guard as a workspace (D03). Promotion:

1. Compute a diff of the scratch root against an empty tree, as a unified patch.
2. Show the file list and the target project.
3. `git apply --3way --check`, then apply. Conflicts are reported per file with the rejected hunks; nothing is committed.
4. On success, write the session's `project_path`, clear `scratch`, and add one provenance row.

Promotion is a receipt (D01-B2). Re-running it is a no-op that returns the first result.

## 5. The move contract

D33 implements transports. This dossier owns the state machine every transport uses.

```rust
pub enum MoveState {
    Idle,
    Planning,
    WaitingForTurnEnd { turn_id: String, deadline_ms: u64 },
    Exporting { bytes_done: u64 },
    Transferring { bytes_done: u64, total: u64 },
    Importing,
    Verifying,
    Active { location: LocationId },
    Failed { stage: MoveStage, cause: Failure },
    Aborted { restored: bool },
}
```

`MovePlan` is shown before anything changes: source and target, session size, files that move, files that stay (secrets, local caches, absolute paths), preview ports that will be re-bound, and what happens to a running turn.

Rules:

1. A turn in progress blocks the move up to 30 s (`WaitingForTurnEnd`). Then the user chooses "wait", "cancel move", or "move now". "Move now" cancels the turn, records `moved_mid_turn` on the session, and the target resumes from the last durable checkpoint with a visible banner. No silent truncation.
2. The source session is fenced during `Exporting` and later: writes return `session_fenced`, and the composer is read-only. Fencing is a column plus a receipt, not a UI flag.
3. Failure in any stage before `Active` leaves the source authoritative and writable again. Failure after `Active` but before `Verifying` leaves both copies; the UI offers "resume move" or "discard target". There is never a split-brain state that accepts writes on both sides.
4. `Verifying` re-reads the target's manifest root hash and one sampled message, then marks `Active`. The session id never changes; each turn gains `execution_location`.
5. Moving back is the same state machine with source and target swapped. The local side is just another location.

## 6. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/session/{mod,bundle,import,scratch,move}.rs` | bundle, policies, promotion, state machine |
| `src-tauri/src/session/api/{mod,server,routes,auth,limits}.rs` | loopback server |
| `src-tauri/src/commands/session_portability.rs` | export, import, scratch, promote, enable/disable API, token |
| `src-tauri/src/agent/models/mod.rs` | `scratch`, `fenced`, `execution_location` on `Conversation`; additive with defaults |
| `src-tauri/src/agent/commands/history.rs` | read/write through the bundle codec |
| `lib/session/portability.ts`, `features/settings/ui/pages/local-api/*` | client and settings |

## 7. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | bundle codec, checksums, export, round-trip test | 3 |
| P1 | import, conflict policies, transactional write, blob check | 3 |
| P2 | loopback server, auth, limits, routes, SSE, 410 contract | 3 |
| P3 | scratch sessions, path guard, promotion via `git apply` | 3 |
| P4 | move state machine, fencing, verification, resume/discard | 2 |
| | **total** | **14** |

## 8. Acceptance criteria

1. Export then import of a 200-message session with 3 attachments reproduces message ids, order, title, summary boundary, drafts, and usage rows; the recomputed root hash matches.
2. A flipped byte in any bundle file fails import with `bundle_corrupt` and the file name; the store is unchanged.
3. A fixture token placed in the settings snapshot is absent from every bundle file.
4. Import with each conflict policy produces the documented outcome; `Replace` against a live session returns `session_live`.
5. The loopback server rejects a bad token with `401`, a disallowed origin with `403`, a 1.1 MiB body with `413`, and request 61 with `429` and `Retry-After`.
6. `/sessions/:id/events?cursor=` streams in order, and a cursor older than the ring returns `410` with `oldestCursor`.
7. A scratch session denies every path-dependent tool with `scratch_no_workspace`, and promotion applies a two-file patch or reports per-file conflicts without committing.
8. Moving with a generating turn shows `WaitingForTurnEnd`; "move now" records `moved_mid_turn` and the target's first turn starts from the checkpoint, not from an empty history.
9. A transport failure at `Transferring` restores the source to writable and leaves no target session visible.
10. The full gate passes.

## 9. Traps

- **Do not zip the bundle.** A binary archive makes the integrity story opaque and adds a dependency; the directory plus `CHECKSUMS` is enough, and a transport may tar it in flight.
- **Do not key the bundle by project path.** Sessions move between machines where paths differ; the id and `provenance` carry location.
- **Do not let the loopback token live in localStorage.** It is a bearer credential; it belongs in the vault and in memory for the server.
- **Do not treat `scratch` as `project_path: ""` alone.** Two empty-path states already exist in old files; the boolean is what the guards read.
- **Do not let the import path trust the manifest's counts.** Read the files, verify hashes, then trust the counts only as a cross-check.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/06-session-portability.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D06: Session bundles, the loopback API, scratch sessions, and the move contract. Scope: the v1 bundle directory and checksums, export and import with three conflict policies, the authenticated loopback server with SSE and bounded replay, scratch sessions with a path guard, promotion through `git apply --3way`, and the transport-agnostic move state machine with fencing and resume. Do not implement any transport (D33), do not add durable event storage (D08), do not change the model-facing tool protocol, and do not enable the server by default.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/06-session-portability` from the current `draft/mega-absorb-all` only after dossier 05 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
