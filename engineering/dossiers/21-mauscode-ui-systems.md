# D21: mausCode UI systems: kanban, voice, skills, commands, and agent browsing

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/21-mauscode-ui-systems`) |
| Roadmap source | mausCode steps 22, 36, 37 (issues #24, #38, #39) |
| Issue title | `D21: mausCode UI systems: kanban, voice, skills, commands, and agent browsing` |
| Labels | `port`, `dossier:21`, `area:ui`, `size:L`, `stage:4` |
| Depends on | D07, D09, D11 |
| Blocks | none |
| Effort | 18 days |

**Port verdict: TAKE the kanban board and the command namespace scanner. TAKE the Whisper fallback for dictation. TAKE selected agent-browsing patterns. SKIP the onboarding flow and the cloud-shaped surfaces.**

mausCode is an Electron app built on a remote backend (21st.dev). It is two generations behind t3code in architecture and it has no tests at all: `git ls-files` finds zero `*.test.ts` or `__tests__` files across 506 source files. That is the reason this dossier is about UI patterns and a few self-contained backend utilities, not about porting a system.

## 1. What mausCode has

| area | files | lines | notes |
|---|---:|---:|---|
| `src/renderer/features/agents` | 200+ | 49,681 | subchat model, chat cards, message rendering, queue processor, search, mentions |
| `src/renderer/features/kanban` | 5 | 943 | board, columns, cards, status derivation |
| `src/renderer/features/automations` | 10 | 2,129 | remote-only (21st.dev tRPC), no local scheduler |
| `src/renderer/features/changes` | - | - | change review surface |
| `src/renderer/features/details-sidebar` | - | - | expandable widget sidebar |
| `src/renderer/features/file-viewer` | - | - | file viewer |
| `src/renderer/features/onboarding` | 6 | 1,272 | API key, repo select, billing, Codex, Anthropic |
| `src/renderer/features/terminal` | - | - | terminal surface |
| `src/main/lib/trpc/routers/voice.ts` | 1 | 470 | Whisper direct or cloud fallback |
| `src/main/lib/trpc/routers/skills.ts` | 1 | 307 | skills CRUD |
| `src/main/lib/trpc/routers/commands.ts` | 1 | 357 | markdown command scanner |
| `src/main/lib/terminal/port-scanner.ts` | 1 | - | lsof/netstat port discovery |
| `src/renderer/features/agents/lib/drafts.ts` | 1 | 400+ | 4 MB localStorage draft budget |

## 2. Kanban

### Mechanism

`kanban-view.tsx` (467) builds cards from four sources:

1. New chats that have no messages yet go to a `draft` column.
2. Existing chats derive a status from `deriveWorkspaceStatus(chat.id, { loadingSubChats, pendingQuestions, pendingPlanApprovals, unseenChanges })`.
3. Drafts come from `useNewChatDrafts()` (the 4 MB localStorage store).
4. Pinned chats are stored in localStorage per project.

Columns: draft, in progress, needs input (questions or plan approvals), done/error, per the status derivation. Cards support multi-select, rename, archive (with confirm), export, copy, and open.

### Why it fits BetterShape

BetterShape's sidebar is a list with sections. A board is a different projection of the same data, and the data it needs already exists: conversation status, pending approvals, unread changes, drafts. The missing piece is a status derivation function and a board view.

### Port plan (5 days)

1. `features/agents/lib/derive-status.ts` equivalent: `deriveConversationStatus(conv, { isGenerating, pendingApprovals, unreadEdits }) -> "draft" | "working" | "waiting" | "done" | "error"`.
2. A `features/kanban/` feature with board, column, and card components using the existing design system. Drag and drop with the existing motion primitives.
3. Data source: the conversation list plus live generation state. No new backend.
4. Persist column order and collapsed columns in settings.
5. Card actions: open, rename, archive, export. No multi-select in v1.

Do not port the localStorage draft store. BetterShape's D07 gives real drafts.

## 3. Voice and dictation

### What mausCode does

`voice.ts` (470) exposes `transcribe` and `isAvailable`:

- Input: base64 audio, format (`webm | wav | mp3 | m4a | ogg`), optional ISO language.
- 25 MB cap (Whisper API limit).
- If a local `OPENAI_API_KEY` exists, call Whisper directly (`whisper-1`) with the audio as form data.
- Else if authenticated, call the 21st.dev backend `/api/voice/transcribe`.
- Else fail with "Voice input requires signing in or setting OPENAI_API_KEY".
- Text cleanup function trims filler and fixes spacing before insertion.

### What BetterShape has

This is a correction to the earlier gap analysis. BetterShape **has** dictation wired:

- `src-tauri/src/core/mic.rs` starts the platform recognizer and emits `dictation-text`.
- `features/chat/ui/composer/dictation-button.tsx` listens for `dictation-text`, re-broadcasts `bettershape-dictation-text`, and the composer inserts at the caret.
- `lib/editor/dictation.ts` manages the session state machine.

So the port is not "add dictation". It is "add a transcription backend for users whose platform recognizer is unavailable or poor, and add language selection".

### Port plan (3 days)

1. Add `transcribe_audio(bytes, format, language)` to Rust, calling a configured Whisper-compatible endpoint (OpenAI or a local server such as whisper.cpp's `/v1/audio/transcriptions`).
2. Keep the 25 MB cap and return a typed error.
3. Settings: provider (system | whisper endpoint), endpoint URL, model, language. Default remains the system recognizer, so nothing changes for users who are happy.
4. UI: a small chevron on the dictation button to pick language; a toast if the fallback is unavailable.
5. Never upload audio unless the user explicitly selects the remote option. This is a privacy boundary; the default must stay local.

## 4. Skills and commands

### Mechanism

`commands.ts` scans a commands directory recursively for `.md` files and builds namespaces from nested folders: `git/commit.md` becomes `git:commit`. Frontmatter supplies `description` and `argument-hint`. It can also generate a command file from a name, description, and body, and it merges plugin-provided commands.

`skills.ts` does the same for skills: discovery, CRUD, and metadata.

BetterShape already has skills (`lib/chat/skills.ts`, `skill-roots.ts`, `skill-index.ts`, `features/settings/ui/sections/skills` and `discover-skills`). The port target is the **namespace convention** for commands and the frontmatter parser, if BetterShape does not already have an equivalent slash-command scanner.

### Port plan (2 days)

1. Audit `features/command-palette` and the slash-command path. If commands are already supported, add namespace scanning (`dir/name.md` to `dir:name`) with tests.
2. Frontmatter parse with the same fields and a strict parser that reports bad YAML instead of dropping the command.
3. Settings surface: list scanned commands with their source path, a "create command" form, and a conflict indicator when two files produce the same id.

## 5. Agent browsing patterns

The 49,681-line agents feature contains several patterns worth borrowing without the code:

| pattern | file | what to take |
|---|---|---|
| quick switch | `agents-quick-switch-dialog.tsx`, `subchats-quick-switch-dialog.tsx` | a keyboard palette across chats and subchats with recent-first ordering |
| chat cards | `agent-chat-card.tsx` | a compact card with status, model, last activity, and pending question count |
| work mode selector | `work-mode-selector.tsx` | explicit mode choice at send time rather than a settings toggle |
| search bar | `search/chat-search-bar.tsx`, `search-highlight-context.tsx` | in-conversation search with highlight context (t3's D10 find is the better implementation) |
| export | `lib/export-chat.ts` | markdown export with metadata |
| drafts | `lib/drafts.ts` | 4 MB budget with per-draft size accounting; D07 supersedes the storage but the budget idea survives as a warning |
| queue processor | `components/queue-processor.tsx` | a single global pump that processes queues for all chats, not just the visible one |

The queue processor is the one piece of maus logic that is genuinely better than a per-view hook: it runs at app level, tracks processing per subchat to avoid double sends, and drains queues for background chats. BetterShape's queue drain is tied to the chat on screen. D09 should adopt the global pump idea: a single drain loop that can dispatch for any conversation, with the UI only rendering the currently visible queue.

## 6. Port scanner

`src/main/lib/terminal/port-scanner.ts` plus `port-manager.ts` discover listening ports via `lsof` and `netstat`, map them to processes, and expose them to the preview surface. BetterShape has `runtime_inspect` with a `port_open` probe and a preview server, but no "which of my dev servers is on which port" panel.

Port plan (2 days): a Rust command `scan_listening_ports()` using the `netstat2` crate (cross-platform, no shell), returning `{ port, pid, process_name, address }`, plus a UI list in the preview panel. Do not shell out to `lsof`; it is macOS/Linux only and parsing it is fragile.

## 7. Onboarding

maus onboarding is a five-page linear flow: choose Anthropic or API key, select repo, add billing, Codex login. It is shaped by the 21st.dev subscription model, which BetterShape does not have.

Take only the **shape**: a first-run flow that (1) picks a provider and validates a key, (2) picks a project folder and detects git, (3) optionally imports settings, (4) shows the composer with a sample prompt. That is 2 days of UI work and no backend port.

## 8. Automations

`features/automations` (2,129 lines) is a remote-only surface: it calls `remoteTrpc` for the automation list, GitHub and Linear status, templates, and inbox. There is no local scheduler in `src/main`. Porting it would require the cloud backend, which is excluded.

The local equivalent is D24 (scheduled tasks) plus BetterShape workflows. Do not port the automations UI.

## 8.1 Roadmap rows (mausCode steps 22, 36, 37)

Three sidebar features from the roadmap land here because they share the same panel and ordering model:

1. **Suggestions inbox (step 22).** One `suggestions` table with a fingerprint unique key and one store module. Three producers write into it: an incremental TODO scanner that uses `git ls-files` so `.gitignore` is respected, a performance detector over the real diagnostics, and a poll-based GitHub label adapter that only creates items. A master toggle plus per-project kind toggles gate the unattended producers. "Promote" reuses the existing chat-create path so a suggestion becomes exactly one session with its text as the first prompt.
2. **Usage footer (step 36).** The footer reads D11's ledger and provider quota events on window focus; it never calls a provider itself. The 80 percent state goes through one tested colour helper.
3. **Sidebar lineage (step 37).** One ordering column replaces any per-view sort, archive is a column, and accent plus emoji live on the group record. Reorder is native HTML5 drag with a keyboard fallback, and it preserves pinning.


## 9. Effort

| item | days |
|---|---:|
| kanban | 5 |
| Whisper fallback | 3 |
| command namespaces | 2 |
| agent browsing patterns (quick switch, cards, global queue pump) | 4 |
| port scanner | 2 |
| onboarding reshape | 2 |
| **total** | **18** |

## 10. Acceptance criteria

1. The kanban board derives columns from live state and updates within one second of a status change.
2. Dragging a card between columns only changes local ordering, never conversation state.
3. Whisper fallback is opt-in, never uploads audio by default, and reports a clear error when unconfigured.
4. A nested command file appears as `namespace:name` and a malformed frontmatter is reported, not silently ignored.
5. The queue pump drains background conversations while another chat is on screen (shared with D09).
6. The port list shows the process owning each listening port without shelling out.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/21-mauscode-ui-systems.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D21: mausCode UI systems: kanban, voice, skills, commands, and agent browsing. Scope: a kanban board from derived status, the global queue pump, an opt-in Whisper fallback for dictation, command namespace scanning, selected agent-browsing patterns, and the three roadmap rows in section 8.1 (suggestions inbox, usage footer, sidebar lineage). Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/21-mauscode-ui-systems` from the current `draft/mega-absorb-all` only after dossier 20 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
