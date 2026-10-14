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
