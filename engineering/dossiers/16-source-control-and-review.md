# D16: Source control and review depth

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/16-source-control-and-review`) |
| Roadmap source | mausCode steps 13, 14, 15, 25 (issues #15 to #17, #27) |
| Issue title | `D16: Source control and review depth` |
| Labels | `port`, `dossier:16`, `area:git`, `size:XL`, `stage:3` |
| Depends on | D14, D01-B1 |
| Blocks | none |
| Effort | 27 days |

**Port verdict: TAKE the PR stack model, the review guide, and viewed-file state. TAKE the diff rendering discipline. DEFER the multi-host abstraction; ship GitHub only first.**

This is the largest single opportunity in the plan by user value and the most expensive by line count. It is also where BetterShape has more existing foundation than it appears: 60+ git commands, hunk staging, branch graph, blame, and a GitHub section. What it lacks is the **review loop**: link a thread to a pull request, watch it, review it as a guided tour, track which files are viewed, and keep the stack in sync.

## 1. Upstream inventory

| area | files | lines |
|---|---|---:|
| `apps/server/src/git/GitManager.ts` | 1 | 3,106 |
| `apps/server/src/git/GitManager.test.ts` | 1 | 6,962 |
| `apps/server/src/git/*` (workflow, linking, refs) | 8 | 1,200 |
| `apps/server/src/pullRequest/**` | 22 | 14,399 |
| `apps/server/src/review/ReviewService.ts` | 1 | 140 |
| `packages/source-control-core/src/**` | 14 | 2,537 |
| `packages/source-control-github/src/**` | 36 | 24,065 |
| `packages/source-control-gitlab` | 14 | 7,146 |
| `packages/source-control-azure-devops` | 15 | 6,580 |
| `packages/source-control-bitbucket` | 12 | 5,263 |
| `packages/source-control-gitcafe` | 13 | 4,203 |
| `packages/source-control-forgejo` | - | - |
| `apps/web/src/components/pullRequest/**` | 53 tsx plus logic modules | ~20,000 |
| `apps/web/src/components/DiffPanel.tsx`, `diffs/**` | - | 1,171 plus shell |
| `apps/server/src/vcs/**` | - | driver registry |

About 110,000 lines all in, of which the portable core is roughly 15,000.

## 2. Mechanism

### 2.1 Pull requests as thread state, not a separate app

`ThreadLinkedPullRequest` lives on the thread. It carries the link source, a snapshot (`state`, `checks`, `reviewDecision`, counts), a `ThreadPullRequestWatch`, and a `ThreadPullRequestStack` with `ThreadPullRequestStackLayer[]`. Commands: `thread.pull-request.link`, `.unlink`, `.watch`, `.sync`, plus `thread.pull-request-link.sync` and `thread.pull-request-watch.sync` emitted by a reactor.

Why this shape matters: the sidebar can show a thread's PR state without opening a PR panel, and the settle policy can use `state === "merged"` (D10). The PR is not a destination; it is a property of the work.

`PullRequestSyncReactor` and `pullRequestSyncKey.ts` debounce syncs by a key derived from the PR identity and the fields being watched. The reactor pattern means a sync failure marks a stale snapshot rather than throwing into the chat.

### 2.2 Stack awareness

`PullRequestReviewGuideService` takes an optional `PullRequestStack` with layers. For each layer it reads the layer's head, computes a merge base, and builds a per-layer diff. `ThreadPullRequestStackLayer` carries the layer's PR number, head branch, base branch, and state. The web layer stack has a header, layer list, layer content, menu, and popover, plus `pullRequestStackSnapshot.ts` for state derivation.

The hard part is not rendering layers; it is **base selection**. A stacked PR's diff is only meaningful relative to its parent layer's head, not the repository default branch. The service's `stack?.layers ?? []` usage and the per-layer `mergeBase` computation is the mechanism to copy.

### 2.3 Review guide

`PullRequestReviewGuideService` plus `pullRequestReviewGuideInput.ts` and `pullRequestReviewGuideNormalize.ts` build a guided review: an ordered list of stops with file, hunk, and commentary. On the web, `GuideTour`, `GuideRail`, `GuideStop`, and `PullRequestGuideRunCoordinator` render it as a tour with a rail. The coordinator owns keyboard navigation and progress.

This is a distinctive feature: instead of a wall of diff, the reviewer walks a route. It depends on a model call to produce the route, which is why the normalizer exists (model output is untrusted and must be validated into stops).

### 2.4 Viewed files and review comments

`pullRequestViewedFiles.ts` (365 lines server) plus `usePullRequestFilesViewed`, `pullRequestFilesViewed.logic.ts`, and a browser test implement per-file "viewed" state with optimistic updates. `PullRequestReviewAnnotation`, `PullRequestCommentForm`, and `pullRequestReviewStore.ts` implement inline comments tied to file and line.

The subtle part is persistence: viewed state is local-first (it is about the reviewer's progress, not the PR), while comments are remote. Keep the two stores separate.

### 2.5 Diff rendering

`DiffPanel.tsx` is 1,171 lines with a shell, a worker-pool provider, `StyledDiffCodeView`, file tree, per-file loading boundary, `DiffFileStatus`, `DiffStatLabel`, and `HighlightedCodeLines`. `DiffWorkerPoolProvider` exists because highlighting large diffs on the main thread freezes the app. `HighlightedCodeLines.browser.test.tsx` asserts the rendered output.

BetterShape already renders diffs, but the review dossier's performance budget (open a 5,000-line diff without dropping frames) requires either a worker or virtualization. The worker pool is the upstream answer.

### 2.6 Host abstraction

`source-control-core` defines `PullRequestProvider`, `SourceControlProvider`, `SourceControlHost`, rate limiting, diff file revisions, checks, and merge messages. Six host packages implement it. `PullRequestProviderRegistry` selects by remote URL. `ReviewService` binds diff previews to the workspace root with realpath containment, which is a security boundary: a client-supplied cwd cannot read outside the configured workspace.

Do not port six hosts. The abstraction is good, but each host package is 4,000 to 24,000 lines. Ship GitHub, keep the trait boundary so GitLab can follow.

## 3. BetterShape today

| capability | status | evidence |
|---|---|---|
| git command surface | strong: 60+ commands | `src-tauri/src/commands/git/mod.rs` |
| hunk staging | exists | `commands/git/hunks.rs` (531) |
| branch graph | exists | `features/git/ui/graph/*` |
| blame | exists | `git_blame_file` |
| stash | exists | `git_stash_*` |
| diff view | exists, no worker/virtualization evidence | `features/git/ui/source`, diff components |
| GitHub create PR | exists | `features/git/ui/github/create-pr-dialog.tsx` |
| releases | exists | `releases-page.tsx` |
| AI PR summary/review/walkthrough commands | backend exists | `agent/commands/git_ai.rs` |
| PR list/detail | absent | no PR list surface |
| PR linked to thread | absent | thread model has no PR field |
| PR stack | absent | no stack concept |
| viewed files | absent | - |
| inline review comments | absent | - |
| review guide tour | absent (only a backend walkthrough command) | `walkthrough_pull_request` exists |
| multi-host | GitHub only | `lib/github`, `features/git/ui/github` |

The backend walkthrough command is an important asset: the model plumbing for a guided review already exists. The missing piece is the normalized stop model and the UI.

## 4. Port plan

### Phase 1: link threads to PRs (4 days)

1. Add `linked_pull_request` to the conversation record: `{ number, url, repo, state, checks, review_decision, head_sha, base_ref, updated_at }`.
2. Commands: `pr_link(conversation_id, url)`, `pr_unlink`, `pr_refresh`. Parse GitHub URLs into owner/repo/number; reject anything else with a clear error.
3. A sync loop: refresh linked PRs every 60 seconds while the window is focused, and on demand. Use conditional requests with ETags; GitHub rate limits are real. BetterShape already has a GitHub auth module, so reuse its token path.
4. Sidebar: a small PR pill on the thread row (state color plus number), and a detail popover with checks, review decision, and "open on GitHub".
5. Settle integration: merging a linked PR can settle the thread if the D10 policy says so.

### Phase 2: PR review surface (8-10 days)

1. A PR list in the GitHub section: open, mine, review requested. Filters by repo and state.
2. A detail panel with tabs: Summary, Files, Timeline, Checks. The summary is markdown (BetterShape already has `markdown.tsx`).
3. Files tab: file tree, per-file diff, viewed checkbox, inline comment composer.
4. Review submission: comment, approve, request changes. Confirm destructive actions.
5. Viewed state local-first in SQLite keyed by `(repo, number, head_sha, path)`, so a force-push resets viewed state honestly.

### Phase 3: stacks (5 days)

1. Detect a stack from the PR's base branch chain: follow base refs while they correspond to open PRs in the same repo, cap at 10 layers, detect cycles.
2. Compute each layer's diff against its parent head, not the default branch.
3. Stack header with layer chips, per-layer expand, and a "review from bottom" order.
4. Degrade gracefully: if a layer's base is not an open PR, show a single-PR view.

### Phase 4: review guide (5 days)

1. Normalize the existing `walkthrough_pull_request` output into `{ stops: [{ path, hunk_id, title, body, severity }] }`, validated strictly. A model that hallucinates a path must fail the whole guide, not produce a broken stop.
2. `GuideTour` component with a rail, next/previous, and progress persistence per `(repo, number, head_sha)`.
3. Keyboard: `j`/`k` for stops, `v` to mark viewed, `c` to comment.

### Phase 5: diff performance (4 days)

1. Move syntax highlighting to a web worker or a pool, with a per-file loading boundary.
2. Virtualize long diffs by hunk, not by line.
3. Budget: 5,000-line diff opens in under 300 ms on the reference machine; scrolling holds 60 fps.

### Phase 6: multi-host (deferred, 15+ days each)

Only if there is demand. Keep `pull_request` operations behind a trait now so the UI does not learn GitHub specifics:

```rust
trait PullRequestHost {
    fn fetch(&self, repo: &RepoRef, number: u64) -> Result<PullRequest>;
    fn list(&self, filter: ListFilter) -> Result<Vec<PullRequestSummary>>;
    fn checks(&self, repo: &RepoRef, number: u64) -> Result<Vec<Check>>;
    fn comment(&self, ...) -> Result<()>;
    fn review(&self, ...) -> Result<()>;
}
```

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `GitManager.test.ts` (6,962 lines) | worktree creation, remote refs, PR linking, edge cases; port selectively by feature |
| `PullRequestReviewGuideService.test.ts` | stack layer base selection, merge base per layer |
| `pullRequestFilesViewed.logic.test.ts` | viewed state invariants across head changes |
| `pullRequestStackSnapshot.test.ts` | stack state derivation |
| `DiffFileTree.browser.test.tsx` | tree filtering and keyboard |
| `StyledDiffCodeView.test.tsx` | highlighted output for tricky languages |
| `ReviewService` tests | workspace containment rejects outside cwd |

## 5.1 Roadmap rows (mausCode step 25)

The review and composer surfaces mausCode step 25 asks for land here as four rows, each independent and each its own commit:

1. **Stacked diff.** `DiffViewMode` gains `stacked`, rendering one hunk column per layer with the parent head as the base. `@pierre/diffs@1.0.10` supports only `diffStyle: "split" | "unified"`, so stacked is a host layout over two diff instances, not a library mode.
2. **Pinned files.** The file allow-list in a review session is data, and `canUseTool` denies an out-of-list read or write using `agent/security/paths.rs`; the list is shown in the review header.
3. **Panel width.** The code panel width persists per window through the existing window-storage helper; no new store.
4. **Task dialog and copy.** "Create task from comment" reuses the new-chat composer with the comment as the first message; Copy falls back to the same clipboard path as chat export.


## 6. Traps

- **Rate limits.** A 60 second poll per open PR will exhaust the token. Use ETags, batch by repo, and back off on 403 with `x-ratelimit-remaining: 0`.
- **Head SHA changes.** Comments anchored to a line in an old head become invalid. Store `head_sha` with every comment anchor and show "outdated" rather than misplacing the comment.
- **Stack base drift.** A parent PR's head can be force-pushed. Recompute merge bases on sync, never cache them across a head change.
- **Model output is untrusted.** The guide normalizer must validate paths against the diff's file list.
- **Do not port six hosts.** The abstraction is right; the implementations are a trap for a solo maintainer.

## 7. Effort

| phase | days |
|---|---:|
| link threads to PRs | 4 |
| review surface | 9 |
| stacks | 5 |
| review guide | 5 |
| diff performance | 4 |
| **total GitHub-only** | **27** |
| each additional host | 15-20 |

## 8. Acceptance criteria

1. A thread shows its linked PR state without opening a panel, and the state survives restart.
2. Merging the linked PR can settle the thread, and the settle reason is visible.
3. A stacked PR shows each layer's diff against its parent head, and a force-push recomputes correctly.
4. Marking a file viewed persists across app restarts but resets when the head SHA changes.
5. A review comment is anchored to a file and line with the head SHA; an outdated anchor is labeled, not moved.
6. A 5,000-line diff opens without freezing the UI.
7. The review guide rejects model output that references a file outside the diff.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/16-source-control-and-review.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D16: Source control and review depth. Scope: GitHub PR link and sync on a 60 second ETag poll, PR stacks, a review guide, viewed-file state keyed by repository, number, head sha, and path, and the four roadmap rows in section 5.1 (stacked diff, pinned files, panel width, task dialog). Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/16-source-control-and-review` from the current `draft/mega-absorb-all` only after dossier 15 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
