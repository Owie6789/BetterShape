# D15: Rewind, checkpoints, and rollback safety

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/15-rewind-and-checkpoints`) |
| Issue title | `D15: Rewind, checkpoints, and rollback safety` |
| Labels | `port`, `dossier:15`, `area:chat`, `size:L`, `stage:3` |
| Depends on | D01-B1, D14 lease |
| Blocks | none |
| Effort | 17 days |

**Port verdict: RE-DERIVE the storage model, TAKE the safety model and the UX semantics.**

This is the dossier where the two systems differ most, and where copying code would be actively dangerous. t3 rolls back a **provider conversation** and a **worktree snapshot** under a lease, with identity checks that make stale rollbacks impossible. BetterShape stores **full pre-edit file contents** in a JSON file per conversation and truncates the message array. Both can produce the same button; only one of them can survive a failed turn.

## 1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `apps/server/src/orchestration-v2/CheckpointService.ts` | - | checkpoint capture, restore, stale refs |
| `apps/server/src/orchestration-v2/CheckpointCaptureService.ts` | - | capture policy per turn/node |
| `apps/server/src/orchestration-v2/CheckpointRollbackService.ts` | 407 | the rollback transaction |
| `apps/server/src/orchestration-v2/CheckpointRestoreSafety.ts` | 98 | shared-workspace detection |
| `apps/server/src/orchestration-v2/CheckpointScopeOwnership.ts` | - | scope ownership rules |
| `packages/contracts/src/checkpointDiff.ts` | - | diff contract |
| `docs/orchestration-v2/feature-lifecycles.md` | section "Checkpoints" | the normative lifecycle |

## 2. Mechanism

### 2.1 Checkpoint identity

A checkpoint belongs to a `CheckpointScopeId`, which belongs to a `ProviderThreadId`, which belongs to a `ThreadId`. `execute` takes all four plus `restoreFiles?: boolean`. Five operations are validated before anything mutates:

```
providerThread exists and has a providerSessionId
checkpoint exists
scope exists
checkpoint.scopeId === scope.id
checkpoint.status === "ready"
```

Any failure returns `CheckpointRollbackExecutionError` with a reason from a closed union: `rollback-target-invalid`, `active-provider-changed`, `provider-turn-unavailable`, `unexpected-failure`, `shared-workspace`. Each reason has its own user-facing message. The union is the API; the UI cannot invent a failure state.

Then identity:

```
providerThread.id === projection.thread.activeProviderThreadId
providerThread.providerInstanceId === projection.thread.modelSelection.instanceId
```

If the user switched providers after the checkpoint, rollback is refused with `active-provider-changed`. This single check prevents the worst possible bug: replaying a Claude conversation into a Codex session.

### 2.2 Target resolution

`checkpoint.appRunOrdinal` is the app-level turn index. `0` means "before the first run", which resolves to `{ type: "thread_start", appRunOrdinal: 0 }`. Otherwise the service finds the run at that ordinal, its active attempt, then the latest provider turn for that attempt. If the turn is missing or belongs to a different provider thread, it refuses with `provider-turn-unavailable`.

### 2.3 Worktree recreation

If the thread has a worktree path and branch that no longer exists, and the path is a **managed** worktree path, the service prunes and recreates it before restoring files:

```ts
if (worktreePath && branch && !exists(worktreePath) && isManagedWorktreePath(worktreePath)) {
  gitWorkflow.pruneWorktrees({ cwd: projectRoot })
  gitWorkflow.createWorktree({ cwd: projectRoot, refName: branch, path: worktreePath })
}
```

`isManagedWorktreePath` compares real paths against `<managed worktrees folder>/<repo>/<branch>`, resolving symlinks on the nearest existing ancestor. A client can send an arbitrary worktree path, so the recreation is restricted to paths the server would have created. This is the pattern to copy.

### 2.4 Shared workspace guard

`isCheckpointRestoreIsolated` returns false when:

- `thread.worktreePath` is null (project checkout is shared by construction), or
- the checkpoint scope cwd is not the worktree cwd, or
- **any other live thread** has a worktree, checkpoint scope, or provider session cwd that contains or is contained by this scope's cwd.

The third check is the one nobody writes on the first try. It walks every other thread, collects candidate paths (worktree path, checkpoint scope cwds, session cwds for sessions that do not support multiple provider threads, project root for threads without a worktree), realpaths them, and tests bidirectional containment. If the workspace may be shared, file restore is refused and the error message tells the user to "Rewind the conversation without restoring files instead."

The check runs twice: at command admission and again after provider rollback, because a worktree can become shared while the rollback is running.

### 2.5 The rollback transaction

Order matters:

1. Under `threadCommands.withLock(threadId)`: open (or resume) the provider session and hold the lock for the whole rollback. The lock is taken first, not last, so a message sent during the rollback cannot plan against the old native session and commit after the fork. The whole execute is also wrapped in `withWorkspaceLease(path.resolve(worktreePath), ...)` so storage cleanup cannot delete the worktree mid-rollback.
2. Compute runs to roll back: `ordinal > targetOrdinal` and terminal status.
3. Compute already-rolled-back run and attempt ids and exclude their turns, so a second rewind does not count turns that no longer exist in the provider conversation.
4. Re-run the shared-workspace guard (section 2.4) now that the lock is held. If it now reports shared, abort before any mutation and leave the provider session untouched.
5. `session.rollbackThread({ providerThread, target, providerThreadTurns })`, skipped when there is nothing to roll back.
6. Restore files from the checkpoint, if `restoreFiles !== false`.
7. Delete checkpoint refs newer than the target (they now point at turns that no longer exist), emitting `checkpoint.captured` with `status: "stale"`.
8. Update the provider thread row (`lastRunOrdinal`), emit `run.updated` and `node.updated` with `status: "rolled_back"`.

Steps 4 through 8 are one unit of work: the guard re-check, the provider rollback, and the file restore happen in that order with no other writer able to interleave, because the thread lock is already held. A guard that fails at step 4 changes nothing at all. If the guard passes at step 4 and the provider rollback then fails, the file restore is skipped and the result is a typed partial failure that names which half applied, so the user is never told "rewound" when only the provider moved.

### 2.6 Nested and child checkpoints

From the lifecycle doc: child checkpoints create their own `CheckpointScope` under the parent; child checkpoints never advance the parent's app run count; nested rollback restores the child scope, rolls back the child provider thread, marks descendant checkpoints stale, and preserves parent history unless the parent filesystem state changed. If a child mutates the same workspace as the parent, restoring it can dirty the parent's state and the UI must say so.

This is the part that BetterShape's subagent model (up to 4 subagents, optional sibling worktrees) will eventually need, because a subagent in a shared checkout writes into the parent's workspace.

## 3. BetterShape today

| concern | BetterShape | evidence |
|---|---|---|
| checkpoint storage | JSON array per conversation at `<data>/BetterShape/checkpoints/<id>.json` | `agent/commands/checkpoints.rs:18-25` |
| checkpoint shape | `{ message_index: usize, files: [{ path, original_content: Option<String> }] }` | `agent/models/mod.rs:222` |
| capture | `record_into_checkpoints` records **full original content** once per file per turn | `models/mod.rs:229-252` |
| restore | cancel in-flight turn, kill terminal, truncate history at index, reset compaction and design state, rewrite each file or delete it if it was created | `agent/commands/conversation.rs:144-236` |
| provider rollback | none | no provider conversation is rewound |
| shared-workspace guard | none | restore always proceeds |
| worktree recreation | none | path is used as-is |
| untracked cleanup | partial: files with `original_content: None` are removed | `conversation.rs:206` |
| concurrency | in-memory mutexes, no workspace lease | no lease symbol |
| stale checkpoint handling | `take_checkpoints_from(index)` truncates the array | `conversation.rs:198` |

Strengths of the current design: it is simple, it works without git, and it restores binary-safe content because the bytes are stored in JSON (as UTF-8, which is a limitation). It also cancels the in-flight turn first, a detail many implementations miss.

Weaknesses, concretely:

1. **Storage blowup.** Full file contents per turn per conversation. A 2 MB source file edited ten times is 20 MB of JSON in app data. t3 stores checkpoint refs plus a diff-based snapshot in the worktree.
2. **UTF-8 only.** `String` storage cannot represent binary files. Any non-UTF-8 file cannot be checkpointed; the behavior is undefined (the read likely fails and the snapshot is missing).
3. **No workspace identity.** Restoring in a shared checkout will overwrite concurrent edits from a subagent or another window.
4. **Conversation and files can diverge.** The provider conversation is not rewound. Resuming after a rewind sends a transcript to a provider session that still remembers the truncated turns.
5. **No scope model.** Rewinds are per conversation; there is no child scope, so a subagent's edits are folded into the parent's file snapshots with no attribution.

## 4. Port plan

### Step 1: split storage (3-4 days)

Introduce `TurnCheckpoint { conversation_id, message_index, scope_id, created_at, files: Vec<FileRef>, git_ref: Option<String> }` where `FileRef` is either:

- `Snapshot { path, blob_id }` stored in a content-addressed blob directory (`<data>/BetterShape/checkpoint-blobs/<sha256>`), written from bytes, not strings, or
- `GitTree { path, blob_oid, worktree_oid }` when the workspace is a git repo and the file is tracked at HEAD. `worktree_oid` is the blob of the file's bytes as they were at the turn boundary, captured with `git hash-object -w`, and it is what restore writes. `blob_oid` is the committed blob, kept only to explain the diff to the user.

The `worktree_oid` is the point. A tracked file commonly carries uncommitted edits at the turn boundary, so restoring `blob_oid` would throw away work that existed before the turn, which is the opposite of a rewind. The checkpoint captures the bytes the user actually had, tracked or not; git is a deduplication and diff convenience, never the source of the restored content.

Blobs deduplicate across turns and conversations. This alone removes the storage blowup and the UTF-8 restriction. Migrate existing checkpoint JSON by writing each `original_content` to a blob on first load; keep the old file until migration succeeds.

### Step 2: workspace guard (2 days)

Port `isCheckpointRestoreIsolated` semantics in Rust:

```rust
fn restore_is_isolated(thread, scope_cwd, all_threads) -> bool
```

Test cases, ported from t3's `CheckpointRestoreSafety.test.ts`:

- no worktree: false
- scope cwd equals worktree cwd and no other thread overlaps: true
- another thread's worktree is a parent of this one: false
- another thread's provider session cwd contains this one: false
- path does not exist yet: falls back to lexical resolve, still compares

When false, the dialog offers "Rewind conversation only" and explains why file restore is unavailable. This is a UX feature, not just a guard.

### Step 3: provider rollback adapter (5-8 days, gated)

Only meaningful if BetterShape's turn loop keeps a provider-native conversation id. It does: `run_turn.rs` and the provider wire layer hold session state. Add a trait:

```rust
trait ProviderRewind {
    fn supports_rewind(&self) -> bool;
    fn rewind(&self, target: &ProviderTurnRef) -> Result<ProviderThreadSnapshot, RewindError>;
}
```

Implement for Anthropic first (message-list truncation is authoritative on the client side), then Codex if its `thread/rollback` equivalent exists in the CLI. Do **not** synthesize a provider restart from context unless there is no alternative; a synthetic restart loses tool state and is a different product promise.

If rollback is unsupported, the button label must say "Rewind conversation and files" not "Undo turn", and the confirmation must state that the model's memory is not rewound. t3's `ROLLBACK_FAILED_MESSAGE` is a good model for honest failure copy.

### Step 4: lease (2 days)

Add a `WorkspaceLease` keyed by canonical worktree path, held during restore, worktree recreation, and cleanup. BetterShape has no cleanup service yet, so the lease can start as a `Mutex<HashSet<PathBuf>>` in `AgentState`. It only becomes load-bearing when D14's cleanup lands.

### Step 5: child scopes (deferred, 4-5 days)

Add `scope_id` to checkpoints now (cheap), implement child capture later. When a subagent runs in a worktree, its checkpoints carry its own scope and do not advance the parent index. When it runs shared, its snapshots merge into the parent scope with a `source: subagent` tag so the UI can warn that restoring the parent also reverts the child.

### Step 6: UI

BetterShape already has `checkpoint-restore-dialog.tsx`. Extend it:

- Two actions: "Restore files and conversation" and "Rewind conversation only".
- A per-file list with sizes and a diff preview (reuse `git_diff` for tracked files).
- A warning when the scope is shared, with the exact reason.
- A "rolled back" visual state for turns after the target, matching t3's `status: "rolled_back"` idea rather than deleting them from the transcript. BetterShape currently truncates history, which makes the action feel like data loss.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `CheckpointRollbackService.test.ts` | refuses invalid target, inactive provider, missing turn |
| `CheckpointRestoreSafety.test.ts` | overlap detection across threads and sessions |
| `CheckpointScopeOwnership.test.ts` | scope belongs to one provider thread |
| `CheckpointCaptureService.test.ts` | capture policy for completed, failed, interrupted runs |
| `feature-lifecycles.md` rollback section | normative order of operations |

## 6. Traps

- **Do not keep storing strings.** Rust `String` plus JSON is the root of three limitations. Bytes to content-addressed blobs is the fix.
- **Do not delete the turns from the transcript.** t3 keeps rolled-back runs with a status so the audit trail survives. BetterShape truncates, which is why users hesitate to press the button.
- **Do not restore files in a shared checkout without consent.** This is the one bug that loses other agents' work.
- **Do not fake provider rollback.** A synthetic "start a new session with the remaining context" is not an undo. Label it accordingly.
- **Cancel before restore.** BetterShape already does this; keep it and add a test. The comment in `conversation.rs:139-141` explains the ghost approval failure.

## 7. Effort

| step | days |
|---|---:|
| blob storage plus migration | 4 |
| workspace guard plus tests | 2 |
| provider rewind adapter (one provider) | 6 |
| lease | 2 |
| UI rework | 3 |
| child scopes (deferred) | 5 |
| **total without child scopes** | **17** |

## 8. Acceptance criteria

1. Restoring a checkpoint in a shared checkout requires explicit confirmation and never silently overwrites another thread's worktree.
2. A checkpoint with a 5 MB binary file round-trips byte-identical.
3. Ten edits to the same 2 MB file consume one blob per distinct content, not ten copies.
4. Rollback after a provider switch is refused with an actionable message.
5. Rollback during an in-flight turn cancels first, then restores, with no ghost approvals.
6. Turns after the restore target remain visible with a rolled-back marker.
7. If the provider cannot rewind, the UI says so before the user confirms.
8. A tracked file that had uncommitted edits at the turn boundary restores to those edits, not to the `HEAD` blob, asserted by a fixture that edits a tracked file, captures a checkpoint, commits, and rewinds.
9. The workspace guard re-runs after the lock is held; a test makes a second thread share the workspace between admission and the locked re-check and asserts nothing was mutated.
10. A send issued during a rollback cannot commit against the pre-rollback session, asserted by a test that sends under the lock.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/15-rewind-and-checkpoints.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D15: Rewind, checkpoints, and rollback safety. Scope: sha256 checkpoint blobs, restore safety, workspace guards, and the lease that prevents two restores from racing. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/15-rewind-and-checkpoints` from the current `draft/mega-absorb-all` only after dossier 14 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
