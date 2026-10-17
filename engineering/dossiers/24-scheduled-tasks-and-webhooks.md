# D24: Scheduled tasks and webhooks

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/24-scheduled-tasks-and-webhooks`) |
| Roadmap source | mausCode step 21 (issue #23) |
| Issue title | `D24: Scheduled tasks and webhooks` |
| Labels | `port`, `dossier:24`, `area:agent`, `size:M`, `stage:5` |
| Depends on | D01, D08 (runs), D09 (queue) |
| Blocks | none |
| Effort | 14 days |

**Port verdict: TAKE scheduled tasks. DEFER webhooks to a loopback-only, opt-in listener, and only after the scheduler is proven.**

BetterShape has no scheduler. It has "workflows", which are trigger phrases that inject instructions into a turn (`lib/chat/workflows.ts`), not schedules. The gap is real and the upstream design is small enough to port honestly.

## 1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `packages/contracts/src/scheduledTask.ts` | 320+ | schedule union, webhook endpoint, delivery log, task |
| `apps/server/src/scheduledTasks/Schedule.ts` | - | `nextScheduledRunAt`, `isMissedFixedTimeRun`, `isSameSchedule` |
| `apps/server/src/scheduledTasks/ScheduledTaskService.ts` | 1,290 | CRUD, run-now, enable, delivery log, dispatch to ThreadLaunch |
| `apps/server/src/scheduledTasks/webhookRoute.ts` | 134 | HTTP handler |
| `apps/server/src/scheduledTasks/webhookTemplate.ts` | 167 | prompt rendering, redaction |
| `apps/server/src/scheduledTasks/webhookVerification.ts` | 32 | HMAC verification |
| `apps/server/src/scheduledTasks/RelayDeliveryProof.ts` | - | relay anti-replay |
| `apps/server/src/scheduling/Scheduler.ts` | - | tick loop |
| `apps/web/src/routes/settings.scheduled-tasks.tsx` | - | settings page |
| tests | 1,800+ | schedule math, webhook security, delivery |

## 2. Mechanism

### 2.1 Schedule

```ts
type ScheduledTaskSchedule =
  | { type: "interval"; everyMs: number }            // > 0, min 60_000
  | { type: "fixed_time"; timeOfDay: "HH:MM"; weekdays?: number[] } // 0 = Sunday
```

Two decisions worth copying:

1. **Wall-clock fixed times, milliseconds intervals.** A user who asks for "9:30 every weekday" means local time, including across DST. Interval tasks mean elapsed time. Mixing them into one representation guarantees a bug.
2. **Minimum interval of 60 seconds.** Enforced at the schema, not the UI.

`isMissedFixedTimeRun` handles the laptop-was-closed case: on boot, a fixed-time task whose last run is before its most recent scheduled slot runs once, not N times. This is the difference between a scheduler and a loop with a sleep.

### 2.2 Task

A task carries: id, title, prompt, project, model selection, runtime mode, interaction mode, workspace strategy, enabled, schedule, last run status (`never | running | succeeded | failed`), next run time, and webhook endpoint configuration. Running a task dispatches a thread launch with the scheduled prompt; it is the same path as a user message, which means all the queue, checkpoint, and worktree logic applies.

That reuse is the central design choice. A scheduled task is not a separate execution engine.

### 2.3 Delivery log

Webhook deliveries are retained (50 per task), with body and rendered prompt truncated at 64 KB, and outcomes recorded (`accepted`, `rejected`, `rate_limited`, and so on). The log is the debugging surface; without it a webhook failure is invisible.

### 2.4 Webhook security

The upstream route is public by design (via relay) and therefore paranoid:

- HMAC-SHA256 over the **raw bytes**, with configurable header, encoding (`hex` or `base64`), and prefix (`sha256=`).
- Constant-time comparison.
- Body cap 1 MB, enforced on both `content-length` and the reader (chunked requests have no length).
- Delivery age cap 24 hours, with a relay delivery proof for anti-replay.
- Rate limit 60 accepted deliveries per task per minute, plus a queue cap of 20.
- Header and query redaction in the log, so a token in a query string never lands in storage.
- The route is mounted under a per-task token plus a random endpoint key; the token can be rotated.

## 3. BetterShape today

| capability | status |
|---|---|
| scheduler | absent |
| cron or interval tasks | absent |
| run task on a schedule | absent |
| delivery log | absent |
| inbound HTTP | absent (Tauri app, no server) |
| workflows | present but unrelated: trigger phrase to prompt injection |
| background wake | absent |

The absence of an inbound HTTP server is the crux for webhooks. t3 can receive a webhook because it runs a server with a public relay. BetterShape is a desktop app; a webhook would require either a public relay (cloud, excluded by the privacy constraint) or a loopback listener that only works while the app is open. That is still useful for local automation (a script finishing, a local CI tool), but it is a different product claim.

## 4. Port plan

### Phase 1: scheduler core (4 days)

1. **Schema.** `Schedule { interval { every_ms } | fixed_time { time_of_day, weekdays } }`, `ScheduledTask { id, title, prompt, project_id, model, mode, workspace_strategy, enabled, schedule, last_run_at, last_status, next_run_at }`.
2. **Math.** `next_run_at(schedule, after, timezone) -> timestamp` and `missed_fixed_time_run(last_run, schedule, now) -> bool`. Implement in Rust with `chrono` and `chrono-tz`. Unit tests for DST spring-forward and fall-back, weekday boundaries, and a laptop resuming after three days.
3. **Tick.** One loop, every 30 seconds, that loads due tasks, marks them `running`, and dispatches. Guard against double dispatch with a run id and a database constraint.
4. **Persistence.** SQLite table `scheduled_tasks` plus `scheduled_task_runs` (append-only, last 50 per task).

### Phase 2: dispatch (3 days)

1. Reuse the existing send path: create a conversation with a generated title, set the model and mode, send the prompt. Do **not** write a second execution path.
2. `run_now(task_id)` bypasses the schedule with the same code path.
3. Overlap policy: skip if the previous run is still going, unless the task allows overlap. Default skip, and record `skipped_overlap` in the run log.
4. Missed runs: on boot, if a fixed-time task missed exactly one slot, run it once and mark `missed_catchup`; if it missed more than one, do not replay a backlog.

### Phase 3: UI (3 days)

1. Settings section "Scheduled tasks" with a list, enable toggle, next run, last status, and run now.
2. Editor: title, prompt, project, model, mode, workspace, schedule (interval or time picker with weekday chips).
3. Run history with status and a link to the conversation.
4. A sidebar indicator for a running scheduled task, and a notification on failure.

### Phase 4: webhooks (4 days, opt-in, loopback only)

1. Settings toggle "Local webhook listener", default off. When on, bind to `127.0.0.1` on an ephemeral port (show the port) and require a per-task token.
2. Same HMAC verification, body cap, rate limit, and redaction as upstream, implemented in Rust with `axum` (already a dependency via the preview server? check) or a minimal hyper server.
3. Refuse to bind to `0.0.0.0`. A desktop app that opens a LAN port is a security incident waiting to happen.
4. Template rendering: a small, safe subset of placeholders (`{{body}}`, `{{json.field}}`, `{{headers.x}}`), with a size cap and no code execution. Redact configured headers before logging.
5. Explicitly document that webhooks only work while the app is running and only for local callers.

### Phase 5: public webhooks (explicitly not planned)

Do not add a relay, a tunnel, or any outbound registration. That contradicts the server-independence constraint and the privacy constraint in `AGENTS.md`.

## 4.1 Roadmap row (mausCode step 21)

Scheduled runs own their commit authorship. One policy row stores `user | app | co-author`, applied at the single git commit choke point; no provider-specific settings file is written. The scheduler records `origin = schedule` on every run (D08) and applies the battery and concurrency guards before claiming a due row. A scheduled run that cannot commit under the policy fails with a typed action ("Set an authorship policy") rather than committing as the user silently.


## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `Schedule.test.ts` | next-run math, DST, missed runs |
| `ScheduledTaskService.test.ts` | CRUD, enable, overlap, run-now |
| `ScheduledTaskService.webhook.test.ts` (873) | accept, reject, rate limit, age, replay |
| `webhookVerification.test.ts` | raw-byte HMAC, constant time, encoding |
| `webhookTemplate.test.ts` | placeholder rendering and redaction |

## 6. Traps

- **Do not replay backlogs.** A week offline must not fire 168 runs. One catch-up run or none, configurable.
- **Timezone changes.** A fixed time is local wall clock. If the user flies to another timezone, the task follows local time. Store the timezone used for the last computation so the UI can explain a surprise.
- **Schedule drift.** Compute `next_run_at` from the schedule and the current time, not by adding the interval to the last run, or a slow run permanently shifts the schedule.
- **Webhook is not a public API.** Say so in the UI. No relay, no tunnel, no port forwarding instructions.
- **Overlap is a policy, not an accident.** Decide it explicitly and log skips.

## 7. Effort

| phase | days |
|---|---:|
| scheduler core | 4 |
| dispatch | 3 |
| UI | 3 |
| webhooks (loopback) | 4 |
| **total** | **14** |

## 8. Acceptance criteria

1. A weekday 09:30 task fires at 09:30 local time across a DST boundary.
2. A laptop closed for three days runs a missed fixed-time task at most once on boot.
3. An interval task never drifts: after ten runs, the next run is still aligned to the interval boundary.
4. A task that is still running when the next slot arrives is skipped and the skip is logged.
5. The webhook listener refuses to bind to anything but loopback and requires a token.
6. A webhook with a valid signature but an old delivery timestamp is rejected.
7. A rotated token invalidates the old token immediately.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/24-scheduled-tasks-and-webhooks.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D24: Scheduled tasks and webhooks. Scope: interval and fixed-time tasks with a 60 second minimum, a missed-run policy, a 50-run cap, an opt-in loopback webhook with HMAC, and the commit-authorship policy row in section 4.1. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/24-scheduled-tasks-and-webhooks` from the current `draft/mega-absorb-all` only after dossier 23 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
