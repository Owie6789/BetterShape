# D10: Thread management: settle, snooze, titles, forks, and find

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/10-thread-management`) |
| Issue title | `D10: Thread management: settle, snooze, titles, forks, and find` |
| Labels | `port`, `dossier:10`, `area:chat`, `size:M`, `stage:2` |
| Depends on | D07 (composer), D08 (run records) |
| Blocks | D13 |
| Effort | 14 days |

**Port verdict: TAKE settle and snooze (high value, low risk). TAKE title regeneration. TAKE find-in-thread. DEFER fork and merge-back until the provider handoff layer exists (D19).**

BetterShape already has the sidebar primitives people notice: pin, unread, archive, filters, sections. This dossier is about the lifecycle layer above those primitives, the part that decides which threads deserve attention today.

## 1. Upstream inventory

| surface | files | lines |
|---|---|---:|
| contract | `packages/contracts/src/orchestrationV2.ts` (settle/snooze fields at 387-399, commands at 430-470) | - |
| implementation | `apps/server/src/orchestration-v2/ThreadSettlementService.ts` | 637 |
| auto-settle policy | same file, plus `shared/projectSettings` | - |
| titles | `apps/server/src/orchestration-v2/ThreadTitleRegenerationService.ts` | 300+ |
| find | `apps/web/src/components/chat/threadFind.ts` (25), `threadFindHighlights.ts` (259), `ThreadFindBar.tsx` (128), `useThreadFind.ts` (415), `useThreadFindNavigation.ts` (243), `ThreadSearchMatch.tsx` (66) | 1,136 |
| docs | `docs/user/thread-sidebar.md` | - |

## 2. Mechanism

### 2.1 Settle and snooze as state, not folders

A thread shell carries:

```
settledOverride: "settled" | "active" | null
settledAt, unsettledAt
snoozedUntil, snoozedAt, lastSnoozeWakeAt
autoSettleDisabledAt
```

The effective state is derived, not stored as a single enum. `settledOverride` wins; otherwise the auto-settle policy decides. This is what makes "Un-settle" meaningful: it is an override that also sets `autoSettleDisabledAt` so the next evaluation does not immediately re-settle the thread.

Defaults from the docs: settle inactive threads after three days, settle on pull request merge, and a closed PR can settle an idle thread. An open PR does not prevent inactivity settlement unless "Keep threads with a PR" is on. Pinning does not prevent settlement, and settling removes the pin.

Snooze sets `snoozedUntil` and `snoozedAt`; the wake path is a scheduled projection (`lastSnoozeWakeAt`) rather than a timer in the UI. Dragging a snoozed thread out wakes it. The wake is idempotent because it is a projection update, not a client-side timeout.

Why this matters for BetterShape: the sidebar currently has sections and filters, but no notion of a thread becoming stale. Users accumulate dozens of live threads and the list stops being a working set. Settle/snooze is the cheapest fix and it composes with the existing pinned/unread/archive model.

### 2.2 Title regeneration

`ThreadTitleRegenerationService.execute({ threadId, requestId, kind: { type: "initial", messageId } | { type: "regenerate" } })` dispatches `thread.title.regeneration.complete` with an optional title. The generation itself is an orchestration effect, not an inline call in the send path, so a slow title model never blocks the turn. `formatThreadTitleContext` lives in provider-core and is shared across providers.

BetterShape already generates titles for offline/Ollama paths (maus has a similar pattern in `chats.ts`). The port target is not generation; it is the **regenerate** action plus the effect indirection that keeps titles off the critical path.

### 2.3 Find in thread

t3's find is a server-assisted search with progressive counting:

- `threadFind.ts` has `stepThreadFindIndex(index, total, delta)` and `formatThreadFindCount`, both pure and tested.
- `useThreadFind` keeps `{ threadKey, query, offset, start, focusRequestId, navigationId, requestId, localSelection }`, debounces the query, and cancels stale responses by request id.
- The server returns `OrchestrationV2SearchThreadResult` with `entryId`, `runId`, `occurrence`, `activeIndex`, `totalMatches`, and a `complete` flag. Progressive counting means the UI renders "3 of 40..." while the server is still counting.
- `threadFindHighlights.ts` splits rendered text into segments, and `ThreadSearchMatch` scrolls a match into view without re-rendering the whole timeline.

The design detail worth stealing: `localSelection` is rebased against each new server response (`rebaseLocalSelection(state.localSelection, remote.data, navigationId)`), so when the user presses Enter while a count is still streaming, the selection does not jump back to the server's idea of the active match.

### 2.4 Fork and merge-back (deferred)

`thread.fork` takes `sourceThreadId`, `targetThreadId`, `sourcePoint`, optional `title` and `createdAt`. `OrchestrationV2ThreadForkSourcePoint` is one of `latest_stable`, `{ type: "run", runId }`, or `{ type: "checkpoint", checkpointId }`. `thread.merge_back` takes the same source point in reverse.

The resolution strategy is explicit: `native_fork` (provider supports forking a thread), `portable_context` (build a context handoff), or `delta_context`. The docs note that Cursor's public SDK does not expose native fork, so a fork becomes a portable handoff with the caveats that entails.

Deferring this is a scope decision, not a technical impossibility. A fork in BetterShape would be a new conversation seeded with a truncated transcript. That is shippable, but it is only honest if the UI says "new conversation from this point" rather than "fork". The provider-native version should wait for D19, because the same handoff machinery powers provider switching and recovery.

## 3. BetterShape today

| capability | status | evidence |
|---|---|---|
| pin | exists, with undo | `features/agent/sidebar/chats.tsx:318-331` |
| unread filter | exists | `chats.tsx:209-214`, `ChatFilter` |
| archive with undo | exists | `chats.tsx:333-350` |
| sections | exists | `features/agent/sidebar/sections.tsx` |
| lifecycle timestamps | absent | no `settled_at` or `snoozed_until` in Rust models |
| auto-settle | absent | no scheduler |
| snooze | absent | earlier grep false positive; no feature |
| title generation | exists, including automatic regeneration after ten turns and a `title_locked` flag | `agent/commands/titles.rs:207,311` |
| manual regenerate action | absent | no UI caller of `maybe_regenerate_title` |
| find in thread | absent | no thread search |
| fork | backend command exists, no UI action | `commands.forkConversation` plus `bettershape-chat-fork` event |
| merge back | absent | - |

The fork backend deserves a note: it exists but is unreachable, which is worse than absent because it looks implemented in a feature audit. Either wire it in D10 phase 3 or delete it.

## 4. Port plan

### Phase 1: settle and snooze (5-6 days)

1. **Schema.** Add to the conversation record: `settled_override: Option<SettledOverride>`, `settled_at`, `unsettled_at`, `snoozed_until`, `snoozed_at`, `last_snooze_wake_at`, `auto_settle_disabled_at`. Migration is additive; absent fields mean "derive".
2. **Derivation.** A pure Rust function `effective_status(thread, now, policy) -> Active | Settled | Snoozed` with tests. Policy: `inactivity_days: u32` (default 3), `on_pr_merge: bool` (default true), `keep_with_pr: bool` (default false).
3. **Commands.** `thread_settle`, `thread_unsettle`, `thread_snooze(until)`, `thread_wake`, `thread_set_auto_settle(enabled)`. Each returns the new shell so the UI does not guess.
4. **Wake loop.** A single scheduler tick every 60 seconds that wakes due snoozes. BetterShape has no background scheduler yet; D24 builds one, so implement this as the first consumer of that scheduler or as a tick inside the existing agent event loop if D24 slips.
5. **UI.** Add Settled and Snoozed shelves to `sections.tsx`, with drag to settle and drag out to wake. Reuse the existing undo pattern: settle shows an undo toast with a 10 second window.
6. **Pins.** Settling clears the pin. This is a deliberate upstream rule and it prevents two competing "keep this around" signals.

### Phase 2: find in thread (4-5 days)

1. **Search backend.** `thread_search(conversation_id, query, offset, limit)` scanning the stored message JSON. Return `{ matches: [{ message_index, occurrence, excerpt }], total, complete }`. Do it in Rust so the 1,900-line chat session hook stays out of the loop.
2. **Pure helpers.** Port `stepThreadFindIndex` and `formatThreadFindCount` with their tests. They are 25 lines and prevent off-by-one bugs in wraparound.
3. **Hook.** A `useThreadFind` in `features/chat/lib` with debounce, request ids, and local selection rebasing. Do not port the server streaming protocol; a single response is fast enough for local SQLite/JSON history.
4. **UI.** `ThreadFindBar` in the timeline header, Cmd+F scoped to the chat, match highlighting via a segmenter, Enter and Shift+Enter to step, Escape to close and restore scroll.

### Phase 3: title regeneration and fork decision (3 days)

1. Add a "Regenerate title" item to the thread menu, calling the existing title model with the last N messages. Disable while a turn is running.
2. Audit the orphan fork command. If it cannot be completed honestly in this phase, remove both the command and the event, and record the decision in the plan's skip list.

### Phase 4: fork and merge-back (deferred to D19)

Ship only with provider handoff. Minimum viable honest version: fork at a checkpoint creates a new conversation whose transcript is truncated at that checkpoint and whose filesystem is restored (D15). The UI says "Continue in a new chat from here". Merge-back is out of scope until there is a real branch/worktree model (D14).

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `ThreadSettlementService.test.ts` | policy evaluation, PR merge settle, open PR behavior, override persistence |
| `threadFind.test.ts` | wrap-around stepping, count formatting |
| `useThreadFind.browser.test.tsx` | keyboard navigation while results stream |
| `ThreadTitleRegenerationService.test.ts` | regeneration is idempotent per request id |
| `settleAndAdvance.test.ts` (web) | settling does not change thread order |

## 6. Traps

- **Do not store a status enum.** Derive it. An enum plus a timestamp plus an override is three sources of truth and they will disagree after a restart.
- **Snooze is not a timer.** If the wake is a `setTimeout`, closing the app loses it. Persist `snoozed_until` and reconcile on boot.
- **Settle must not archive.** Archived threads are hidden; settled threads are a working shelf. Upstream keeps them distinct and so should the UI.
- **Find must not re-render the timeline.** Use the segmenter and scroll to the match node, not a filtered message list.
- **Do not ship fork as "fork".** Label it "Continue in a new chat" until native provider forking exists.

## 7. Effort

| phase | days |
|---|---:|
| settle and snooze | 6 |
| find in thread | 5 |
| title regeneration plus fork audit | 3 |
| fork v1 (deferred) | 4 |
| **total now** | **14** |

## 8. Acceptance criteria

1. A thread idle for three days moves to Settled without user action, and Un-settle keeps it active for at least one activity cycle.
2. A snoozed thread wakes at the right time even if the app was closed for the interval.
3. Settling clears the pin, and the undo restores both the pin and the prior order.
4. Cmd+F finds text across the whole conversation, shows "n of m", and wraps without a jump.
5. Regenerating a title never blocks sending a message and is idempotent per request.
6. No feature is labeled "fork" unless it preserves the provider conversation.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/10-thread-management.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D10: Thread management: settle, snooze, titles, forks, and find. Scope: three-day settle and snooze, title regeneration after ten turns with title_locked, and find in thread. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/10-thread-management` from the current `draft/mega-absorb-all` only after dossier 09 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
