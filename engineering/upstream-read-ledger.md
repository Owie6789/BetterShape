# Upstream read ledger

_Generated from `audit/index.json` on 2026-10-17. The index is itself generated from `git ls-files` plus a per-file parse (exports, imports, doc block, LOC, Tauri command count). It is the machine-checkable evidence behind every inventory number in the plan._

## What the ledger covers

Three tiers. Tier A is a subset of Tier B: every Tier A file is also indexed, and is promoted to Tier A because it was read line by line.

- **Tier A, deep read.** Every line read in this session, notes captured in a dossier. Listed in the table below with what the read established; the consuming dossier is named in the plan's dossier index.

- **Tier B, structurally indexed.** Parsed end to end by the indexer: line count, top-of-file doc block, exported symbol names, import specifiers, test flag. Not line-read. Every tracked non-vendor source file is here at minimum.

- **Tier C, enumerated only.** Tracked but outside the port surface: vendored `.repos/`, lockfiles, binary assets, minified vendor blobs, generated route trees. Counted, named, excluded by decision.


## t3code

- indexed files: **5,444**
- indexed code lines: **1,597,450**
- test files: **1,835** (655,152 lines)

| directory | files | lines |
|---|---:|---:|
| `apps/server/src` | 1169 | 475,728 |
| `apps/web/src` | 1526 | 378,832 |
| `apps/mobile/src` | 1141 | 175,281 |
| `packages/client-runtime/src` | 342 | 88,565 |
| `apps/desktop/src` | 270 | 82,772 |
| `packages/effect-codex-app-server/src` | 16 | 61,550 |
| `packages/shared/src` | 217 | 44,320 |
| `packages/contracts/src` | 107 | 33,482 |
| `infra/relay` | 88 | 31,196 |
| `packages/effect-acp/src` | 18 | 27,406 |
| `packages/source-control-github/src` | 36 | 24,065 |
| `packages/provider-opencode/src` | 39 | 19,950 |
| `packages/provider-acp/src` | 18 | 16,961 |
| `packages/provider-pi/src` | 22 | 11,365 |
| `packages/provider-core/src` | 66 | 11,035 |
| `packages/provider-cursor/src` | 38 | 10,665 |
| `apps/server/scripts` | 26 | 9,649 |
| `packages/provider-acp-registry/src` | 18 | 8,248 |
| `packages/provider-grok/src` | 22 | 7,227 |
| `packages/source-control-gitlab/src` | 14 | 7,146 |
| `packages/provider-muse/src` | 21 | 6,690 |
| `packages/source-control-azure-devops/src` | 15 | 6,580 |
| `packages/source-control-bitbucket/src` | 12 | 5,263 |
| `packages/ssh/src` | 10 | 4,683 |
| `packages/source-control-gitcafe/src` | 13 | 4,203 |
| `scripts/build-desktop-artifact.ts` | 1 | 4,033 |
| `scripts/lib` | 21 | 3,906 |
| `packages/source-control-forgejo/src` | 8 | 3,600 |

## mausCode

- indexed files: **506**
- indexed code lines: **152,788**
- test files: **0** (0 lines)

| directory | files | lines |
|---|---:|---:|
| `src/renderer/features` | 273 | 79,739 |
| `src/main/lib` | 94 | 29,472 |
| `src/renderer/components` | 71 | 27,142 |
| `src/renderer/lib` | 41 | 8,582 |
| `src/renderer/icons` | 2 | 2,594 |
| `src/main/windows` | 2 | 1,078 |
| `src/main/index.ts` | 1 | 1,020 |
| `src/renderer/styles` | 2 | 728 |
| `src/shared/codex-tool-normalizer.ts` | 1 | 463 |
| `src/preload/index.ts` | 1 | 397 |
| `src/main/auth-manager.ts` | 1 | 302 |
| `src/renderer/App.tsx` | 1 | 226 |
| `src/main/auth-store.ts` | 1 | 203 |
| `src/renderer/contexts` | 2 | 150 |
| `src/renderer/hooks` | 3 | 129 |
| `src/preload/index.d.ts` | 1 | 108 |
| `src/shared/changes-types.ts` | 1 | 98 |
| `electron.vite.config.ts` | 1 | 81 |
| `src/renderer/wdyr.ts` | 1 | 72 |
| `src/shared/external-apps.ts` | 1 | 72 |
| `src/renderer/main.tsx` | 1 | 50 |
| `src/shared/detect-language.ts` | 1 | 50 |
| `src/env.d.ts` | 1 | 18 |
| `drizzle.config.ts` | 1 | 8 |
| `src/main/constants.ts` | 1 | 6 |

## BetterShape

- indexed files: **762**
- indexed code lines: **176,795**
- test files: **106** (12,070 lines)
- Rust files: **157**, Tauri command attributes: **268**

| directory | files | lines |
|---|---:|---:|
| `src-tauri/src` | 156 | 62,233 |
| `features/chat/ui` | 77 | 18,551 |
| `features/git/ui` | 47 | 14,011 |
| `features/preview/design` | 28 | 8,886 |
| `features/editor/ui` | 25 | 5,952 |
| `features/settings/ui` | 12 | 5,886 |
| `features/agent/workspace` | 17 | 4,842 |
| `features/agent/sidebar` | 17 | 4,386 |
| `components/ui` | 33 | 3,922 |
| `features/chat/lib` | 11 | 3,637 |
| `tests/lib` | 45 | 3,509 |
| `tests/features` | 18 | 2,648 |
| `tests/sidebar-motion` | 6 | 1,931 |
| `features/agent/workbench` | 22 | 1,922 |
| `app/globals.css` | 1 | 1,772 |
| `lib/ai/providers.ts` | 1 | 1,547 |
| `features/command-palette/cmd-palette.tsx` | 1 | 1,389 |
| `features/terminal/ui` | 1 | 1,204 |
| `lib/backend/commands.ts` | 1 | 1,099 |
| `lib/preview/tauri-mock.ts` | 1 | 919 |
| `lib/settings/store.ts` | 1 | 913 |
| `tests/sidebar` | 4 | 886 |
| `app/transitions.css` | 1 | 726 |
| `features/agent/layout.tsx` | 1 | 693 |
| `features/editor/lib` | 5 | 687 |
| `lib/chat/mentions.ts` | 1 | 660 |
| `lib/backend/types.ts` | 1 | 652 |
| `tests/workspace` | 1 | 578 |
## Tier A: files read line by line

`full` means every line of the file was read in this session. `slice` names the region read; slices were chosen because the rest of the file is mechanical repetition (generated schema tables, long test fixtures).

### t3code

| file | lines | extent | what it established |
|---|---:|---|---|
| `package.json` | 210 | full | workspace tooling, test entry points, knip scope (which packages are first-party) |
| `pnpm-workspace.yaml`, `README.md`, `AGENTS.md` | - | full | repo conventions, package boundaries |
| `docs/**` (86 files, 11,897 lines) | 11,897 | headings for all, full text for 12 | feature semantics, especially composer, permission modes, sidebar, usage, keybindings, source control, snapshot, appearance |
| `packages/contracts/src/assistantCitations.ts` | 30 | full | citation contract: UTF-16 offsets, prefix/suffix context, length caps |
| `packages/contracts/src/keybindings.ts` | 227 | 1-120 | command enum, when-AST, caps, jump commands |
| `packages/contracts/src/orchestrationV2.ts` | 3,300+ | 2,760-2,890 | dispatch modes, queued-run commands, queue edit semantics |
| `packages/contracts/src/orchestratorMcp.ts` | 400+ | 1-60 | MCP tool boundary, idempotency keys, compatibility JSON decoding |
| `packages/contracts/src/threadPullRequest.ts` | 110 | export list | PR link, snapshot, stack layer, watch schemas |
| `packages/provider-core/src/server/driver.ts` | 139 | full | driver/instance contract, no singleton tags, per-instance isolation rule |
| `apps/server/src/orchestration-v2/QueuedRunOrder.ts` | 32 | full | delivery ordering: delegated completions jump the queue, then queuePosition, then ordinal |
| `apps/server/src/orchestration-v2/Orchestrator.ts` | 4,000+ | 430-500, 1,120-1,360 | command routing, queue start gates, failure classification, queue-hold |
| `apps/server/src/orchestration-v2/CheckpointRollbackService.ts` | 407 | full | rollback identity checks, provider turn resolution, worktree recreation, file restore, stale refs |
| `apps/server/src/orchestration-v2/CheckpointRestoreSafety.ts` | 98 | full | shared-workspace detection across threads and sessions |
| `apps/server/src/orchestration-v2/ThreadSettlementService.ts` | 637 | 1-80 | settlement inputs, PR matching, settle timing constants |
| `apps/server/src/orchestration-v2/ThreadTitleRegenerationService.ts` | 300+ | 1-60 | title generation as a dispatchable effect with its own command |
| `apps/server/src/usage/UsageService.ts` | 1,400+ | 1-110 | transcript + scan reader split, rate table fetch, TTLs, caches |
| `apps/server/src/review/ReviewService.ts` | 140 | 1-120 | workspace-bound diff preview, VCS driver dispatch |
| `apps/server/src/keybindings.ts` | 709 | 1-130 | server-side config file, late defaults, atomic writes, conflict detection |
| `apps/server/src/scheduledTasks/webhookRoute.ts` | 134 | 1-60 | webhook security: byte-exact signature, 1 MB cap, relay proof, outcome header |
| `apps/server/src/worktreesDirectory.ts` | 90 | full | managed worktree directories, root rejection, symlink-aware path checks |
| `apps/server/src/storageCleanup.ts` | 900+ | 1-80 | cleanup rules, grace windows, lease coordination |
| `apps/server/src/project/ProjectSetupScriptRunner.ts` | 450 | 1-90 | setup scripts run in a terminal with sentinel-based completion |
| `apps/server/src/git/GitManager.ts` | 3,106 | symbol grep | worktree creation, PR linking, remote refs; 6,962 lines of tests |
| `apps/web/src/promptStashStore.ts` | 232 | full | stash persistence, quota accounting, orphaned encode recovery, eviction |
| `apps/web/src/components/chat/ComposerStashMenu.tsx` | 224 | full | capture-phase keyboard ownership, list semantics, a11y |
| `apps/web/src/components/chat/ComposerStashBadge.tsx` | 58 | full | badge pulse, shoulder tab placement |
| `apps/web/src/composerDraftStore.ts` | 4,306 | 1-160 | draft persistence: version 9, debounced storage, attachment schema |
| `apps/web/src/components/chat/ChatComposer.tsx` | 7,369 | grep + 4,080-4,650 | stash/recall orchestration, in-flight guards, expiry messaging |
| `apps/web/src/keybindings.ts` | 452 | 1-150 | when evaluation, effective shortcut resolution, conflict keys |
| `apps/web/src/components/chat/threadFind.ts` | 25 | full | find index stepping and count formatting |
| `apps/web/src/components/chat/threadFindHighlights.ts` | 259 | signature | highlight segmenting |
| `packages/source-control-core/src/server/*` | 2,537 | listing + sizes | provider abstraction, rate limits, diff revisions, checks |

### mausCode

| file | lines | extent | what it established |
|---|---:|---|---|
| `package.json`, `AGENTS.md`, `README.md`, `openspec/project.md` | - | full | Electron/tRPC stack, cloud coupling, conventions |
| `src/main/index.ts` | 300+ | 1-220 | window lifecycle, deep link auth, V8 flags, dev userData split |
| `src/main/windows/window-manager.ts` | 200+ | full | window ids, per-window chat ownership |
| `src/main/windows/main.ts` | 300+ | 1-160 | IPC surface: badge, notifications, frame preference |
| `src/main/lib/trpc/routers/chats.ts` | 2,196 | 1-200 | offline title/commit generation, worktree failure events |
| `src/main/lib/trpc/routers/voice.ts` | 470 | full | Whisper transcription, 21st.dev fallback, gating |
| `src/main/lib/trpc/routers/skills.ts` | 307 | full | skills discovery and CRUD |
| `src/main/lib/trpc/routers/commands.ts` | 357 | full | command namespace scanning (`git/commit.md` to `git:commit`) |
| `src/main/lib/port-scanner.ts` | 200+ | full | lsof/netstat port discovery |
| `src/main/lib/git/worktree.ts` | 300+ | full | LFS detection, shell env capture, worktree setup |
| `src/renderer/features/kanban/kanban-view.tsx` | 300+ | full | board wiring |
| `src/renderer/features/agents/components/queue-processor.tsx` | 255 | 1-90 | global cross-subchat queue pump |
| `src/renderer/features/automations/automations-view.tsx` | 300+ | grep | remote-only automations (21st.dev), no local scheduler |
| router inventory (`src/main/lib/trpc/routers/*`) | 13,086 | listing + LOC | backend surface |

### BetterShape

| file | lines | extent | what it established |
|---|---:|---|---|
| `AGENTS.md`, `DESIGN.md`, `openspec/project.md`, `.agents/PREFLIGHT.md`, `engineering/design-skills.md`, `CONTRIBUTING.md` | - | full | conventions, verification gate, dark-only contract |
| `docs/developing/architecture.mdx`, `docs/README.md`, `.github/ONLINE_RECON.md`, `.github/SERVER_INDEPENDENCE.md`, `LICENSE` | - | full | architecture, server independence gap list, BUSL terms |
| `features/settings/ui/shared/nav.ts` | 160 | full | settings tree; no usage, no automations, no keybinding engine page |
| `lib/ui/shortcuts.ts` | 373 | 1-90 | JSON defaults + localStorage overrides, `when` stored but not evaluated |
| `lib/settings/store.ts` | 912 | read earlier | settings shape and persistence |
| `features/chat/lib/message-queue.ts` | 71 | full | queue policy: conversation binding, draft adoption, drain gates |
| `features/chat/lib/use-chat-session.ts` | 1,927 | large slices | send, queue, restore, attachments |
| `features/chat/ui/composer/usage.tsx` | 102 | 1-60 | context-window ring only, no cost |
| `src-tauri/src/agent/commands/checkpoints.rs` | 65 | full | checkpoint persistence only, JSON per conversation |
| `src-tauri/src/agent/commands/conversation.rs` | 400+ | 120-260 | restore: cancel turn, truncate history, rewrite full file contents |
| `src-tauri/src/agent/models/mod.rs` | 400+ | TurnCheckpoint region | per-message-index file snapshots with full original content |
| `src-tauri/src/commands/git/mod.rs` | 3,167 | stash region + full symbol list | 60+ git commands, git2 plus CLI, stash exists |
| `src-tauri/src/commands/git/hunks.rs` | 531 | listing | hunk staging |
| `src-tauri/src/agent/checkout.rs` | 132 | 1-80 | subagent worktree isolation, fallback to shared |
| `src-tauri/src/agent/subagents.rs` | 440 | 1-80 | subagent model allowlist, max 4, shared/worktree |
| `src-tauri/src/agent/tools/dispatch/git.rs` | 500+ | worktree region | `git_worktree` tool (list/add/remove) |
| `lib/mcp/*` | 491 | listing | MCP client only (config, oauth, registry) |
| `src-tauri/src/commands/preview/*` | 3,500 | listing | design preview sandbox and source pipeline |

### Additional deep reads during dossier drafting

These were read after the first pass, while writing the dossiers. They are listed separately so the first-pass scope stays auditable.

| file | lines | extent | what it established |
|---|---:|---|---|
| `apps/web/src/components/chat/useThreadFind.ts` | 415 | 1-140 | request ids, local selection rebasing, progressive counting, unavailable-server toast |
| `apps/web/src/components/chat/threadFindHighlights.ts` | 259 | signatures | highlight segmentation used by the timeline |
| `packages/contracts/src/orchestratorMcp.ts` | 900+ | 88-200 | delegation input, wait budget, runtime-mode caveat, isolation semantics |
| `packages/contracts/src/scheduledTask.ts` | 320+ | 1-140 and export list | schedule union, HMAC fields, delivery caps |
| `apps/server/src/scheduledTasks/ScheduledTaskService.ts` | 1,290 | 1-80 | route prefix, retention, rate limits, redaction |
| `apps/server/src/orchestration-v2/ThreadLaunchService.ts` | 700+ | 1-80 | launch strategies and worktree branch helpers |
| `packages/shared/src/git.ts` | 200+ | 14-135 | branch sanitization, temp worktree names, flattening, Azure repo identity |
| `apps/desktop/src/snapShot/DesktopSnapShot.ts` | 800+ | 1-70 | capture state machine and platform backends |
| `apps/desktop/src/snapShot/snapShot.ts` | 300+ | 1-50 | accessibility caps, Windows virtual keys |
| `apps/server/src/htmlRender/HtmlRender.ts` | 460 | 1-60 | size caps, theme injection, typed errors |
| `apps/server/src/mcpApps/McpAppRequests.ts` | 224 | 1-50 | tool callback surface, stopped-session rule |
| `apps/web/src/components/usage/UsagePage.tsx` | 1,549 | listing and route | page structure only |
| `src/main/lib/terminal/port-scanner.ts` | 200+ | full | lsof/netstat discovery |
| `src/renderer/features/agents/lib/drafts.ts` | 400+ | budget region | 4 MB cap and accounting |
| `src-tauri/src/agent/commands/titles.rs` | 500+ | 207-360 | title generation, regeneration after ten turns, `title_locked` |
| `src-tauri/src/agent/commands/git_ai.rs` | 600+ | symbol list | summarize, walkthrough, review, draft PR commands |
| `src-tauri/src/commands/preview/preview_render.rs` | 442 | 1-40 | capture request, size caps, timeout |
| `lib/chat/usage-display.ts` | 200+ | full | token-only rows; cost never rendered |
| `lib/window/updater.ts` | 160 | full | update check returns `upToDate` without a request |
| `lib/editor/dictation.ts` | 200+ | 1-80 | WAV encoding and recognizer contract |

### Composition research for D15 (groups, panes, composer)

Read after dossiers 01 to 14, while scoping the Dia and herdr request.

| file | lines | extent | what it established |
|---|---:|---|---|
| `features/chat/ui/shell/tabs.tsx` | 293 | full | `ChatTab` shape, `NEW_CHAT_TAB_ID`, `ChatTabBar` built on dnd-kit, and the fact that it has no importer |
| `features/chat/ui/shell/titlebar.tsx` | 236 | 1-140 | `ChatTitlebar` contract, rename tags, actions slot lookup |
| `features/chat/ui/chat.tsx` | 459 | 80-135, 200-240, 292-332, 380-455 | composer built at 292, titlebar portal at 439, tab slot polling, `embedded` prop with no callers |
| `features/chat/lib/use-chat-session.ts` | 1,927 | 60-105, 200-380, 1,690-1,740 | open tab persistence, active-tab event, select and close handlers |
| `features/chat/lib/chat-stream-store.tsx` | 807 | 1-70, 150-260 | `TurnPhase`, per-conversation `liveTurnsRef`, single rendered view state |
| `features/agent/chrome.tsx` | 149 | 1-140 | four slot ids and the empty tabs element |
| `features/agent/layout.tsx` | 692 | 33-120, 600-700 | split constants, workspace width default 560, 200ms width transition, terminal dock mount |
| `features/agent/terminal-dock.tsx` | 223 | 1-60 | `MIN_H 140`, `DEFAULT_H 220`, height and open storage keys |
| `features/agent/sidebar/sections.tsx` | 902 | 1-60, 167-230 | shelf derivation and flat child list with variant keys |
| `features/agent/sidebar/chats.tsx` | 647 | 1-80 | list surface, collection menu imports, no drag source |
| `features/agent/sidebar/agent-tabs-chip.tsx` | 81 | 1-60 | consumer of `bettershape-chat-active` |
| `lib/sidebar/chat-list-meta.ts` | 321 | full | `ChatCollection` with icon, color and member ids; pin, unread, color stores |
| `features/panels/panel.tsx` | 405 | 1-70 | `PaneConfig`, `Panel`, `panel-<key>` size persistence |
| `features/agent/workspace/index.tsx`, `tabs.tsx` | 333, 257 | 1-90 each | workspace tab kinds, singleton `addTab`, `commitTabs` |
| `features/editor/ui/tabs/tab-bar-shell.tsx` | 102 | full | horizontal sortable strip, 5px activation, axis restriction |
| `lib/settings/store.ts` | 912 | 150-250 | settings sections and the absence of a `tabs` section |
| `features/settings/ui/shared/nav.ts` | 160 | 1-90 | Settings nav tree; Features group holds Terminal and Git |
| `lib/ui/shortcuts.ts` | 373 | 1-60 | label-keyed overrides, decorative `when` |
| `features/command-palette/cmd-palette.tsx` | 1,388 | command id region | existing `app.*` command id vocabulary |
| `src-tauri/src/agent/models/mod.rs` | 1,105 | 258-480 | `AgentState` field audit; `try_begin_in_flight`, `in_flight_contains_turn`, per-chat cancel tokens |
| `src-tauri/src/agent/commands/conversation.rs` | 601 | 273-360 | `activate_conversation` save/load/summary/checkpoints, `allow_missing` |
| `src-tauri/src/agent/commands/send_chat.rs` | 1,045 | 199-260, 318-350, 740-860 | owned conversation id, per-chat in-flight and cancel, switch-safe completion |
| `src-tauri/src/commands/shortcuts/mod.rs` | 108 | 60-108 | new windows are new processes (`--fresh-window`) |
| `apps/web/src/rightPanelStore.ts` | 1,156 | 1-90 | eight right panel kinds, storage key and schema version 14, surface variants |
| `apps/web/src/components/Sidebar.tsx` | 5,056 | 500-780 | pinned/active/working/snoozed/settled partition, optimistic drop projection, settled pagination |
| `apps/web/src/components/AppSidebarLayout.tsx` | 364 | 1-120 | panel animation suppression, sidebar width clamping and storage |
| `src/renderer/components/ui/resizable-bottom-panel.tsx` | 364 | 1-120 | maus bottom panel behavior worth copying for the floating composer |
| `app/globals.css`, `app/transitions.css`, `DESIGN.md` | - | token and motion sections | `--transition-fast`, `--transition-base`, `--ease-out`, reduced motion rule |

Web sources reviewed for the same dossier: `diabrowser.com/release-notes/1-9-0-tab-groups`, `diabrowser.com/updates`, `browsercompany.substack.com/p/the-strategy-behind-dias-design`, `herdr.dev/docs/concepts`, and `github.com/devswha/herdr-web-ui/pull/602`. Product images saved to `engineering/research/dia/`.

### Presentation research for D16 (tool calls and thinking)

Read after D15, while scoping the tool-call and reasoning surface.

| file | lines | extent | what it established |
|---|---:|---|---|
| `features/chat/ui/blocks/action-line.tsx` | 144 | full | the row contract: `chat-text`, bright verb, muted detail, `MARK_LIMIT 4` favicon marks, `+n/-n` in `tabular-nums`, 90ms chevron |
| `features/chat/ui/blocks/collapse.tsx` | 39 | full | `EXIT_MS 180`, mount-through-close behavior, `data-open` |
| `features/chat/ui/blocks/thinking.tsx` | 51 | full | legacy block: open by default, "Thought for a moment", pulsing last line |
| `features/chat/ui/blocks/workflow.tsx` | 1,483 | 1-120, 204-428 | chunk coverage set, `sameRepeatedTask`, `mergeRepeatedTask`, same-file edit coalescing, group flush buckets |
| `features/chat/ui/blocks/turn.tsx` | 890 | 711-775 | `TurnWorkflowSummary` open-follows-active, coalesce order, pending approval lift, stats and summary sentence |
| `features/chat/ui/blocks/analysis.tsx` | 70 | full | "Analyzing codebase..." to "Analyzed N files, M folders, K searches" |
| `features/chat/ui/blocks/search.tsx` | 398 | 1-60 | `parseWebSearchHits` on `###` and `URL:` blocks, brand favicon table |
| `features/chat/ui/blocks/generating.tsx`, `components/ui/shimmer-text.tsx` | 18, 7 | full | Eclipse-only indicator, ignored label, `.agent-progress-loading-text` 3.4s |
| `features/chat/ui/message/bubble.tsx` | 107 | 1-80 | user card shape, Eclipse typing dots, Auto model display id |
| `features/chat/ui/message/context-window.tsx` | 117 | 1-60 | segment colors and token formatting for the context menu |
| `src/renderer/features/agents/ui/agent-tool-registry.tsx` | 685 | 1-120, verb region | `ToolMeta`, `getToolStatus` four booleans, tense pairs |
| `src/renderer/features/agents/ui/agent-tool-call.tsx` | 115 | full | 1.2s `TextShimmer`, commented icon slot, HTML title injection |
| `src/renderer/features/agents/ui/agent-thinking-tool.tsx` | 166 | full | Thinking to Thought, 60-char preview, 1s tick, auto-collapse |
| `src/renderer/features/agents/ui/agent-exploring-group.tsx` | 159 | full | Exploring to Explored, five 24px icons, top fade |
| `src/renderer/features/agents/ui/agent-todo-tool.tsx` | 758 | 1-70 | todo diffing by creation, single, multiple |
| `src/renderer/features/agents/ui/agent-mcp-tool-call.tsx` | 337 | 1-60 | active and completed verb tables, priority args, result counts |
| `apps/web/src/components/chat/MessagesTimeline.tsx` | 5,642 | 2,530-2,576, 5,142-5,205, 5,290-5,540 | turn fold, attempt fold with "Cut off by a steer", reasoning row labels and trace body, expand gating |
| `packages/client-runtime/src/work-log/itemDetail.ts` | 248 | 1-120 | block flattening to depth 4, JSON pretty-print, command versus args lines, live status set |
| `packages/client-runtime/src/work-log/presentation.ts` | 756 | 600-756 | two priority groups, "Used X integration", "Performed N other actions", `liveThoughtLine` |
| `apps/web/src/components/chat/WorkLog.tsx` | 171 | 1-171 | row primitives, 24px icon slot, `max-h-96`, follow within 4px, `live-tool-shine` |
| `apps/web/src/index.css` | - | 521-548 | gradient shine, 2.2s `steps(30)`, paused unless visible |
| `app/globals.css`, `DESIGN.md` | - | 1,475-1,500, 1,550-1,580, section 3 and 6 | chat text 15px, collapse 180ms, radius scale, dropdown and press timings |

Web sources for D16: `diabrowser.com/release-notes/1-19-0-tab-groups-and-proactive-suggestions`, `diabrowser.com/release-notes/1-50-sunglow`, and `diabrowser.com/changelog/mac/1-53-0`. Pattern survey: setproduct's agent-activity pattern catalog, zylos' agentic UX notes, assistant-ui's reasoning documentation, and the status-step examples in aiuxplayground. The 1.19.0 note confirms automatic evolving group names and the morning briefing; 1.50.0 adds stop and resume plus chat history search; 1.53.0 confirms deliberation depth matching question complexity, which is the product-level argument for the collapsed reasoning summary.

Image research note: the official landing page cannot be scraped for binaries (see the plan's evidence section). Alt text for the three `dia-reads` images was retrieved through a text proxy: 01 is a painting with the words "The Friday Brief", 02 is a report named "Sarah's Week Recap", 03 is a communications page about a fall marketing summit. These confirm the product direction (briefing, synthesis, cross-tool answer) but contain no chrome to copy, so no layout claim rests on them. Two `image_search` hits were kept: an authentic Dia chat panel with a "Read reddit.com, apple.stackexchange.com, and 4 more" disclosure row, and an authentic top-bar pill strip. The rest were mockups or Arc screenshots and are excluded.

## Tier B: what the indexer proves per file

Every one of the 6,712 indexed files has a record with: repo, path, line count, test flag, top-of-file doc block, exported symbols, import specifiers. Aggregates:

| repo | files | lines | test files | test lines | share of lines that are tests |
|---|---:|---:|---:|---:|---:|
| t3code | 5,444 | 1,597,450 | 1,835 | 655,152 | 41% |
| mausCode | 506 | 152,788 | 0 (tests live under `__tests__` naming not matched) | - | - |
| BetterShape | 762 | 176,795 | 106 | 12,070 | 7% |

The t3 test ratio is the single most important planning fact in this document. It means the upstream is not just a feature reference, it is an executable specification. Any port that skips the corresponding test file is porting a guess.

## Tier C: excluded from the port surface

| set | files | reason |
|---|---:|---|
| t3code `.repos/` | 21,835 | vendored alchemy-effect and effect-smol sources, upstream of the Effect library itself |
| lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `Cargo.lock`) | 3 | generated |
| t3 `routeTree.gen.ts`, icon exports, brand assets | ~40 | generated |
| maus `src/renderer/public`, fonts, images | ~60 | binary/static |
| BetterShape `node_modules`, `target`, `dist` | untracked | build output |

## Reading order used

1. Conventions first (`AGENTS.md`, `DESIGN.md`, `openspec/project.md` in all three repos) so that "port" means something specific.
2. Product semantics next (`docs/**` in t3, `openspec` and router inventory in maus).
3. Contracts before implementations (`packages/contracts/**`), because contracts decide what can be translated mechanically.
4. Deep reads on the port surface, module by module, with the BetterShape counterpart read immediately after so the gap is measured, not assumed.
5. Every dossier was written only after both sides were read.

## Corrections this ledger forced on the earlier draft

Four claims in the first plan were wrong and are corrected here:

1. **"BetterShape has no stash."** It has git stash commands (`git_stash_list/save/apply/pop/drop/show` in `src-tauri/src/commands/git/mod.rs:2616-2736`) and a source-control menu that calls them. What it lacks is a **prompt** stash, a different feature. The port target is the prompt stash, and the git stash work is a UI enrichment, not a build.
2. **"BetterShape has no queue."** It has a real queue policy module (`features/chat/lib/message-queue.ts`) with conversation binding and draft adoption that t3 does not need because t3 is single-thread-per-route. The port target is not a queue, it is queue **control**: reorder, cancel, edit, steercast, hold.
3. **"BetterShape has no isolation."** It has `agent/checkout.rs` with sibling worktrees for subagents and a `git_worktree` tool. What it lacks is **thread-level** worktree lifecycle: per-thread persistence, setup scripts, settle scripts, cleanup rules, leases, managed-directory safety.

Each correction reduced estimated effort and changed sequencing. The dossiers reflect the corrected baseline.

4. **"BetterShape has no chat tabs."** It has the model, the dnd-kit strip and per-project persistence (`openChatTabs`, `bettershape-chat-open-tabs:<project>`), plus select and close handlers with tests. `ChatTabBar` simply has no importer, so nothing renders. The work in D15 is mounting and grouping the strip, not building tabs from zero.

A fifth correction came from the D15 source audit and is a constraint rather than a bug: **the backend has one live chat.** `AgentState` keeps `history`, `current_conversation_id`, `current_project`, the summary, checkpoints and the preview gate as single values, while `in_flight`, `cancel_tokens`, `turn_policies` and `turn_checkpoint_index` are already per conversation. Concurrent turns across chats are supported; two live chats on screen are not. D15 therefore stages composition (Stage 0 to 6) ahead of the per-conversation live state refactor (Stage 7).

---

## Revision 5 additions: opencode and the cloud backends

Revision 5 added four dossiers (D17, D18, D19, D20) and one case study that is not a port (D19). This section records the reads behind them. opencode was cloned at `8c173a8f3805d8e749d44311054b07e37a1b2ce1` (2026-10-17) into a separate directory; it is MIT.

### opencode inventory

- 8,552 tracked files, 231 MB including theme assets and fixtures.
- 4,994 TypeScript files under `packages/`, 1,072 test files.
- 36 desktop theme JSON files in `packages/ui/src/theme/themes/`, 33 TUI theme assets in `packages/tui/src/theme/assets/`.

### Tier A: opencode files read line by line

| file | lines | read | what it established |
|---|---:|---|---|
| `packages/core/src/variant.ts` | 690 | all | `Protocol` per provider package, `Support` union (`effort`, `toggle`, `budget_tokens`), generated variants per family, budget clamps (`high` at half cap, `max` at `limit.output - 1`), custom variants applied last and same-id replacement |
| `packages/core/src/plugin/verbosity.ts` | 92 | all | `textVerbosity` defaults to `low` only for a recognized OpenAI id set, skips when the model or the selected variant sets it, treats `null` as an explicit opt-out, runs on context, compaction, generate, title |
| `packages/core/test/plugin/verbosity.test.ts` | 140 | all | the id allowlist and the four hook paths, including the gateway and Azure aliases |
| `packages/schema/src/model.ts` | 145 | all | `Model.Info` shape, `Variant = {id, settings, headers, body}`, capabilities, cost and limit |
| `packages/schema/src/config/provider.ts` | 263 | all | the config a user writes: provider/model overlays, `Reasoning` union, `variants` array, `disabled`, tiered cost |
| `packages/schema/src/config/model.ts` | 100+ | all | model entries, aliases, limits, capabilities fallbacks |
| `packages/core/src/v1/config/migrate.ts` | 263 | all | V1 `variants` object to V2 array, `agent` to `agents`, `variant` folded into the model reference |
| `packages/app/src/providers/models/variant.ts` | 47 | all | selection priority, `"default"` normalization, invalid selection to `undefined`, never a neighbor fallback |
| `packages/app/src/providers/models/variant.test.ts` | 90 | all | the priority table and the invalid-id case |
| `packages/tui/src/mini/variant.shared.ts` | 58 | all | the TUI's shared resolver and the cycle order |
| `packages/tui/src/model-preference.ts` | 220 | 1-80 | per-model variant persistence in `model.json`, recent cap, CLI/session/saved precedence |
| `packages/theme/src/tui/schema.ts` | 304 | all | the published theme JSON, `defs`, token groups, color forms |
| `packages/theme/src/tui/resolve.ts` | 291 | all | hue scales 100 to 900, `muted`/`faint` derivation, state colors, `surface()`, `.state({})` priority |
| `packages/theme/src/tui/expand.ts` | 105 | all | expansion order and the group vocabulary |
| `packages/theme/src/tui/v1-migrate.ts` | 502 | all | V1 to V2 theme migration, `base` versus `theme` key |
| `packages/ui/src/theme/types.ts` | 75 | all | `DesktopTheme`, `ThemeVariant`, palette and seed shapes, token categories |
| `packages/ui/src/theme/color.ts` | 326 | all | hex/rgb/oklch conversions, `generateScale` light steps and chroma multipliers, `generateNeutralScale`, `blend`, `withAlpha`, `shift` |
| `packages/ui/src/theme/resolve.ts` | 568 | 1-300 | the semantic token table, `on()` readable-foreground by luminance, overlay mode, diff and surface derivations |
| `packages/ui/src/theme/loader.ts` | 123 | all | one CSS string per theme, `<style id="oc-theme">`, `data-theme` |
| `packages/ui/src/theme/context.tsx` | 438 | 1-200 | selection storage, mode resolution, cached CSS per mode, preload removal |
| `packages/app/src/theme-preload.test.ts` | 90 | all | first-paint behavior for stored light, dark, system, and cached custom CSS |
| `packages/app/src/settings/general/controllers.ts` | 150 | 70-100 | theme list and selection wiring in the desktop app |
| `packages/app/src/settings/appearance/appearance.tsx` | 140 | all | the Appearance surface shape |
| `packages/server/src/handlers/fs.ts` | 200+ | skim | the remote file API shape |
| `packages/server/src/handlers/persistent-pty.ts` | 150+ | skim | the remote PTY API shape |
| `packages/containers/README.md` and five Dockerfiles | 200 | all | build and publish images only; no runtime sandbox abstraction |

### Web sources for D17, D18, and D19

- `opencode.ai/docs/models/` and `opencode.ai/v2/docs/models/`: the config shape, variant selection by `#variant`, capability-driven generation, merge order (provider, then model, then variant), unknown variant is a resolution error.
- `opencode.ai/v2/docs/migrate-v1/`: V1 object to V2 array, `prompt` to `system`, `disable` to `disabled`, `variant` into the model reference, ordered `permissions`.
- `opencode.ai/docs/themes/`: built-in theme list, `/theme`, `tui.json`, custom theme directories, the token vocabulary, truecolor requirement.
- opencode issue #53744: the published schema said object while V2 used an array, and the wrong form dropped the provider with "Unsupported package". A port must accept both forms.
- `daytona.io/docs/en/sandboxes/`: sandbox classes, sizes, images need tag or digest, create via SDK, CLI, REST.
- `daytona.io/docs/en/process-code-execution/`: `exec`, `code_run`, interpreter contexts, default timeout 10s, `/toolbox/{id}/process/...` routes.
- `daytona.io/docs/en/pty/`: create, connect, resize, kill; `POST https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty`.
- `daytona.io/docs/en/file-system-operations/`: list, info, folder, upload, download under `/toolbox/{id}/files`.
- `daytona.io/docs/en/preview/`: standard versus signed URLs, `x-daytona-preview-token`, expiry bounds, warning page.
- `daytona.io/docs/en/ssh-access/`: `ssh <token>@ssh.app.daytona.io`, token TTL default 60 minutes, revocable.
- `boat.dev` and `docs.boat.dev/api/v1`: create, commands with `stream` and `detached`, files, host, events, stop and resume, SSH keys, sizes, $20 per month minimum, EU-only regions, one hour default TTL.
- Landscape survey: Daytona closed source in June 2026; E2B, Modal, Vercel Sandbox, Fly Sprites, Upstash, Runloop, Blaxel, Freestyle, Containarium, Microsandbox, and the Kubernetes agent-sandbox project.

### Corrections from revision 5

1. **"Box" is boat.** `box.ascii.dev` redirects to `boat.dev`. Old `box_` API keys still work; pricing and branding changed.
2. **opencode has no sandbox backend.** `packages/containers` is five Dockerfiles for publishing artifacts. `packages/server` is a self-hostable HTTP server. Neither provisions or manages a remote machine.
3. **t3code has no cloud hook.** Remote execution is SSH only: an uploaded release archive, a checksum, a lock, a runner on port 3773, and a 900 second launch timeout.
4. **Daytona's default exec timeout is 10 seconds.** A naive port kills `npm install` on the first call.
5. **opencode publishes two variant forms.** Accepting only the array form drops providers configured with the object form.
6. **Verbosity is narrower than it looks.** The plugin only sets `low` for a specific OpenAI id set and only when nothing else set it. Generalizing it would send the field to models that reject it.
7. **The theme engine is two engines.** `packages/theme/src/tui` and `packages/ui/src/theme` share a philosophy and none of their code. D18 ports the desktop one.

## Revision 6 additions (2026-10-17)

This revision renumbers the chain and adds thirteen dossiers. The reads below are the new evidence; earlier entries remain valid for their pins.

### opencode plugin model

| file or page | extent | what it established |
| --- | --- | --- |
| `opencode.ai/docs/plugins/` | all | V1 plugin shape: local `.opencode/plugins/` plus npm packages, Bun install at startup, hook keys as returned object, event list by domain |
| `opencode.ai/v2/docs/plugins/` | all | V2 config: `plugins` array with package/version/options, `-` disable, `*` wildcard, built-in policy plugins ignore removal, CLI add/list/check/update/remove, reload rules |
| `opencode.ai/v2/docs/build/plugins/` | chunk 0 | `Plugin.define({ id, setup })`, context as a client, `ctx.location`, `ctx.options`, transforms that replay in registration order, registry reads reflect registrations |
| `opencode.ai/v2/docs/build/plugins/migrate-v1/` | chunk 0 | the V1 to V2 hook mapping table, `prompt` before admission versus `context` before the model request, no one-to-one hook for several experimental APIs |
| `packages/plugin/package.json`, `src/` listing | structure | exports for promise, effect, host, runtime, tui; 26 effect-domain files; the runtime is a Bun module loader, not a sandbox |
| `packages/ui/src/theme/{types,color,resolve,loader}.ts` | all or 1-300 | the modern desktop theme engine, distinct from the TUI engine: palette or seeds, OKLCH scales, overrides, one style element |
| `packages/ui/src/theme/default-themes.ts` | imports | 38 built-in themes, `oc-2` default |
| `packages/app/src/theme-preload.test.ts` | all | preload keys `opencode-color-scheme`, `opencode-theme-id`, `opencode-theme-css-{light,dark}`; first paint before hydration |

### Daytona and boat

| page | extent | what it established |
| --- | --- | --- |
| `daytona.io/docs/en/preview/` | all | standard URL plus `x-daytona-preview-token` (unrevocable) versus signed URL with 60 s default and 86,400 s max; public sandboxes; stop/start rotates the token, paused resume keeps it; warning-page skip header |
| `docs.boat.dev/api/v1` | chunk 0 of 29 | base `https://boat.dev/api/v1`, `boat_` and legacy `box_` keys, `{ok, type}` envelope, error table, create/poll/command/file/host/events/stop/resume/fork shapes, commands wait 60 s while starting, 409 `machine_not_running` needs resume, 503 carries `retryAfterSeconds` |
| Daytona SDK references | method names | `sandbox.process.exec(command, cwd, env, timeout)` and `executeCommand`; `code_run`/`codeRun`; default timeout 10 s |

### BetterShape gap verification

| file | extent | what it established |
| --- | --- | --- |
| `lib/window/updater.ts` | 1-92 | full status union, no feed request, `upToDate` returned silently, install raises "This build updates manually" |
| `components/ui/favicon.tsx`, `features/chat/ui/blocks/search.tsx`, `features/shell/brand-marks.tsx` | hits | icon fetches go to `icons.duckduckgo.com/ip3` and `cdn.simpleicons.org` with no cache |
| `src-tauri/src/mcp/registry.rs` | client construction | plain `reqwest` client, no ETag or cache |
| `lib/plugins/api.ts` | 1-45 | Composio base hardcoded, key read from settings, plugin rows and tool hints |
| `features/agent/workbench/titlebar/menu-actions.ts`, `features/editor/ui/{codemirror,main}/editor.tsx` | listeners | `bettershape-editor-action` is handled only for edit actions and markdown undo/redo; navigation actions have no listener |
| `features/settings/ui/shared/nav.ts` | groups | plugins, mcp, ai-skills, ai-context leaves; no Appearance or theme leaf |
| `lib/settings/themes.ts`, `lib/settings/store.ts` | 44 + key lines | `ColorThemeId = "dark"`, `paintDarkTheme` deletes `data-theme`, adds `dark`, sets `color-scheme`; API keys still in settings at 441-456 |
| `app/globals.css` | token block | one `:root`, surface ladder, role surfaces, text, border, accent, status, git, radius, space, heights, fonts, type sizes |
| `DESIGN.md` | all | 131 hex literals outside the palette in 19 files; tokens defined once and mapped once; outdated light-override comment |
| `engineering/design-system-baseline.md` | rules | tokens only, one button, dark only, focus token, aria, sentence case, motion tokens, status colors |
| `src-tauri/Cargo.toml` | dependencies | no SQLite, no HTTP server, no archive crate, no plugin runtime; keyring present for two namespaces; uuid, base64, sha2 present |
| `agent/commands/history.rs` | 1-110 | per-project JSON, lock file, merge-on-save, checkpoint save skips re-read |
| `agent/models/mod.rs` | 134-160, 258-280, 979 | `Conversation` fields, `AgentState` live fields, pending approvals, `clear_pending_approvals` |
| `agent/tools/dispatch/mod.rs` | 1-60, 141 | `TRUST_GATED_TOOLS` 21 names, `ToolCtx`, match dispatch |
| `agent/commands/approvals.rs` | 1-60, 195, 223 | stop, terminal approval, edit approval; in-memory state |
| `agent/commands/ai_byok.rs`, `mcp/credentials.rs` | service constants, probe | `bettershape-ai` and `bettershape-mcp-oauth`; no shared interface |
| `agent/context/{mod,breakdown,tokens,repo_map}.rs` | structure | repo map budget is the only budget; no instruction loader |
| `agent/commands/send_chat.rs` | rules lines | `custom_rules` merged with `custom_system_prompt`, appended inside `<user_rules>` with no cap |
| `agent/commands/adversarial_review.rs` | 1-110 | heuristic `should_run`, `CRITIC_MODEL = "auto"`, two critics plus synthesis, errors swallowed into the prompt, XML output |
| `agent/security/urls.rs` | 1-45 | SSRF blocklist for the browse path including mapped and NAT64 addresses |
| `.github/workflows/*`, `scripts/release/*` | listing and checks | nine workflows, five release scripts, no checksum or manifest verification |

### Corrections from revision 6

1. **The event count is 37 static names, not 51.** `grep -rho 'emit("[^"]*"'` over `src-tauri/src` returns 37 distinct names; formatted names exist but are not statically enumerable. G-19 uses 37.
2. **The permission gap is narrower and deeper than "no approvals".** Approvals exist per terminal and per edit, but there is no rule table, no argv matching, no host or path scope, and the pending state is lost on restart.
3. **The secrets gap is real.** Two keyring namespaces plus plaintext fields in the settings object, and no redaction layer.
4. **"Plugins" already means Composio.** Any new plugin system must rename that surface to Integrations or the word has two meanings in the same settings page.
5. **`AGENTS.md` is never read by the agent.** The file exists in the repo; the loader does not. D12 is a build, not a port.
6. **The critic is not absent.** BetterShape runs a two-critic debate; the gap is structure, gating, persistence, and bounded repair. D26 is an upgrade, not a build from zero.
7. **There is no SQLite.** D01-B1 creates the first database; D08 and D28 depend on it.
8. **No HTTP server crate exists.** D06 adds `hyper` 1 for five routes; every other listener in the tree is a preview or devtools proxy on `127.0.0.1:0`.
9. **The numbering is now the merge order.** Old references to D01 to D20 in earlier sections mean the revision 5 dossier numbers; the map in `dossiers/README.md` resolves them.
