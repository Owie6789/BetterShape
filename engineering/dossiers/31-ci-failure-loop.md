# D31: The bounded CI failure loop

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/31-ci-failure-loop`) |
| Roadmap source | mausCode step 16 (issue #18) |
| Issue title | `D31: The bounded CI failure loop` |
| Labels | `port`, `dossier:31`, `area:git`, `size:S`, `stage:6` |
| Depends on | D08 (run records), D16 (source control, PR state), D26 (structured critic optional) |
| Blocks | nothing hard |
| Effort | 8 days |

**Port verdict: BUILD SMALL. mausCode step 16 is a critical-risk feature there because it adds unattended code changes. BetterShape has the PR surface and one narrow `check_runs` read inside a git helper (`agent/commands/git_ai.rs:206`), and no loop, no bound, and no feedback. Build the loop with hard caps and a visible stop reason.**

## 1. Today

- The app can authenticate to GitHub (`commands/github_auth`) and read PR state (D16). It does not list check runs for a branch, fetch a failing job's log, or propose a fix from CI output.
- The only check-run reference is `git_ai.rs:206`, which reads `check_runs` to summarize a PR; it ignores failures.
- There is no CI-specific prompt, no attempt record, and no PR comment from the app.

## 2. Flow

```
detect failing checks -> fetch failing logs -> signature -> diagnose -> repair (bounded)
      -> run local gate -> commit -> push -> wait for checks -> report or stop
```

### 2.1 Detect

Triggered manually ("Fix CI" on a failing PR) or automatically after a push when `agent.ci.autoFix` is on (default off). Detect lists check runs for the head SHA through the GitHub API, filters `conclusion in (failure, timed_out, action_required)`, and keeps at most 5 failing jobs.

### 2.2 Fetch

For each failing job: the job's step list, the failing step, and the log tail. The log endpoint returns a zip; one new dependency (`zip`) is named for this dossier and used only here. Fallbacks in order: `gh run view --log-failed` when `gh` is installed, then the API zip, then the check run's `output.text`/annotations. A job with none of the three is reported as `ci_log_unavailable`, not guessed.

Log handling:

- Keep the last 400 lines and the first occurrence of each error class (compile error, test failure, lint, timeout).
- Redact with D04 before it reaches the model. CI logs are a classic secret-leak surface.
- Cap the model input at 30,000 characters; the rest spills to a file the model can read with a path.

### 2.3 Signature and bounds

`signature = sha256(job_name + step_name + normalise(first_error_line))`. Normalisation drops timestamps, temp paths, and hex addresses.

Stops, all typed:

| Condition | Code |
| --- | --- |
| Attempt 2 already used | `ci_attempt_cap` |
| Same signature twice | `ci_no_progress` |
| Fix touches more than 3 files or 400 lines | `ci_fix_too_large` |
| Branch is `main` or protected | `ci_protected_branch` |
| Local gate fails after the fix | `ci_gate_failed` |
| Checks still pending after 20 minutes | `ci_wait_timeout` |

`agent.ci.maxAttempts` is 2 and is clamped to 3. Each attempt is a normal run (D08) with `origin = ci`, a commit, and a push to the PR branch. Never force-push, never amend, never touch a branch the app did not create or check out.

### 2.4 Local gate before pushing

The repair must pass the repository's own gate before the push: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build:runtime`, `npm run test:all`, `npm run skills:verify`, plus `cargo fmt --check` and `cargo clippy` when Rust changed. If a command is missing, it is skipped and named in the report; the loop never pushes on the assumption that CI will catch it.

This is the expensive part and the reason the attempt cap is 2, not 5.

### 2.5 Feedback

After each attempt, the run record carries: failing job, step, signature, diagnosis (one paragraph), files changed, gate result, and the new check state. With `agent.ci.comment` on (default off), the app posts one PR comment per attempt, edited in place on the next attempt rather than appended, so a PR does not collect five bot comments. The comment names the model, the attempt number, and the stop reason when it stops.

## 3. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/ci/{mod,detect,fetch,signature,repair,bounds,report}.rs` | loop |
| `src-tauri/src/commands/ci_cmds.rs` | status, start, stop, config |
| `src-tauri/src/agent/tools/dispatch/git.rs` | no change; the loop calls git through the existing module |
| `features/git/ci/*` | failing checks list, attempt timeline, stop reason |
| `lib/settings/store.ts` | `agent.ci.{autoFix,maxAttempts,comment}` |

## 4. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | check-run detection, log fetch with three fallbacks, redaction | 2.5 |
| P1 | signature, diagnosis prompt, bounded repair through the edit path | 2.5 |
| P2 | local gate, commit, push, wait and re-detect | 1.5 |
| P3 | attempt UI, stop reasons, PR comment | 1.5 |
| | **total** | **8** |

## 5. Acceptance criteria

1. A failing fixture PR lists the failing job and step, and a passing PR says "no failing checks".
2. A job whose log is unavailable ends with `ci_log_unavailable` and does not call a model.
3. The same signature on the second attempt stops with `ci_no_progress`; a changed signature may use the second attempt.
4. A diagnosis that proposes a 5-file change is refused with `ci_fix_too_large` before any edit.
5. The loop refuses to run on `main` or a protected branch with `ci_protected_branch`.
6. No push happens when the local gate fails; the report names the failing command.
7. CI logs never contain the fixture token after redaction, and the model input is capped at 30,000 characters.
8. With `comment` off, no PR comment is posted; with it on, two attempts produce one comment that is edited, not two.
9. A stop reason is present on every terminated run and is visible in the attempt timeline.
10. The full gate passes.

## 6. Traps

- **Do not retry the same fix.** The signature is the guard; without it the loop burns CI minutes and commits noise.
- **Do not push before the local gate.** "CI will tell us" is how a PR gets five red builds.
- **Do not trust CI logs.** They are attacker-influenced text and frequently contain tokens; redact and treat as data.
- **Do not comment per attempt.** Edit one comment; a PR thread with five bot comments is noise the maintainer has to clean.
- **Do not run on a fork PR without a checkout you own.** The branch guard is not only about `main`.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/31-ci-failure-loop.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D31: The bounded CI failure loop. Scope: failing check detection, log fetch with the three fallbacks and redaction, error signatures, bounded repair through the existing edit path, the local gate before any push, commit and push to the PR branch, re-detection, the attempt UI, and the single edited PR comment. Do not add unattended execution, do not force-push, do not run on protected branches, and do not raise the attempt cap.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/31-ci-failure-loop` from the current `draft/mega-absorb-all` only after dossier 30 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
