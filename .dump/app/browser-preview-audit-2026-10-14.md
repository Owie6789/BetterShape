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
