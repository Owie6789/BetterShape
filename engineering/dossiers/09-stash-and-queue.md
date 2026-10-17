# D09: Prompt stash and queue control

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/09-stash-and-queue`) |
| Issue title | `D09: Prompt stash and queue control` |
| Labels | `port`, `dossier:09`, `area:chat`, `size:M`, `stage:2` |
| Depends on | D07 (composer), D08 (run records) |
| Blocks | D13, D21 |
| Effort | 11 days |

**Port verdict: TAKE both. Stash is a clean copy. Queue is a partial copy because BetterShape already owns a better cross-chat queue policy than t3, but lacks the control surface.**

This dossier pairs two features because they are one user story: "I am mid-thought and the agent is busy." Stash is what you do with the current prompt; queue control is what you do with the next ones.

## Part A: Prompt stash

### A1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `apps/web/src/promptStashStore.ts` | 232 | persistence, budgets, eviction, encode recovery |
| `apps/web/src/components/chat/ComposerStashMenu.tsx` | 224 | drawer, keyboard, list semantics |
| `apps/web/src/components/chat/ComposerStashBadge.tsx` | 58 | badge and pulse |
| `apps/web/src/components/chat/ChatComposer.tsx` | 4,221-4,650 | orchestration: stash current, restore, expiry, in-flight guard |
| `apps/web/src/promptStashStore.test.ts` | - | persistence and eviction tests |

Total first-party: about 515 lines plus the composer glue. This is the highest value-per-line feature in t3.

### A2. Mechanism

Storage envelope: `{ version: 2, state: { entries } }` under `t3code:prompt-stash:v2`, with `v1` removed on boot. `MAX_STASH_ENTRIES = 20`, `MAX_STASH_ENTRY_ATTACHMENT_CHARS = 2_700_000`.

Entry shape:

```ts
{
  id, createdAt, prompt,
  attachments: PersistedComposerImageAttachment[],
  files?: PersistedComposerFileAttachment[],
  droppedImageNames: string[],
  unreadableImageNames?: string[],
  pendingImageCount?: number,
  records?: ComposerContextRecord[]
}
```

Five design decisions are worth naming, because each one is a bug avoided:

1. **Persist synchronously, not debounced.** The comment in `persistEntries` states the reason: stashing is a deliberate keystroke, and the caller clears the composer on the strength of the write. A debounce timer cannot honestly report that the write landed. The store returns `{ written, durable }`, and `stashEntry` refuses to add the entry to state when `written` is false.
2. **Eviction only sticks on a successful write.** If persistence fails, the oldest entry is not dropped either, otherwise the failure would destroy data twice.
3. **Orphaned encode recovery.** `pendingImageCount` is only meaningful within the session that wrote it. `clearOrphanedPendingImages` runs at load and converts any surviving count into `unreadableImageNames` entries like `image 1 (not saved before reload)`. Without this, an entry would show "saving..." forever and refuse to restore.
4. **Durability is surfaced, not hidden.** `takeEntry` returns `durable: false` when the removal could not be persisted, meaning a reload would resurrect the entry. The composer shows a toast ("Restored prompt may reappear in the stash").
5. **Storage access is guarded at property level.** Reading `localStorage` itself can throw `SecurityError` in a sandboxed frame; `resolveBaseStorage` wraps the property access, not just get/set.

The menu owns keyboard input with a capture-phase `keydown` on `window` while open: Escape closes, Arrow keys move a highlight and scroll the row into view, Enter restores unless focus is on a button with `aria-label` (so the delete button keeps its own activation), and Cmd/Ctrl+Backspace deletes. Outside pointer-down closes, with an exception for the badge so the badge's own click toggles rather than double-handles.

Restore behavior in `ChatComposer`:

- Files are re-uploaded through the attachment pipeline. Stashed file uploads expire after 24 hours; expired names are reported in a toast and the user is told to attach again.
- Images that were dropped for size at stash time are reported at restore time, by name.
- `stashInFlightRef` deduplicates by snapshot key so a repeated Cmd+S on the same still-encoding prompt does not create two entries.

### A3. BetterShape today

No prompt stash. `features/chat/ui/composer/` contains activity, attachments, context-bar, dictation-button, edits, input, mentions, queue, reasoning-effort, thinking-bar, usage. No Bookmark icon, no stash store, no storage key.

Git stash exists and is unrelated (`git_stash_*` in `src-tauri/src/commands/git/mod.rs:2616`). Do not conflate them in UI copy.

### A4. Port plan

1. **Rust store, not localStorage.** `src-tauri/src/agent/commands/prompt_stash.rs` with a single `prompt-stash.json` under app data. Entries keep the same shape minus the char budget. Images go to `media_stash` and are referenced by id, which removes both `droppedImageNames` and the 2.7 MB cap. Keep `unreadableImageNames` and the orphaned-encode concept, because process death mid-write is real on desktop too.
2. **IPC surface:** `stash_list`, `stash_push`, `stash_take(id)`, `stash_delete(id)`, `stash_finalize_images(id, refs)`. All return `{ ok, durable }` style results, because the UI copy depends on durability.
3. **UI:** `features/chat/ui/composer/stash.tsx` (drawer plus badge) modeled on `ComposerStashMenu`, using BetterShape's `DropdownMenu` and `Icon` primitives. Bind Cmd/Ctrl+S in the composer scope only (BetterShape's shortcuts system has scopes but `when` is not evaluated; see D13, so implement the scope locally for now).
4. **Empty state** tells the user the shortcut. Copy: "Nothing stashed yet. Press {shortcut} with a prompt in the composer to stash it."
5. **Eviction:** cap 20, oldest dropped, and the toast says which prompt was evicted. t3 has the eviction result but the UI copy is an opportunity to do better.

### A5. Effort

| piece | days |
|---|---:|
| Rust store plus IPC plus tests | 2 |
| drawer, badge, keyboard | 2 |
| composer wiring, restore, expiry copy | 2 |
| **total** | **6** |

### A6. Acceptance criteria

1. Cmd+S in a composer with text creates an entry, clears the composer, and pulses the badge.
2. Quitting the app immediately after stashing preserves the entry.
3. Restoring an entry with an image reattaches the image byte-identical.
4. Deleting the last entry hides the badge.
5. A failed write leaves the composer intact and shows an error; no duplicate entry appears.
6. Twenty-first entry evicts the oldest and names it.

## Part B: Queue control

### B1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `apps/server/src/orchestration-v2/QueuedRunOrder.ts` | 32 | delivery ordering |
| `apps/server/src/orchestration-v2/Orchestrator.ts` | 1,120-1,360 plus command cases | start gates, hold, fail-fast |
| `packages/contracts/src/orchestrationV2.ts` | 2,760-2,890 | dispatch modes and queue commands |
| `apps/web/src/components/chat/QueuedMessageEdit.tsx` / `queuedMessageEdit.ts` | - | inline edit |
| `apps/web/src/components/chat/ComposerBanner.tsx` | - | queue banners |

### B2. Mechanism

t3 models a queued message as a **run** with `status = "queued"`, `queuePosition`, `queueHeld`, and a `userMessageId`. Dispatch intent is chosen at send time:

```
dispatchMode =
  | { type: "defer_start", workspaceStrategy? }
  | { type: "steer_active", targetRunId }
  | { type: "restart_active", targetRunId }
  | { type: "queue_after_active" }
  | { type: "start_immediately" }
```

`deliveryIntent: "auto" | "steer" | "restart"` is the user-facing axis; the dispatchMode is the resolved action.

Commands: `queued-run.reorder { runId, beforeRunId }`, `queued-run.cancel { runId }`, `queued-run.edit { runId, text, attachments?, context? }` (absent attachments means "leave as-is" so older clients do not strip files), `queued-message.promote-to-steer { queuedRunId, targetRunId }`, `queue.resume`, and `run.interrupt { holdQueue }`.

Delivery order is a three-key sort:

```ts
deliveryPriority = automaticCompletion runs first
then (queuePosition ?? ordinal)
then ordinal
```

An "automatic completion" is a run whose user message carries `delegatedCompletion`, that is, a subagent's result delivery. Delegated results jump the user's queue by design. This is a subtle, valuable rule: it means a fan-out whose first child finishes does not sit behind five typed follow-ups.

Start gates in `startNextQueuedRun`, in order:

1. `projectionStore.canStartQueuedRun(threadId)` false: stop.
2. thread archived or deleted, any blocking run, any queued run with `queueHeld`: stop.
3. usage limit blocked for the provider session: stop (do not burn the queue).
4. worktree missing after a failed worktree run: hold **all** queued runs (`queueHeld: true`) and wait for the user. The comment explains why: a message queued behind a cancelled worktree would run in the project checkout instead.
5. provider instance disabled for the project: hold all.
6. last failure class is non-validation and from the same provider instance: hold all.

`failQueuedRunStart` writes a synthetic error turn item titled "Queued provider could not start" and marks the run failed with `code: "queued_start_failed"` or `context_handoff_unsupported`.

### B3. BetterShape today

| concern | BetterShape | evidence |
|---|---|---|
| queue state | React state in `use-chat-session.ts` (`messageQueue`), not persisted | `use-chat-session.ts:171-178` |
| binding | each item bound to `conversationId`, `null` for draft | `message-queue.ts:11-14` |
| draft adoption | `adoptDraftQueuedMessages` rewrites `null` to the real id | `message-queue.ts:40-50` |
| drain gate | `canDrainQueue({ isLoading, sendsInFlight, skipDrain })` | `message-queue.ts:66-70` |
| UI control | remove, edit, send now | `queue.tsx:31-85` |
| reorder | none | no move/up/down handlers |
| hold after failure | `holdQueueAfterFailedSend` stops that chat's queue | `use-chat-session.ts:940` |
| attachments in queue | none; queue item is `{ id, content, conversationId }` | `message-queue.ts:9-15` |
| durable across restart | no | state only |

So BetterShape has the hard part (per-conversation binding and draft adoption) and lacks the easy part (ordering and attachments).

### B4. Port plan

1. **Extend the item shape** to `{ id, content, conversationId, attachments, context, createdAt, held? }`. Update `takeNextQueuedMessage` to return the item unchanged. This is a 30-line change plus UI.
2. **Add reorder** as a pure function `moveQueuedMessage(queue, id, beforeId)` in `message-queue.ts`, with tests mirroring t3's ordering semantics (stable order, `null` beforeId means end).
3. **Add hold.** Reuse the existing `skipQueueDrainRef` but make it per-conversation and visible: a banner "Queue paused after a failed send" with Resume, modeled on t3's `queueHeld`. Today `holdQueueAfterFailedSend` is invisible to the user.
4. **Attachments in queue.** Since D07 gives drafts attachments, queue items can carry `draftId` references instead of copying payloads. On drain, the item's attachments are materialized from the draft store. This avoids duplicate storage and means an edited attachment in the draft is what gets sent.
5. **Do not port `steer_active`.** BetterShape's turn model is a single in-flight turn with a cancel token; mid-turn steering requires provider-level support that the Rust turn loop does not have. Port `promote-to-steer` only after D15 and a provider capability probe. Until then, "Send now" means "cancel and resend", which is a different promise and should be labeled as such.
6. **Do not port `restart_active`.** Same reason.
7. **Persist the queue** per conversation in the draft store so a restart does not lose queued follow-ups. Cap at 50 with a test.

### B5. Effort

| piece | days |
|---|---:|
| item shape plus attachments by draft ref | 2 |
| reorder plus tests | 1 |
| visible hold/resume | 1 |
| persistence | 1 |
| **total** | **5** |

### B6. Acceptance criteria

1. Reordering by drag or keyboard changes drain order and survives a restart.
2. A queued message keeps its attachments and sends them exactly once.
3. A failed send pauses that conversation's queue and shows a Resume control; other conversations keep draining.
4. A queued message for chat A never drains into chat B, including when A is a draft that becomes real.
5. Cancel removes the item without sending it and without corrupting in-flight send counters.
6. Fifty-first item is rejected with a clear message rather than silently dropped.

## Part C: Sequencing and interaction with other dossiers

Stash (A) has no dependencies and should ship first: it is the smallest complete feature with the highest visible payoff. Queue control (B) depends on D07 for attachment references and benefits from D15 for the "cancel and resend" path. Neither depends on the provider adapter layer, which is why they belong in wave 1 while the provider work is still being designed.

Combined effort for D09: 11 days.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/09-stash-and-queue.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D09: Prompt stash and queue control. Scope: a durable prompt stash capped at 20, queue reorder, a visible hold, and failure isolation per conversation. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/09-stash-and-queue` from the current `draft/mega-absorb-all` only after dossier 08 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
