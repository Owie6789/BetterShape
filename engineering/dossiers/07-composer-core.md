# D07: Composer core, drafts, context records, and citations

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/07-composer-core`) |
| Issue title | `D07: Composer core, drafts, context records, and citations` |
| Labels | `port`, `dossier:07`, `area:chat`, `size:M`, `stage:2` |
| Depends on | D01-B1 |
| Blocks | D09, D13, D21 |
| Effort | 13 days |

**Port verdict: TAKE, split into four shippable pieces.**
Keep t3's data model almost verbatim, rewrite the persistence layer because t3 targets `localStorage` and BetterShape already has a Rust-owned settings store, and defer the rich-text editor internals (t3 uses a ProseMirror-class document with a bespoke node view layer; BetterShape's `input.tsx` is 1,561 lines of textarea plus overlay).

## 1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `apps/web/src/composerDraftStore.ts` | 4,306 | the draft store: per-thread composer state, attachment encoding, model/mode selection, context records, partialization, migration from version 1 to 9 |
| `apps/web/src/components/chat/ChatComposer.tsx` | 7,369 | the composer surface: send, stash, recall, attachments, slash commands, mentions, code blocks, prompt length validation |
| `packages/contracts/src/composerContext.ts` | 282 | context record schemas |
| `apps/web/src/lib/composerContextReferences.ts` | 116 | inline reference insert/remove/ensure/format |
| `packages/shared/src/composerContextReferences.ts` | - | shared ID and reference helpers |
| `packages/contracts/src/assistantCitations.ts` | 30 | citation schema |
| `packages/shared/src/assistantCitations.ts` | - | `assistantCitationsToPlainText`, offset helpers |
| `apps/web/src/components/chat/AssistantCitationChip.tsx` | 267 | inline citation chip |
| `apps/web/src/components/chat/AssistantCitationCommentEditor.tsx` | - | comment attached to a citation |
| `apps/web/src/components/chat/AssistantSelectionToolbar.tsx` | 163 | select text to cite |
| `apps/web/src/components/chat/AssistantCitationSource.tsx` | - | jump back to source message |
| `apps/web/src/lib/terminalContext.ts` | 101 | terminal selection as composer context |
| `apps/web/src/components/chat/composerPromptHistory.test.ts` | - | prompt history semantics |
| `packages/client-runtime/src/composerThreadItems.ts` | 50 | thread mention candidates |

The composer directory alone is 237 files. This dossier covers the state layer and the two features with the highest value per line (context records, citations). The editor internals are D01b in the wave plan and are scoped separately.

## 2. Mechanism

### 2.1 Draft identity and persistence

`composerDraftStore.ts` defines `COMPOSER_DRAFT_STORAGE_KEY = "t3code:composer-drafts:v1"` and `COMPOSER_DRAFT_STORAGE_VERSION = 9`. The store is a zustand store wrapped in `persist` with a custom `PersistStorage` built from `createDeferredStorage` at `COMPOSER_PERSIST_DEBOUNCE_MS = 300`. Two details matter:

1. `composerDebouncedStorage` receives the live state object, and the serializer calls `partializeComposerDraftStoreState` at flush time, not at call time. That means the debounce coalesces writes even though the state object mutates in place.
2. A `beforeunload` listener calls `composerDebouncedStorage.flush()`. Without it, the last 300 ms of typing is lost on close, which is exactly the window users notice.

Drafts are keyed by a `DraftId` (branded string) and by `ScopedThreadRef` (environment plus thread). `DraftThreadEnvModeSchema = Schema.Literals(["local", "worktree"])` records whether the draft should start a worktree. Attachments come in two kinds:

- `PersistedComposerImageAttachment`: `{ id, name, mimeType, sizeBytes, source?, dataUrl }`.
- `PersistedComposerFileAttachment`: file metadata plus `uploadedAttachmentId` and `uploadEnvironmentId`.

`composerFileNeedsReattach(file)` returns true when a restored file has neither a live `File` handle nor an uploaded attachment id. That single predicate is the difference between "restored draft" and "draft that silently sends a broken reference".

### 2.2 Context records

`composerContext.ts` (282 lines) defines records for five origins: file, terminal, preview annotation, review comment, thread. Each record carries a stable id, a display label, and the minimum payload needed to render a chip and to serialize the reference into the prompt text.

The reference layer is the interesting part. `composerContextReferences.ts` exposes `appendInlineContextReference`, `removeInlineContextReference`, `ensureInlineContextReferences`, `formatInlineContextReference`, and `replaceComposerContextReferences`, while the shared package owns `toComposerContextId` and `toKindScopedComposerContextId`. The invariant: a context chip in the editor and a context record in the draft are two representations of one id. Text edits that delete the token must drop the record; mode switches that rewrite the prompt must re-ensure tokens.

`stripInlineContextReferences` in `lib/composerContextReferences` is used by the stash snippet builder, so a stashed prompt shows readable text rather than `[[file:...]]` tokens.

### 2.3 Citations

`AssistantCitation` is versioned (`version: 1`) and stores `environmentId`, `threadId`, `messageId`, `text`, optional `comment`, `start`, `end`, `prefix`, `suffix`. Positions are UTF-16 offsets, explicitly not Markdown offsets. Caps: 8,000 characters for text and comment, 32 for prefix and suffix. A filter enforces `end > start` and non-blank text.

The prefix/suffix window is the anchor. When the source message re-renders with different markdown, the offsets may drift; the UI can use the 32-character context to relocate the span. That is a cheap, robust alternative to storing DOM ranges, and it is portable to any renderer.

### 2.4 Prompt history recall

`ChatComposer` keeps `promptHistoryPositionRef` with `{ position, targetKey }` and a `recalled` field inside the position. Two behaviors are encoded in comments and tests:

- Recall is scoped to the thread target key (`promptHistoryTargetKey`), because the composer persists across thread navigation. A recall started in thread A must not paste into thread B.
- `recallableComposerPrompt` strips attachment-only bootstrap prompts, plan implementation prompts, and trailing context blocks. Tests cover markdown code blocks with indentation, mid-prompt context, and image-only prompts.

## 3. Tests worth porting as acceptance criteria

| test file | what it pins |
|---|---|
| `composerDraftStore.test.ts` | migration, partialization, attachment reattach |
| `composerPromptHistory.test.ts` | recall stripping rules and thread scoping |
| `assistantCitations.test.ts` (shared) | plain-text extraction and offset behavior |
| `composerThreadItems` tests | thread candidates exclude self, archived, other environments, cap at 5 |
| `ComposerStashMenu` browser tests | keyboard ownership while the menu is open |

These are behavior specifications, not implementation tests. Port them as Rust unit tests for the store and as Vitest tests for the React layer.

## 4. BetterShape today

| concern | BetterShape | evidence |
|---|---|---|
| draft persistence | one global string in `localStorage["bettershape-chat-input"]`, written on blur/close | `features/chat/lib/use-chat-session.ts:799` |
| per-chat drafts | none; tabs store is per project, not per draft | `use-chat-session.ts:72-103` |
| composer prefs | `COMPOSER_PREFS_KEY` per project | `use-chat-session.ts:119-136` |
| attachments | `features/chat/ui/composer/attachments.tsx` (320 lines) | present |
| mentions | `mentions.tsx` (635 lines) plus `lib/chat/mentions.ts`, `mention-registry.ts` | present |
| context chips | `context-bar.tsx` (131 lines), design and element mentions exist | partial |
| citations | absent | no `citation` symbol in the repo |
| prompt history | absent as a typed feature | no recall module |
| rich text | textarea plus overlay | `input.tsx` 1,561 lines |

The gap is not "the composer is missing". It is that the composer is **stateless across navigation**. A user who starts a message in chat A, visits chat B, and comes back loses the message unless it was the most recent global input. t3 solved this in 4,306 lines; BetterShape can solve 80 percent of it in roughly 400.

## 5. Port plan

### Step 1: Rust-owned draft store (2-3 days)

New module `src-tauri/src/agent/commands/drafts.rs` plus a `history`-style JSON file per project, or a single `drafts.json` under app data keyed by conversation id.

Shape:

```rust
struct DraftRecord {
    id: String,
    conversation_id: Option<String>, // None for a new chat
    prompt: String,
    images: Vec<PersistedImage>,
    files: Vec<PersistedFile>,
    context: Vec<ContextRecord>,
    model: Option<String>,
    mode: Option<String>,
    updated_at: i64,
}
```

Persist on a 300 ms debounce in the frontend, and flush on window blur. `beforeunload` cannot await the async IPC write, so it is not the durability boundary: the debounce timer is short enough that at most 300 ms of typing is at risk on a hard close, and every blur, mode change, model change, and send flushes synchronously through the same path. On startup, a draft whose `updated_at` is newer than the last flush is reconciled by taking the newer of the two. The Rust store does atomic rename writes (BetterShape already has this pattern in settings; reuse it).

Explicitly do **not** copy t3's `localStorage` quota accounting. BetterShape has a filesystem. Images can be written to the existing `media_stash` directory and referenced by id, which removes the 2.7 MB per-entry cap and the `droppedImageNames` failure mode entirely. This is a case where the upstream constraint is an artifact of the web deployment and should not be ported.

### Step 2: context records (2 days)

Adopt the record shape, not the editor integration. Start with three origins: file (exists via mentions), terminal selection (BetterShape has a terminal surface), and review comment (BetterShape has proposed edits). Preview annotation can follow once the div.

Render chips in `context-bar.tsx`. Keep a single `contextId` namespace so a future citation feature can point at the same ids.

### Step 3: citations (3-4 days)

Three pieces:

1. Selection toolbar over assistant markdown. BetterShape already renders messages in `features/chat/ui/blocks`; add a selection handler that computes UTF-16 offsets relative to the message's rendered text and captures the 32-character prefix/suffix.
2. A citation chip rendered inline after the selection, with an optional comment editor.
3. `assistantCitationsToPlainText` plus prompt serialization, so a citation becomes a quoted block with a stable reference.

Do not attempt DOM-range persistence. Store offsets plus context exactly as t3 does.

### Step 4: prompt history (1-2 days)

Implement `recallableComposerPrompt` as a pure function in `features/chat/lib/prompt-history.ts`, with the same stripping rules. Wire Up/Down in the composer behind a modifier so it does not fight multiline navigation. Store history per conversation in the draft store (last 50 prompts), not globally.

## 6. Traps

- **Scope the editor.** t3's 7,369-line composer includes a custom rich-text document, code block node views, and an undo grouping model. Do not port that. BetterShape's textarea plus overlay is a different product bet and replacing it is a separate project.
- **Thread scoping.** Every recall and stash operation must carry the conversation id, including drafts with `null`. BetterShape's queue already learned this lesson (`adoptDraftQueuedMessages`); reuse the same pattern.
- **UTF-16.** Rust strings are UTF-8. If offsets are computed in Rust, convert explicitly; if computed in the webview, JS already uses UTF-16. Keep offset computation in one language and document it.
- **Storage migration.** t3 is on version 9 of its draft schema. BetterShape starts at version 1 and should adopt a versioned envelope from day one, otherwise the first breaking change costs a migration anyway.

## 7. Effort

| step | days | confidence |
|---|---:|---|
| draft store (Rust plus frontend) | 3 | high |
| context records and chips | 2 | medium |
| citations | 4 | medium |
| prompt history | 2 | high |
| tests and migration | 2 | high |
| **total** | **13** | |

## 8. Acceptance criteria

1. Typing in chat A, switching to chat B, and returning restores the exact text and attachments of A.
2. Closing the window loses at most the debounce window (300 ms) of typing, and every blur, mode change, model change, and send has already flushed before the close, asserted by a test that closes without a flush and reconciles on startup.
3. An image attached to a draft survives a restart and is sent byte-identical.
4. Selecting assistant text and citing it produces a chip whose stored offsets resolve to the same substring after a re-render.
5. Recall never crosses conversation boundaries; a unit test asserts this.
6. Drafts for deleted conversations are garbage collected, with a test.

## 9. Dependencies

None. This is wave 1 work and it feeds D09 (stash stores into the same draft shape), D15 (rewind clears draft state), and D13 (queue items reference draft attachments).

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/07-composer-core.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D07: Composer core, drafts, context records, and citations. Scope: per-chat drafts, context records, citations, and prompt history, backed by a Rust draft store with content-addressed blobs. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/07-composer-core` from the current `draft/mega-absorb-all` only after dossier 06 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
