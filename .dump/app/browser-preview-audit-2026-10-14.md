# Browser Preview post-base audit, 2026-10-14

Scope: PR #4 (`arena/b0d84ccc-app` vs `draft/mega-absorb-all`) after the base
moved from `764f135` to `0994615`. Review protocol: `FULL-REVIEW.md` Part I,
evidence levels E0 to E5.

## Mistakes recorded

1. Edit-tool phantom edits. `edit_file` reported success while nothing
   changed, and one CodeAnt-round edit mangled `lib/preview/tauri-mock.ts`
   (505 lines became 508 with an orphaned fragment). Root cause: trusting
   the tool response instead of the file. Corrected behaviour: grep the
   edited lines after every edit, and for multi-line or stubborn edits use
   python with replacement-count assertions. Smoke-test runtime behaviour;
   `node --check` alone missed a bad edit once.

2. Routine fetches missed base movement. The local remote-tracking ref for
   `draft/mega-absorb-all` stayed stale because the checkout fetchspec only
   tracks `main` and `arena/b0d84ccc-app*`. A plain `git fetch origin` did
   not update it, so the base looked frozen while it had moved 17 commits.
   Root cause: trusting one fetch command. Corrected behaviour: fetch the
   base with an explicit refspec and cross-check against the GitHub branch
   API before planning work against a base.

3. Playwright server reuse assumptions. Two consecutive runs blocked each
   other when an externally started server already held port 48921:
   `reuseExistingServer` deliberately refuses reuse in static mode, because
   an unmocked page must never be served to the suite. Root cause: starting
   a server manually and expecting the config to adopt it. Corrected
   behaviour: let Playwright spawn the server, or stop the manual one
   before running the suite.

## Audit conclusions that still hold

- `shouldMockEvents` stays unset in the preview mock. The installed
  `@tauri-apps/api` 2.11.0 source intercepts `plugin:event|*` invokes only
  when that flag is set, and it installs `runCallback` unconditionally.
  Enabling it would hand the mock handler id back and break the tracked
  listener registry. Verified in `node_modules/@tauri-apps/api/mocks.js`
  and `event.js` (`listen` invokes `plugin:event|listen` and returns the
  id `unlisten` sends back as `eventId`).
- The trusted deployer stays a `workflow_run` subscriber in
  `.github/workflows/preview-deploy.yml`. GitHub resolves subscribers from
  the default branch, so the file activates only after it lands there.
  `preview.yml` stays secretless. This is the CodeAnt P1 root-cause fix,
  not a temporary shape.
- Screenshot baselines stay current. A full local run of 25 tests passed
  on Linux/Chromium after the base update, including the three `@visual`
  baselines against `dev:browser`.
- The a11y baseline gate in `e2e/helpers/audit.ts` fails only on new or
  increased critical/serious axe violations. Lower the counts in
  `e2e/a11y-baseline.json` as violations are fixed. Never raise them
  silently.

## Known blockers that are not code

- SonarCloud's remaining failure on this PR is the
  `preview-deploy.yml` fork-execution security hotspot. It needs a human
  review marked "Safe" in the SonarCloud UI. No code change can clear it.
- CodeRabbit answers "Review rate limited" on this repository. CodeAnt's
  approval agent reported `context_truncated` on head `74012b7` and
  approved nothing; it self-describes as shadow/advisory. Re-tag after
  every push, per `AGENTS.md`.

## Addendum, 2026-10-15

- The sandbox working tree was found reset to the branch cut point
  (`764f135`) with the pre-merge file state as uncommitted changes,
  while the remote branch already held the merged and audited head
  (`532f182`). Evidence: `git log origin/arena/b0d84ccc-app` showed
  `4d56402`, `252bd64`, `532f182`; local `HEAD` showed only `764f135`.
  Recovery: stashed the stale snapshot as `arena-snapshot-backup-pre-resync`
  and reset the tree to the remote head. No work was lost. The stash
  tracked files differ from the new head only where the base merge
  superseded them (`AGENTS.md`, `eslint.config.mjs`, `package.json`,
  search index), and the untracked snapshot files are earlier versions
  of files the later commits extended.
- The base moved again after the merge, to `f1a43d6` (review policy
  tightening plus `.agents/PREFLIGHT.md`). Merged as `0e6b590` with no
  conflicts. The branch commit also records that the plain
  `git fetch origin` had silently kept the local base ref stale, so
  future base checks fetch the base refspec explicitly and cross-check
  the branch API.

## Principles audit, 2026-10-15 (second base move)

A self-review pass against `REVIEW.md` and `FULL-REVIEW.md` Part I ran
on head `16fe0c1` (after merging the base at `f1a43d6`). The evidence
ledger, all at E3 on the local head unless noted:

- Mock IPC contract (seeded project, plugin fallback, event delivery,
  git log paging): `tests/preview/tauri-mock.test.ts`, 15 of 15 pass.
- Whole-renderer regression surface: `npm run test`, 106 files and
  853 tests pass.
- Type and style gates: `npx tsc --noEmit` clean; full-repo
  `npm run lint` exit 0 with 157 warnings (baseline class, none from
  this change).
- Browser behaviour: `npm run build:preview` then the full Playwright
  suite in static mode, 25 of 25 pass including the three `@visual`
  baselines. Local sandbox only; CI runs the same suite without
  `@visual`.
- Skills: `npm run skills:verify`, 53 of 53 locked skills verified.
- Rust gates: not run locally, no Cargo toolchain in the sandbox. The
  change touches no path under `src-tauri/`; CI runs the Cargo jobs.

Two findings came out of the pass and were fixed before the next push,
under the rule that minor findings get fixed before bots post them:

1. Style drift against the writing rules in `AGENTS.md`: 48 added lines
   used em dashes, and 30 comments credited review bots by name
   (CodeAnt, Sourcery, Kilo). Comments must state the constraint, not
   the reviewer. Both classes were swept across the files this change
   owns; explanations were kept, attributions and em dashes removed.
2. Test names carried the same bot attributions
   (`describe("event delivery (CodeAnt)")` and similar). Renamed to
   plain behaviour names.

Checked and deliberately left alone:

- `preview-deploy.yml` runs deploy steps only in the trusted
  `workflow_run` context; PR code never executes there. Its substring
  rejection of `VERCEL_`/`DATABASE`/`TOKEN` variable names matches the
  Vercel CLI contract, so it is not the heuristic defect the review
  protocol warns about.
- The a11y gate in `e2e/helpers/audit.ts` fails only on new or
  increased critical/serious axe violations against
  `e2e/a11y-baseline.json`. That matches the baseline-ledger pattern,
  and the baseline moves in one direction only.
- The CI `test-e2e` job stays out of the `ci-success` gate. The job
  comment states the promotion condition: a few weeks of green history.
- SonarCloud still flags the fork-execution shape of
  `preview-deploy.yml` as a security hotspot. No code change resolves
  it, because the design is the fix: the workflow runs from the default
  branch, checks out no PR code, and re-stages a fixed static-only
  Build Output before deploying. A human must mark it Safe in the
  SonarCloud UI.

## Review wave on head 83ce964, 2026-10-15

The push of `83ce964` surfaced eight unresolved threads (six CodeAnt,
two CodeRabbit). Each was verified against the code before any fix:

1. `serve-static.mjs` containment was lexical only, so a symlink inside
   `out/` could serve a file outside the export. Verified real:
   `existsSync`/`statSync` follow symlinks. Fix: candidates are compared
   by `realpathSync` against the real export root. A planted symlink to
   `/tmp/secret.txt` inside `out/` now returns 404; normal routes still
   serve 200.
2. `createReadStream(file).pipe(res)` had no error handler, so a file
   deleted between stat and open would crash the server. Verified real.
   Fix: `stream.on("error", () => res.destroy())`.
3. Mock `delete_path`/`trash_path`/`rename_path`/`copy_path` returned
   success without touching the fake tree. Verified real. Fix: the four
   handlers now mutate `state.files`/`state.dirs` and the parent
   listings; delete closes an open tab whose file vanished (backend
   parity), rename retargets the open tab. Four contract tests added.
   First implementation had a self-inflicted bug: `removeTree` ran
   before the subtree snapshot, so renames moved nothing. Caught by
   reading the final order before running the tests, not by a failing
   test; the helper now snapshots, then deletes.
4. `preview-deploy.yml` could deploy an older run's artifact after the
   PR head advanced. Verified real in the resolve logic: a resolved PR
   was never compared with the run's head SHA. Fix: the resolver emits a
   `head-current` output and both the deploy and mark-stale jobs require
   it. The same gate also stops an old failed build from marking a newer
   preview stale.
5. Mock `git_log` dates were ISO strings. Verified real: Rust
   `GitLogEntry.date` is `commit.time().seconds().to_string()`
   (`src-tauri/src/commands/git/mod.rs:2602`), and the graph renders
   `parseInt(log.date) * 1000`. Preview commits would have rendered as
   1970 dates. Fix: emit Unix seconds as a string, with a contract test
   pinning the `^\d{10}$` shape.
6. Status bar split awareness. Verified true with a correction: Status
   renders in `features/agent/layout.tsx`, and `EditorSplitProvider`
   mounts only inside a file tab in `features/agent/workspace/index.tsx`,
   so the optional split hook is always null in Status and
   `pickStatusFile` always falls back to the backend active file. The
   base code called the throwing `useEditorSplit()` from the same
   position. Wiring split state into workbench chrome is a behaviour
   decision for the workbench owners and stays out of this change; the
   misleading comment in `status.tsx` now states the fallback plainly.
7. `.github/vercel-cli/package.json` described `preview.yml` as the CLI
   consumer. Verified real; now names `preview-deploy.yml`.
8. `docs/developing/ci-cd.mdx` credited `preview.yml` with deploying.
   Verified real; rewritten so `preview-deploy.yml` owns deployment, the
   sticky comment, and the default-branch activation note.

## Review wave on head 80f111d, 2026-10-15

Three CodeAnt threads, all verified real and fixed:

1. `mark-stale` in `preview-deploy.yml` keyed only on the PR build's
   conclusion, so a failed Vercel deploy after a green build left the
   previous live URL presented as current. The job now needs the deploy
   job as well and runs under `always()` when the build failed or
   `needs.deploy-preview.result == 'failure'`, while still requiring
   the `head-current` gate from the previous wave. A secrets-absent
   skipped deploy does not trigger it.
2. `playwright.config.ts` treated an existing bundled-Chromium file as
   usable. On a host without libnss3/libnspr4 the file exists but
   cannot start, so the fallback never engaged. `bundledChromiumUsable`
   now probes the binary with `--version` in a child process before
   accepting it.
3. The same fallback handed `@sparticuz/chromium`'s Amazon Linux binary
   to macOS or Windows when no bundled browser existed. `sandboxChromium`
   now returns no fallback off Linux, so Playwright reports the missing
   browser with its own actionable error.

Full local suite after these fixes: Playwright 25 of 25 including the
visual baselines, Vitest 857 of 857, `tsc` clean, ESLint 0 errors.

## Review wave on head c74a267, 2026-10-15

Four CodeAnt threads. Three were straightforwardly real (older-deploy
re-check window, IPC-quiet preceding the Git manager's 1.65s intro
mount, directory rename leaving descendant tabs behind), and the fourth
(smoke specs accepting any route shell) uncovered two facts the fix had
to respect:

- Smoke specs: each route now asserts its own shell. Writing the route
  map required reading `app/client-layout.tsx`: `/git` and `/branch`
  are secondary windows and render `#bettershape-settings`, not the
  workbench shell. The first run of the stricter map failed on exactly
  that assumption, which is the stricter test working as intended.
- Audit settle: the git routes moved into a project-seeded describe
  (the welcome seed leaves the Git manager on an empty state), and the
  audit waits for seeded content after IPC quiet before running axe.
  Scanning the populated Git UI then surfaced pre-existing violations
  the splash had hidden: `aria-toggle-field-name` on four staging
  checkboxes and one `target-size` node. The checkboxes are the shared
  `components/ui/checkmark.tsx` primitive rendered without an accessible
  name; it now takes a `label` prop defaulting to "Checkbox", and the
  Git source passes "Stage/Unstage <path>" and "Stage all in <title>".
  The remaining target-size node sits inside a 20px row affordance;
  enlarging it is a design decision, so `/git` records `target-size: 1`
  in `e2e/a11y-baseline.json` under the file's existing rule that a
  raise needs a reason in the PR.

## Review wave on head 44bf166, 2026-10-15

One CodeAnt thread: `existsSync`/`statSync` in `serve-static.mjs` could
throw uncaught if a file vanished between the two calls during a
rebuild. Verified real. The candidate loop now relies on
`realpathSync` inside the existing try/catch (a vanished candidate is
skipped), so the exists-then-stat window is gone rather than guarded.
Verified by serving the rebuilt export after the change: `/` and
`/git/` return 200, a missing asset returns 404.

## Review wave on head a56d310, 2026-10-15

Eleven unresolved threads: eight DeepSource (seven JS-D1001 plus a
complexity note on the edited `Checkmark` component), three CodeAnt.

- JS-D1001 stays wontfix under `AGENTS.md` (comments must explain, not
  decorate). One of the seven sits on `collectTimings` in
  `e2e/helpers/audit.ts`, which genuinely lacked the one-line comment
  its neighbours carry; that one line was added, the rest stand.
- The `Checkmark` complexity note (10) predates this change: the branch
  count comes from the tri-state rendering, and the edit adds one
  `aria-label` attribute with no new branch. Extracting subcomponents
  to satisfy the metric would churn a shared primitive for no behaviour
  gain; noted as wontfix with evidence.
- CodeAnt, `ChatRow` omits `label`: verified real. The sidebar chat
  selector now passes `Select <title>`, so screen readers announce the
  conversation, not a bare "Checkbox".
- CodeAnt, `afterAll` receives `WorkerInfo`: verified false by
  execution. Playwright passes `TestInfo` to `afterAll` (only
  `beforeAll`/`afterAll` worker fixtures differ), and the audit suite
  has produced `test-results/browser-audit.json` in every local run of
  this branch, which the hook writes.
- CodeAnt, the head re-check used `process.exit(0)`: verified real.
  Later steps gated only on secrets would still have run. The verdict
  is now a `stand-down` step output, and the download, stage, and
  deploy steps all require it to not be `true`.

## Review wave on head 2344506, 2026-10-15

Three CodeAnt threads, all verified real:

1. The optional Morph QA step could fail the deploy job after a
   successful deploy, skipping the preview-link comment and tripping
   the stale marker. It now runs with `continue-on-error: true`.
2. The stage-all checkbox label keyed on the section's `isAllStaged`
   prop while the handler (`handleToggleAllChanges`) acts on the global
   `changes` list, so with mixed staging the announced action and the
   performed action disagreed. The label now names the global action
   ("Stage all changes" / "Unstage all changes"), matching the handler.
   The underlying prop/handler impedance predates this PR; only the
   label introduced here was wrong.
3. The mock kept one `logStreamOffset` for all callers. The Rust
   backend keys streamers by `callerId` (`STREAMERS` map in
   `src-tauri/src/commands/git/mod.rs`), so the mock now keeps a
   per-caller offset map, deletes it on `git_log_stream_stop`, and a
   contract test covers interleaved streams. While in this code, the
   `git_branch_graph` fixture still emitted an ISO date; it now emits
   Unix seconds to match the same `GitLogEntry` contract fixed earlier.

## Loop status on head 6ea2724, 2026-10-15

After the third consecutive fix round, the thread audit reads 167 total,
0 unresolved, and the bare `@codeant-ai review` tag on `6ea2724` produced
no new threads after a full wait. SonarCloud lists exactly two open
issues on the PR: the known `preview-deploy.yml` fork-execution
security hotspot (human "Safe" marking in the SonarCloud UI, unchanged)
and one maintainability item, "refactor this function to not always
return the same value" on `pty_available_shells: () => []` in the mock.
That constant return is the contract: no PTY exists in a browser
preview, the handler must report an empty shell list, and the command
is deliberately modeled. Same wontfix class as the doc-comment metric.
CI workflow runs for this branch stop at `532f182` in the Actions list:
the Actions API itself works (external bots post statuses on every
push), so the gap is on the GitHub side and is recorded here rather
than guessed at. Local gates stand in for it: Vitest 859 of 859,
Playwright 25 of 25 including visuals, `tsc` clean, ESLint 0 errors.
