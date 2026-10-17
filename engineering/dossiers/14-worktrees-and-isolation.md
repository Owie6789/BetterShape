# D14: Worktrees, setup scripts, and cleanup

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/14-worktrees-and-isolation`) |
| Issue title | `D14: Worktrees, setup scripts, and cleanup` |
| Labels | `port`, `dossier:14`, `area:git`, `size:L`, `stage:3` |
| Depends on | D01 (store, receipts) |
| Blocks | D15, D16, D25 |
| Effort | 20 days |

**Port verdict: TAKE the lifecycle. BetterShape already has the primitive; it does not have the lifecycle.**

Today BetterShape can create a sibling worktree for a subagent and can list, add, and remove worktrees through a tool. What it cannot do is give a **thread** its own worktree, run a setup script in it, keep it across restarts, clean it up by policy, or prove that a path is one it created. Those four capabilities are the dossier.

## 1. The two systems

| concern | BetterShape | t3code |
|---|---|---|
| primitive | `agent/checkout.rs` (132 lines): `Isolation::{Shared, Worktree}`, `prepare()`, `add_worktree()`, slug sanitized to 24 chars | `GitManager.createWorktree` plus `GitVcsDriver`, 3,106 lines with 6,962 lines of tests |
| ownership | subagent-local, created at spawn, not tracked | thread-level, persisted on the thread (`worktreePath`, `branch`) |
| launch strategies | shared or worktree | `root`, `existing_worktree`, `worktree` with `baseRef`, `branch`, `startFromOrigin` |
| branch naming | slug from task name | `sanitizeBranchFragment`, temporary `t3/<8hex>`, flattened to `t3-<hex>` |
| failure mode | falls back to shared checkout with a note | fails the run and holds the queue |
| setup scripts | none | `ProjectSetupScriptRunner` (450 lines), sentinel-based completion, terminal-backed |
| settle scripts | none | same runner with `trigger: "settle"` |
| cleanup | none | `storageCleanup.ts` with rules, grace windows, leases |
| managed path safety | none | `worktreesDirectory.ts` plus `makeIsManagedWorktreePath` |
| concurrency | in-memory locks | `withWorkspaceLease` around operations |
| settings | none | `defaultThreadEnvMode`, `newWorktreesStartFromOrigin`, `worktreeSubmodules`, `defaultAutoPull`, `worktreeCleanup` per project |

## 2. Mechanism details worth copying

### 2.1 Launch strategy

`ThreadLaunchWorkspaceStrategy` is a closed union:

```ts
{ type: "root"; branch? }
{ type: "existing_worktree"; worktreePath; branch? }
{ type: "worktree"; baseRef; branch?; startFromOrigin? }
```

The run knows where it will execute before it starts, which is what lets the queue hold when a worktree is missing (D09). BetterShape's `prepare()` returns a `Checkout` after the fact; there is no plan step. Add the plan step: `resolve_workspace(thread, request) -> WorkspacePlan` then `materialize(plan)`.

### 2.2 Branch naming

`sanitizeBranchFragment` lowercases, strips quotes, trims leading and trailing punctuation, replaces runs of invalid characters with `-`, and collapses slashes. Temporary worktrees use `t3/<8 hex>`.

The detail that shows this was learned the hard way: `flattenTemporaryWorktreeBranchName` converts `t3/<hex>` to `t3-<hex>` because "Git stores refs as paths, so a plain `t3` branch makes every `t3/<hex>` ref impossible." BetterShape's slug logic is simpler and does not consider ref namespace collisions. Port the flatten rule and the reasoning.

### 2.3 Setup scripts

`ProjectSetupScriptRunner.run({ threadId, projectId, projectCwd, worktreePath, trigger: "setup" | "settle" })`:

- resolves project settings and the project's scripts
- opens a terminal in the worktree (`TerminalManager`)
- writes the command
- observes completion through a sentinel line rather than an exit code alone, because the terminal may outlive the command or die before the sentinel arrives
- returns `{ status: "started", scriptId, terminalId, completion }` or `{ status: "no-script" }`
- async scripts continue in the terminal; the run does not block

The `completion` effect resolves with `exitCode: number | null` where null means the terminal closed before the sentinel. That null is honest and the UI should show "setup may not have finished" rather than a green check.

### 2.4 Cleanup rules

`WorktreeCleanupRules`:

```
worktreeKeepWhen: "uncommitted-changes" (default)
worktreeAfterDays: number | null
worktreeSettledAfterDays: number | null
worktreeOnMerge: bool
worktreeOnDelete: bool
worktreeUnchanged: bool
```

Grace windows in `storageCleanup.ts`: 60 seconds after a settle before cleanup may touch the worktree (the settle script needs time to open its terminal), and one hour for orphan worktrees that precede their thread row.

Cleanup runs under `withWorkspaceLease(path.resolve(worktreePath))`, the same lease the rollback service uses (D15). This is how two destructive operations avoid racing.

### 2.5 Managed path safety

`resolveWorktreesDirectory(setting, defaultDir, path, home)` returns null when the setting is not absolute or is a filesystem root. `makeIsManagedWorktreePath` compares the real path of a candidate against `<managed dir>/<repo>/<branch>`, resolving symlinks on the nearest existing ancestor.

The threat model is explicit in the comment: "A thread's path and branch can come from a client, so a missing worktree is only recreated where the server would have put it." BetterShape's `add_worktree` builds a path from a slug, but nothing validates a path that arrives from the frontend. Any future "recreate this worktree" feature must have this check.

## 3. BetterShape today, precisely

`agent/checkout.rs`:

```rust
pub enum Isolation { Shared, Worktree }
pub struct Checkout { project_path, branch, isolated, note }
pub fn prepare(repo, slug, isolation) -> Checkout
fn add_worktree(repo, slug) -> Result<Checkout, String>
```

- On `Worktree`, `add_worktree` creates a sibling directory and a new branch.
- On failure it returns the shared checkout with a note: "Could not create a git worktree (...). Falling back to the shared checkout".
- `sanitize_slug` lowercases, keeps alphanumerics, maps separators to `-`, caps at 24 characters, defaults to `agent`.

`agent/subagents.rs`:

- `MAX_SUBAGENTS = 4`
- model allowlist logic (`pick_subagent_model`, `allowed_subagent_models`)
- subagents either share the checkout or get a worktree via `checkout::prepare`

`agent/tools/dispatch/git.rs`:

- `tool_git_worktree` supports `list`, `add`, `remove` with a porcelain list and `worktree add -b <branch>`.

So the primitive is real and tested only by the tool's own use. There is no thread persistence, no setup script, no cleanup, no lease, and no managed-path check.

## 4. Port plan

### Step 1: thread workspace model (3 days)

Add to the conversation record:

```
workspace: { kind: "root" } | { kind: "worktree", path, branch, base_ref, created_at }
```

Commands: `workspace_plan(conversation_id, strategy)` and `workspace_materialize(plan)`. The plan is computed before the first send and shown in the composer ("New worktree from main" or "Current checkout").

When a run starts in a worktree that no longer exists, the run fails with `worktree_missing` and the UI offers "Recreate worktree" or "Continue in current checkout". Do **not** silently fall back; the current fallback hides a real failure and can mix edits.

### Step 2: branch naming and managed paths (2 days)

Port `sanitize_branch_fragment` and the temporary prefix rule. Add `managed_worktree_roots` from settings plus `is_managed_worktree_path`, with unit tests for symlinks, roots, and Windows drive roots. BetterShape ships cross-platform; the root check must handle `C:\` and UNC paths.

### Step 3: setup and settle scripts (5 days)

1. Project settings gain `setup_script: Option<String>` and `settle_script: Option<String>`. BetterShape has no project script concept today, so this is a new settings surface, not a parallel one.
2. `run_project_script(conversation_id, trigger)` opens a terminal in the worktree and writes the command.
3. Completion detection: append a sentinel echo to the command (`; echo __BETTERSHAPE_SETUP_DONE__$?`) and watch the terminal stream for the sentinel. Parse the exit code from the line. If the terminal closes first, emit `{ exit_code: null }`.
4. Timeout: setup scripts get 10 minutes by default, configurable per project. On timeout, mark the workspace `setup_incomplete` and warn before the first send.
5. Output is streamed to a collapsible "Setup" block in the thread, not dumped into the chat transcript.

### Step 4: cleanup (5 days)

1. Rules per project, mirroring the union above.
2. A cleanup pass on app start and every 6 hours:
   - list managed worktrees
   - for each, find its thread; orphaned worktrees older than one hour are candidates
   - refuse to remove when `keepWhen = uncommitted-changes` and `git status --porcelain` is non-empty, unless the user explicitly confirms
   - respect `on_merge`, `on_delete`, `after_days`, `settled_after_days`
3. Every removal under a workspace lease, with a dry-run report first. The report lists what would be removed and why, and the user can deselect entries.
4. Never remove a directory that is not a managed worktree path.

### Step 5: leases (2 days)

`WorkspaceLease` keyed by canonical path, held by cleanup, rollback, and worktree recreation. BetterShape has no async task registry for this yet; a `Mutex<HashMap<PathBuf, LeaseState>>` in `AppState` with a guard type is enough. Add a test with two concurrent operations.

### Step 6: UI (3 days)

- Composer workspace chip: current checkout, worktree branch, or "new worktree".
- Thread header: branch name and a "settle" action if a settle script exists.
- Settings: per-project setup script, settle script, cleanup rules, "start worktrees from origin".
- A storage report under Settings, Developer: number of worktrees, disk usage, last cleanup.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `GitWorkflowService.test.ts` | worktree create/remove, ref names |
| `storageCleanup.test.ts` | grace windows, keep-when-uncommitted, on-merge, lease interaction |
| `ProjectSetupScriptRunner.test.ts` | sentinel parse, terminal close, async script, timeout |
| `worktreesDirectory` tests | root rejection, symlink resolution, managed path match |
| `ThreadLaunchService.test.ts` | strategy resolution, missing worktree, base ref from origin |

## 6. Traps

- **Silent fallback is worse than failure.** BetterShape currently falls back to shared with a note that most users will not read. Fail the run and offer a choice.
- **Setup scripts are not chat turns.** Keep their output out of the transcript or the context window fills with build logs.
- **Cleanup must be conservative.** A worktree with uncommitted changes is the user's work. Default to keep, always offer a report, never delete outside managed roots.
- **Windows paths.** Long paths, drive roots, and backslashes break naive prefix checks. Test on Windows or the root guard is theater.
- **Do not create one worktree per message.** One per thread, created at launch, reused; otherwise disk usage explodes and `git worktree list` becomes unusable.

## 7. Effort

| step | days |
|---|---:|
| thread workspace model | 3 |
| branch naming and managed paths | 2 |
| setup and settle scripts | 5 |
| cleanup | 5 |
| leases | 2 |
| UI | 3 |
| **total** | **20** |

## 8. Acceptance criteria

1. A thread created in a worktree keeps that worktree across restart and reuses it on every turn.
2. A missing worktree fails the turn with a clear choice; it never silently runs in the project checkout.
3. A setup script runs once per new worktree, its output is visible in a collapsible block, and a non-zero exit warns before the first send.
4. Cleanup never removes a worktree with uncommitted changes unless the user confirms that specific entry.
5. Cleanup cannot run concurrently with a rollback in the same worktree.
6. A client-supplied worktree path that is not under a managed root is refused.
7. `t3/<hex>`-style branch names flatten correctly and do not collide with an existing `t3` branch.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/14-worktrees-and-isolation.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D14: Worktrees, setup scripts, and cleanup. Scope: a WorkspacePlan of root, existing worktree, or new worktree; setup and settle scripts with a sentinel; managed-path safety; cleanup with a dry run. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/14-worktrees-and-isolation` from the current `draft/mega-absorb-all` only after dossier 13 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
