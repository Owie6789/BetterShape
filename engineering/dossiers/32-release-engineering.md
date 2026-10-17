# D32: Release artifacts, checksums, and an honest update check

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/32-release-engineering`) |
| Roadmap source | mausCode steps 32, 40 (issues #34, #42) |
| Issue title | `D32: Release artifacts, checksums, and an honest update check` |
| Labels | `port`, `dossier:32`, `area:runtime`, `size:S`, `stage:6` |
| Depends on | D01 (settings versioning, offline caches) |
| Blocks | nothing hard |
| Effort | 8 days |

**Port verdict: FINISH WHAT IS ALREADY HALF THERE. BetterShape has nine workflows and a five-script release pipeline, so mausCode step 32's "create a release workflow" does not apply. What is missing is the integrity gate, the channel-aware update feed, and a banner; the updater module exists and deliberately reports nothing.**

## 1. Today

| Piece | Where | State |
| --- | --- | --- |
| CI, PR, policy, security | `.github/workflows/{ci,pr,pr-policy,security,auto-merge}.yml` | exists |
| Build and release | `.github/workflows/{build-installers,release,nightly,preview}.yml` | exists |
| Version bump and notes | `scripts/release/{run,version,notes,assets,upload}.mjs` | exists |
| Checksums | none in `scripts/release/*` or `release.yml` | missing |
| Update status model | `lib/window/updater.ts` | full union type, no feed |
| Update check | `checkForAppUpdates` | returns `upToDate` without a request |
| Install | `downloadAndInstallUpdate` | error: "This build updates manually" |
| Dismissal | `bettershape-update-dismissed-version` in localStorage | exists, version-keyed |
| Changelog URLs | none | missing |

So a user on an older build is told they are current. That is worse than having no update feature.

## 2. Release integrity

Extend the existing pipeline; do not add a second one.

1. `scripts/release/assets.mjs` emits a manifest: `{ version, channel, builtAt, files: [{ name, os, arch, size, sha256 }] }`.
2. `scripts/release/upload.mjs` computes `SHA256SUMS` and refuses to upload when any artifact's size or hash differs from the manifest. A truncated artifact fails the job instead of publishing.
3. `release.yml` builds each target on its matching runner, then one aggregation job downloads all artifacts, verifies, and creates a **draft** release with the artifacts, `SHA256SUMS`, and `release-manifest.json`. Promotion stays manual.
4. Every artifact is marked unsigned in the release body until signing exists. Do not imply a signature.
5. `scripts/release/config.mjs` is the one place for channel, artifact naming, and publish target; the manifest and the updater both read the generated `release-config.json`.

The existing `npm run release` flow keeps working; `--pre` maps to channel `pre` and a GitHub prerelease.

## 3. Update check

`GET https://api.github.com/repos/<owner>/<repo>/releases?per_page=20` with `X-GitHub-Api-Version: 2022-11-28`, an ETag, and the current channel:

- `stable`: newest non-draft, non-prerelease release.
- `pre`: newest release including prereleases.
- A `local-only` build (dev, or `BETTERSHAPE_NO_UPDATE=1`) never checks and reports `localOnly`.

Semver comparison handles `x.y.z-pre.N`. The request is made at most once per 24 hours, uses the cached ETag, and stores the last good response in the settings store (D01-A3) so an offline start can still show "last checked 3 days ago".

Failure handling, all non-blocking:

| Case | Status |
| --- | --- |
| 403 rate limited | `error` with reset time from `X-RateLimit-Reset`, cached result retained |
| no network | `feedUnreachable`, cached result retained |
| malformed JSON | `feedInvalid`, cached result retained, one retry |
| newer version | `available` with notes, size, and the release page URL |

Never auto-download and never auto-install. `available` shows a "Download" action that opens the release page in the browser; the app does not run an installer from a background download in this dossier.

## 4. Banner and changelog

One pure selector, `selectUpdateBanner(state) -> Banner | null`:

| State | Banner |
| --- | --- |
| `available`, not dismissed | "BetterShape <version> is available" with notes and Download |
| `available`, dismissed for this version | none |
| `upToDate` | none; Settings shows the last check time |
| `feedUnreachable` | one-line notice in Settings only, not a toast |
| `localOnly` | "This build updates manually" in Settings |

The changelog URL is built, not stored: `https://github.com/<owner>/<repo>/blob/<tag>/CHANGELOG.md#<anchor>`, with the owner, repo, and tag from the release payload validated against `^[A-Za-z0-9._/-]+$` and the scheme fixed to `https`, host fixed to `github.com`. No user-supplied URL reaches the webview opener.

The anchor comes from the version: `## [0.9.4] - 2026-10-01` becomes `#094---2026-10-01` through a pure function with tests, not a regex copied from GitHub's renderer at runtime.

## 5. Where it goes

| File | Work |
| --- | --- |
| `scripts/release/{config,assets,upload}.mjs` | manifest, checksums, verification |
| `.github/workflows/release.yml` | aggregate, verify, draft |
| `src-tauri/src/commands/update.rs` | GitHub request, ETag, cache, rate-limit parsing |
| `lib/window/updater.ts` | real `checkForAppUpdates`, keep the status union |
| `lib/window/update-banner.ts` | pure selector |
| `features/shell/UpdateBanner.tsx`, `features/settings/ui/pages/about/*` | banner and About |

## 6. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | manifest, `SHA256SUMS`, verify-before-upload, draft release | 2 |
| P1 | release config module and channel wiring | 1.5 |
| P2 | update request, ETag, cache, rate limits, semver with `-pre` | 2.5 |
| P3 | banner selector, About page, changelog URL builder | 1.5 |
| P4 | tests for checksum refusal, channel filter, dismissal, local-only | 0.5 |
| | **total** | **8** |

## 7. Acceptance criteria

1. Deleting one byte from a built artifact makes the release job fail with the artifact name, size, and expected hash; nothing is uploaded.
2. A release built from `--pre` appears only for the `pre` channel; a stable build ignores it.
3. `checkForAppUpdates` performs one request, caches the ETag, and a second call within 24 hours makes no request (instrumented counter).
4. A 403 with `X-RateLimit-Reset` produces `error` with the reset time and keeps the cached version visible.
5. Offline start shows the cached result and "last checked" age; no spinner hangs.
6. A local-only build makes no network request and Settings says "This build updates manually".
7. Dismissal is per version and per channel; a newer version shows the banner again.
8. The changelog URL for `0.9.4` resolves to the documented anchor, and a tag containing `..` is rejected by validation.
9. The release body contains the unsigned marker, and no UI copy claims a signature.
10. The full gate passes.

## 8. Traps

- **Do not add electron-updater or Tauri's updater plugin in this dossier.** The app's install story is manual; a silent installer is a separate decision with signing prerequisites.
- **Do not trust `tag_name` for a URL.** Validate the character set and build the URL from parts.
- **Do not poll more than once a day.** GitHub's unauthenticated limit is 60 requests per hour per IP, shared with everything else on the machine.
- **Do not show a banner for a feed error.** A toast that says "could not check for updates" trains users to dismiss real ones.
- **Do not compute the anchor at render time from the changelog body.** The version-to-anchor function is testable; scraping is not.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/32-release-engineering.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D32: Release artifacts, checksums, and an honest update check. Scope: the release manifest and SHA256SUMS with verify-before-upload, the aggregation job that creates a draft release, the release config module, the channel-aware update request with ETag and 24-hour cache, the pure banner selector, the About page, and the changelog URL builder. Do not add an auto-installer, do not sign artifacts, do not change the versioning cadence, and do not add a second release pipeline.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/32-release-engineering` from the current `draft/mega-absorb-all` only after dossier 31 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
