# D22: Tab groups, panes, and the composition of the chat surface

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/22-tabs-panes-and-composition`) |
| Roadmap source | mausCode step 18 (issue #20) for the pane behaviour only |
| Issue title | `D22: Tab groups, panes, and the composition of the chat surface` |
| Labels | `port`, `dossier:22`, `area:shell`, `size:XL`, `stage:4` |
| Depends on | D13 commands, D01 shell and settings, D17 rows |
| Blocks | none |
| Effort | 55 days |

Status: ready to implement. The design below is complete; the prompt at the end is the handoff.

Decisions locked by the user:

- Both stages ship. Stage A (37 days) and Stage B (18 days) are in scope. Stage B is not a follow-up option.
- The pane cap is **two**. The tree is binary and the union of panes is two. Dia's four-way split is the reference behavior, not the target constraint.
- The horizontal top bar is a **global** setting, not a per-project one. One setting, one storage key, no per-project override.

Scope: the request, in five parts.

1. Copy Dia's tab groups from the product images: color plus emoji or icon headers, collapse and expand, hover peek, closed groups parked in a "storage" shelf, pinned groups first.
2. Offer Dia's horizontal top bar as a selectable alternative to the sidebar strip, with the sidebar remaining the default.
3. Drag a chat row out of the sidebar and drop it on the chat area to open it there, with automatic placement.
4. Split management modeled on herdr (mouse first, split right and down, zoom, swap, resize, layout survives reload) with a Windows desktop manager placement model (Snap Layouts and FancyZones style previews, zone templates, snap assist).
5. Detach the composer from the chat column so it can float or dock on its own.

Evidence base:

- Dia release notes 1.9.0 (tab groups), 1.19.0 (evolving names, auto-pin, mention), 1.30.0 (tidy tabs and overflow), and the 1.52.0 and 1.53.0 changelog entries (active-tab indicator, smoother splitview transitions).
- The marketing page sections for Splits, Organized Tabs, and Live Work. The prose is quoted. The feature screenshots on that page arrive as stripped placeholders, so no layout claim rests on them.
- Four authentic product images in `engineering/research/dia/`: a sidebar with six expanded groups (tinted headers, emoji, member rows, flat New Tab row), a split view with two panes under one strip and both URLs in the nav row, a right-hand chat panel with a source-disclosure row and a narrow composer, and a crop of the top bar with five app-icon pills in one rounded container. These are the only pixel-level sources used.
- herdr concepts and CLI docs, plus the split-drag design in `devswha/herdr-web-ui` PR 602.
- Windows 11 Snap Layouts and FancyZones behavior from four vendor and how-to sources.
- BetterShape source read directly, with file and line references below.
- t3code `Sidebar.tsx` section partitioning and `rightPanelStore.ts` for prior art on persisted panel surfaces.

Image vetting note: earlier image searches for Dia produced mostly third-party mockups, AI-generated "concept" art, and Arc screenshots. Those are excluded from this dossier. The only pictures cited are the one authentic top-bar screenshot in `engineering/research/dia/` and the release-note prose. Where a claim needs a visual that cannot be verified, the claim is written as behavior from the release note and marked as such.

This dossier deliberately separates what can ship on today's single-chat backend from what needs a Rust change. That boundary is the largest decision in this document, and the user has now chosen to cross it.

---

## 1. What Dia actually does

### 1.1 Group anatomy

From the 1.9.0 release note and the screenshots:

- A group is a header row in the tab list: chevron, color dot or tinted swatch, emoji or site icon, name, and a member count that appears on hover.
- The header is tinted with the group color at low alpha. Rows inside are tinted more faintly, so the group reads as one block without boxing every row.
- Clicking the chevron collapses to the header alone. The collapsed header still shows the color and emoji, so a stack of collapsed groups reads as a color-coded index.
- Hovering a collapsed group opens a peek popover listing its members, each row clickable. The peek is the collapsed group's only way to reach a member without expanding.
- Tabs move in and out by drag, and by a context menu item ("move to group", "new group"). The new group inherits the tab's site color until the user picks one.
- A group gets a color and an icon from a picker in the header menu. Colors default to neutral, and the 1.28.0 note confirms neutral is intentional: groups should not compete with content.
- Closing a group does not destroy it. It moves to the bookmark bar as a labeled stack ("storage"), from which it can be reopened or opened into a new window with a modifier click.
- Groups can be pinned. A pinned group sorts above the rest of the tab list, and in the horizontal bar it docks to the leading edge of the strip.
- Names evolve automatically. 1.19.0 added automatic evolving group names, so a group named from its first tab renames as membership changes until the user types a name.
- Group membership is addressable from chat as an `@` mention (1.19.0) and from keyboard commands (Option-Command-T opens a new tab inside the focused group, Command-click on a link opens into a group).

### 1.2 Horizontal bar

The horizontal bar is not a different feature set, it is a different projection of the same tree:

- From the authentic screenshot, the strip is one rounded container centered in the titlebar row. Every member is a pill: a 28px rounded rect with a 16px favicon and no label. The active pill is filled with the site's brand color and the favicon switches to white. Inactive pills sit on a low-contrast neutral. There is no underline, no tab border, and no per-tab close button in that row; close lives in the row menu and on hover.
- The pill container has one shared outer radius and 6px internal gaps, so five tabs read as one control rather than five buttons. Window controls occupy the left margin and the chrome action occupies the right margin; the pill container is the only thing in the middle.
- That shape works for chats too: a chat pill can carry the project color or the group color, the active one filled, the rest neutral, and a 2px ring for a running chat in place of a favicon swap.
- Groups appear as pills at the leading edge of the strip. A pill shows icon plus name plus member count, tinted by color.
- Expanding a pill inline pushes member tabs to its right in the same strip. Collapsing returns to the pill.
- Pinned groups sit before unpinned groups. Chat and bookmark-bar groups share the strip in Dia.
- The strip scrolls horizontally; the active tab indicator stays visible even when the active tab scrolls out of view (1.52.0).
- 1.53.0 is explicitly about making sidebar and splitview transitions smoother (less layout churn, web content anchored). The lesson to copy is not the animation itself but the constraint: the content surface must not reflow while the strip animates.

### 1.3 Splits and drag to split

Dia's split model, from 0.36.0 through 1.20.0:

- A tab can be dragged onto the page area to create a split. 1.4.0 added a nav bar button plus "Open as Split" on a tab's menu, and 1.5.0 enlarged the drop targets because the first version was too fiddly.
- Dia permits up to four tabs split at once (0.36.0 report). BetterShape deliberately stops at two. Four is Dia's browser ergonomics; a chat surface with a composer, a terminal, and a diff in every leaf is unreadable at four, and the backend cost of Stage B rises with each extra live chat.
- 1.20.0 gives each pane its own navigation bar and bookmark bar, tints each pane independently, marks the focused pane, and gives each pane its own close button. This is the important precedent: panes are independent surfaces with their own chrome, not one surface with a divider.
- Splits are remembered as layouts and recalled in one click (marketing page).

The herdr PR is the closest published interaction model to what we need for a chat app:

- Drag a tab or a sidebar row over the pane area. Both halves outline; the half under the pointer fills.
- Drop opens the dragged thing in that half beside what is already there.
- Each half keeps its own tab strip, its own lens (chat or terminal), and a slim bar with its title, a lens toggle, and "close this half".
- Pressing in the other half makes it active first. Header, palette, shortcuts and the file viewer act on the active half.
- Dropping on the other half activates that half. Dropping a half's own pane on the opposite half trades sides.
- The split persists across reload, ends when either pane closes, and a window under 769px shows only the active half.
- Drag data is a custom MIME type (`application/x-herdr-pane`), and the drop is taken in the capture phase so the composer and terminal, which accept dropped files, never see it.

### 1.4 Windows placement model

Snap Layouts, as a behavior spec:

- A hover affordance on the maximize button opens a flyout of four to six layout templates drawn as miniature zone diagrams.
- Hovering a zone shows a translucent preview of where the window will land.
- Dragging a window to an edge or corner produces the same preview, then commits on drop.
- Snap Assist then offers the other open windows to fill the remaining zones, and the resulting arrangement is remembered as a Snap Group.
- FancyZones differs in two ways worth copying: zones are user-drawn and persist per monitor, and Shift plus drag activates zones so normal window dragging stays unchanged. Zones may span adjacent cells.

For a chat pane manager, the transferable pieces are the template picker, the translucent preview, the fill-the-rest chooser, and the shift modifier as the "I mean zones" gate.

---

## 2. What BetterShape has today

### 2.1 Chat tabs exist, are persisted, and are not rendered

`features/chat/ui/shell/tabs.tsx` defines the whole model:

- `ChatTab = { id, title, models?, gitStatus? }` (lines 26-35).
- `NEW_CHAT_TAB_ID = "__new_chat__"` for the draft.
- `ChatTabBar` (line 194) renders sortable tabs with Open, Close, Close Others, Close to the Right and Close All.
- It is built on `TabBarShell` (`features/editor/ui/tabs/tab-bar-shell.tsx`), so it already has dnd-kit horizontal sorting with a 5px pointer activation distance and horizontal-axis restriction.

`ChatTabBar` has zero importers. A repo-wide grep for the symbol returns only its definition. The tab bar was built and never mounted.

The session hook still owns the state behind it (`features/chat/lib/use-chat-session.ts`):

- `openChatTabs` and `activeChatTabId` (lines 203-206).
- Persistence key `bettershape-chat-open-tabs:<normalized project>` (lines 62-105), with ephemeral tab ids filtered out except the draft.
- `handleSelectChatTab` (line 1697) and `handleCloseChatTab` (line 1713). Both exist and are exercised by `tests/features/chat-queue-session.test.tsx`.
- Every active-tab change emits `bettershape-chat-active` (lines 372-376). The subagent chip listens to it.

So the tab strip is 70 percent built. What is missing is a mount point, group membership, and a decision about what a tab means once panes exist.

### 2.2 Groups already exist under another name

`lib/sidebar/chat-list-meta.ts` defines:

- `ChatCollection = { id, name, icon, color, chatIds }` (lines 25-31).
- 30 icons in `COLLECTION_ICONS`, 6 colors in `CHAT_COLORS` with hex values.
- `createCollection`, `updateCollection`, `deleteCollection`, `setChatColor`, `setChatPinned`, unread tracking, all in localStorage with `useSyncExternalStore` caches and a `bettershape-chat-pins-changed` event.

A collection is a Dia group with a different name: name, icon, color, ordered members, membership exclusive (a chat moves out of any other collection on insert). What it lacks is a header in the tab strip, collapse state, peek, and a closed-group shelf. `CollectionDialog` already provides the icon and color picker UI.

### 2.3 The tab slot is a DOM portal, not a layout

`features/agent/chrome.tsx` exports four slot ids (lines 17-20): `bettershape-agent-tabs`, `bettershape-agent-chrome-actions`, `bettershape-agent-sidebar-back`, `bettershape-agent-sidebar-history`. `AgentChrome` renders an empty flex child with the tabs id (line 103).

`features/chat/ui/chat.tsx` finds that element by polling `getElementById` every 50ms for up to 2s (lines 119-135), then portals `ChatTitlebar` into it (line 439). The Git manager does the same through `useSlot` (`features/git/ui/manager/chrome.tsx`).

This is a single-slot architecture. One chat at a time can own the strip. Panes need the slot to become an input to the layout ("which pane's strip is this?") rather than a global DOM element.

### 2.4 The right side is a fixed split, not a pane tree

`features/agent/layout.tsx`:

- Constants at the top: `MIN_WORKSPACE 360`, `MIN_CHAT 380`, `SIDEBAR_EXPANDED 304`, `MAX_WORKSPACE_RATIO 0.72`, `MAX_WORKSPACE_PX 1200`.
- `workspaceWidth` defaults to 560. The wrapper animates `width` over 200ms with `--ease-out` while not resizing (lines 640-676).
- One separator, one width, one `AgentWorkspace`. There is no notion of more than two columns, no per-pane tabs, and the workspace column is a single `WorkspaceTabs` instance (`features/agent/workspace/index.tsx`, `commitTabs`, kinds graph/files/browser/editor/problem/plan/diff).

`features/panels/panel.tsx` is a general resizable split already used nine times by the editor and git surfaces:

- `PaneConfig { id, children, minSize, maxSize, preferredSize, visible, snap, flexible }`.
- `Panel` takes `direction`, `onSizesChange`, `storageKey` and persists sizes under `panel-<key>` in localStorage.
- It is size-based, not tree-based: one direction, N panes. Nested splits are achieved by putting a `Panel` inside a pane.

This is the right primitive for v1 panes. A binary tree is more general but `Panel` already has the resize, clamp, storage and gap behavior that would otherwise be rewritten.

### 2.5 Terminal dock

`features/agent/terminal-dock.tsx` is the only existing example of a movable secondary surface inside the chat column:

- `MIN_H 140`, `DEFAULT_H 220`, keys `bettershape-agent-terminal-height` and `bettershape-agent-terminal-open`.
- Lazy terminal, a resize handle that sets body cursor and `resizing-vertical`, and a mount-below-chat placement in `layout.tsx` (`{project_path ? <TerminalDock /> : null}` right after the `Chat` container).

The detached composer should reuse this drag and persist pattern, not invent a new one.

### 2.6 Settings has a Features group

`features/settings/ui/shared/nav.ts` defines `SETTINGS_NAV`. The `features` group currently holds Terminal and Git, each pointing at a `settings-*` target id. A Tabs leaf belongs there, and `lib/settings/store.ts` `BetterShapeSettings` has no `tabs` section yet. `updateSettingSection` merges partial sections, so adding one is additive.

### 2.7 Design tokens

`DESIGN.md` section 6 fixes motion: `--transition-fast` 90ms, `--transition-base` 140ms, `--ease-out` and `--ease-spring` at `cubic-bezier(0.16, 1, 0.3, 1)`, with a `prefers-reduced-motion` guard required for every new animation. Dark only, squircle corners, `border-border-subtle` for separators. Group tints must be derived with `color-mix` against `--sidebar` or `--panel`, never hardcoded per theme.

---

## 3. The blocking truth: one live chat

Everything above is UI. The backend has a single live chat, and that decides how much of this can ship.

`AgentState` (`src-tauri/src/agent/models/mod.rs`, lines 258-324) mixes two kinds of state.

Already per conversation:

| Field | Scope |
| --- | --- |
| `in_flight` | `HashMap<conversation_id, InFlightTurn>` |
| `cancel_tokens` | `HashMap<conversation_id, CancellationToken>` |
| `turn_policies` | `HashMap<conversation_id, TurnPolicy>` |
| `turn_checkpoint_index` | `HashMap<chat_id, usize>` |
| `pending_commands`, `pending_edits`, `pending_asks` | keyed by request id |

Single valued (the live view):

| Field | Meaning |
| --- | --- |
| `history` | the loaded transcript of the focused chat |
| `title`, `title_locked`, `title_anchor_turns` | focused chat title state |
| `current_conversation_id`, `conversation_kind` | the focused chat |
| `current_project` | project of the focused chat |
| `history_summary`, `compaction`, `recent_files` | focused chat context bookkeeping |
| `file_checkpoints` | checkpoints of the focused chat |
| `design_preview` | preview gate for the focused chat |
| `incognito`, `subagent_models`, `subagent_default_model` | focused settings |

The command layer is already further along than the state:

- `send_chat` takes `conversation_id: Option<String>` (`send_chat.rs:56`), resolves `owned_conversation_id` (lines 199-224), calls `try_begin_in_flight(turn_id, conversation_id)` (line 318) and `begin_cancel_token(&owned_conversation_id)` (line 350). `try_begin_in_flight` rejects a second turn on the same chat but allows different chats (`models/mod.rs:432-456`).
- At completion it branches on `still_current` and `still_this_turn` (lines 764-830). If the user switched chats mid-turn, `persist_assistant_for_turn` writes the assistant message under the original conversation id without touching live state.
- `load_conversation` calls `activate_conversation` (`conversation.rs:273-360`), which saves the chat being left, loads the target transcript, title metadata, summary fold, and checkpoints, and can mint an empty chat with a given id when `allow_missing` is true.

So the backend already supports concurrent turns across chats, per-chat cancel, per-chat policy, and safe completion after a switch. What it cannot do is show two chats live at once, because `history` and the focused fields are singular and every read command reads them.

Front end mirrors this. `features/chat/lib/chat-stream-store.tsx` keeps `liveTurnsRef` keyed by conversation id (line 186) but the rendered state is a single `messages`/`turnId`/`isLoading` set (lines 164-172). `showConversation` swaps the view and caches the transcript being left (lines 240-247).

Consequence: today, panes can host at most one live chat. The other panes can host everything else the workspace already renders (files, editor, diff, browser, problems, plan, PRs, terminal) because those do not depend on `AgentState`.

This gives two stages. Both are in scope by decision, and the plan below prices them separately so progress is visible even though neither is optional.

Stage A, composition without backend surgery (37 days): groups, horizontal bar, drag-to-open, split tree, zone placement, detached composer, one live chat plus non-chat panes. A second pane showing a chat opens it in the primary chat pane rather than duplicating it.

Stage B, multiple live chats (18 days): extract a `LiveChat` struct, key it by conversation id, keep a focus pointer for the agent loop, make read commands take an optional conversation id, and turn the stream store into selectors. This is the only way to get two chats side by side, and it is where the real risk lives.

---

## 4. Design: groups

### 4.1 Model

Reuse `ChatCollection` rather than inventing a second grouping concept. Extend it:

```ts
type ChatGroup = {
  id: string;
  name: string;
  /** Empty until the user picks one; neutral tint while empty. */
  color: ChatColor | null;
  icon: CollectionIcon | "favicon";   // favicon derives from the first member
  chatIds: string[];
  collapsed: boolean;
  pinned: boolean;
  /** Positions in the owning list (sidebar or strip). */
  order: number;
  /** Closed groups live in storage, not in the list. */
  closedAt?: number;
  autoNamed: boolean;
};
```

Rules:

- Membership is exclusive. Adding a chat to a group removes it from any other group, matching `withoutChats` today.
- `order` is a fractional index so drag insertion does not renumber the list. Existing storage migration assigns `index * 1024`.
- Closed groups keep `chatIds`, so reopening restores members in order.
- `autoNamed` groups rename from the first two member titles until the user edits the name (Dia 1.19.0). Renaming sets `autoNamed = false`. Do not rename on every membership change; debounce to 800ms of idle and only while the group is collapsed or unfocused, so a header never changes under the pointer.
- Storage key stays `bettershape-sidebar-collections`, bumped to a `v2` envelope `{ version: 2, groups: ChatGroup[] }`, with a reader that accepts the bare array for one release.

Where it lives: `lib/sidebar/chat-list-meta.ts`. The cache and subscription pattern there is correct and already used by the sidebar. Do not move group state into the session hook, which is per-project and remounts on project switch.

### 4.2 Group header (sidebar)

Anatomy, matching the screenshots:

- 28px row, 8px horizontal inset, squircle-2xl.
- Left to right: 14px chevron (rotates 90 degrees when open, 140ms `--ease-out`), 6px dot in the group color (neutral `--text-disabled` when null), 14px emoji or icon, name in `text-sm`, and a count chip that fades in at 60 percent only on hover or when collapsed.
- Background: `color-mix(in srgb, var(--group-color) 14%, transparent)` on hover, 8 percent at rest. The tint must be behind the row, not on the text, so contrast stays under user control.
- Member rows: 2px left border in the group color at 40 percent, 8px extra left padding, no per-row background. This is the "one block" read from the screenshots without nesting cards.
- A collapsed group shows the top three member favicons stacked and a "+N" when count exceeds three.
- The header is a drop target. Dropping a chat row on it appends to that group (and removes it from its old one).
- Context menu: Rename, Pick color, Pick icon, Pin, Collapse, Close group, Delete group (delete is destructive and moves chats back to the ungrouped list, never deletes chats).

### 4.3 Hover peek

- Opens after 180ms of steady hover on a collapsed header, closes 260ms after leave with a hit-test corridor between header and popover (reuse the `isFlyoutUiTarget` pattern in `layout.tsx` which already solves exactly this for the sidebar peek).
- Panel: 288px wide, max 320px tall, scrolls, `squircle-2xl`, `border-border-subtle`, `--sidebar` background, 6px offset below the header, flipped above when near the viewport bottom.
- Contents: group name as a header, then one row per member with favicon or model avatar, title, unread dot, and running spinner. Clicking opens the chat and keeps the group collapsed.
- Keyboard: focus the header and press Space to open the peek, arrows to move, Enter to open, Escape to close. The peek must be reachable without a pointer.
- Do not open the peek while a drag is in progress.

### 4.4 Collapse, persistence, and motion

- `collapsed` persists per group and per surface (sidebar and strip can differ). Store as `collapsedSidebar` and `collapsedStrip`.
- Row height animation uses `grid-template-rows: 0fr / 1fr` on a wrapper, 180ms `--ease-out`, with `prefers-reduced-motion` collapsing to an instant change.
- When a group collapses, the chats that were visible must not also animate their own layout. Freeze the list height for one frame (measure, set explicit height, then animate), the same trick `SidebarPeek` uses with a mounted flag.

### 4.5 Closed groups in storage

- "Close group" moves it to a `Storage` shelf pinned at the bottom of the sidebar, above the account row. One collapsed row, "Closed groups N", expanding into a horizontal list of up to 6 pills then "View all".
- Each pill: color, icon, name, count. Click reopens the group in place. Modifier click opens its members as tabs in the current chat pane without creating a group.
- Storage is capped at 50 groups; the oldest closed group is dropped silently beyond that, matching the undo-window philosophy already used for chat deletion (`features/agent/sidebar/undo.ts`).
- Storage is not a trash can. Chats inside a closed group remain openable from search and from the All chats list.

### 4.6 Pinned groups

- Pinned groups sort first in the sidebar, before the pinned-chats shelf, and before the first ungrouped chat.
- In the strip, pinned groups dock at the leading edge in `order`, before loose tabs.
- Unpinning returns the group to its `order` position among the other groups. Persist `pinnedAt` so the return position is stable.

---

## 5. Design: the horizontal bar option

Setting: `settings.tabs.barStyle: "sidebar" | "top"`, default `"sidebar"`. Leaf under Settings > Features > Tabs, and a one-click toggle in the tab strip overflow menu for discoverability.

The setting is global and app-scoped. It is stored once in the settings file, not in the per-project workspace layout, so switching projects never changes the shape of the window and two windows cannot disagree about it. It is read at shell mount and on change; a change repaints the strip without remounting chat, workspace, or composer (see 5.2). If a future request asks for per-project bars, that is a new decision and a second storage layer, not a tweak to this key.

### 5.1 Layout

When `barStyle === "top"`:

- `AgentChrome` keeps window controls and chrome actions but yields the middle to a new `TopTabBar` in the `AGENT_TABS_SLOT` child position. The existing portal target id stays, so `ChatTitlebar` keeps working during the transition.
- The sidebar's chat list hides its tab-like rows but keeps groups, shelves and search. The two surfaces must not both show the same strip at once; the setting swaps which one is primary.
- Height: `h-titlebar` when collapsed, one 34px row plus 6px gap when a group is expanded.
- Pinned groups render first as pills. A pill: color dot, icon, name, count, chevron. Expanding a pill inserts its members as tabs immediately to its right, with a 1px separator tinted by the group color at 30 percent.
- Loose tabs follow, then a ghost "+" tab, then the overflow menu. Overflow lists open groups and recently closed groups, mirroring the 1.30.0 tidy-tabs menu.
- The active tab keeps a 2px bottom indicator in the group color; when the tab is scrolled out of view, a 4px indicator sticks to the strip edge on that side (Dia 1.52.0). Implement with an IntersectionObserver on the active tab, not scroll math.
- Horizontal scroll uses the existing `TabBarShell` wheel-to-scroll behavior. Do not wrap the strip in a second scroll container.

### 5.2 What must not change

- `TabBarShell`'s dnd-kit sorting stays the reorder mechanism in both styles. Group headers participate as non-sortable landmarks; a drop on a header means "join group", not "insert at index".
- The chat column's width and scroll position must not change when a group expands. Expanding a group must animate the strip's row height only, and the content area below must be anchored (Dia 1.53.0 is entirely about this class of bug).
- Chat title still lives in `ChatTitlebar` when the sidebar style is active. In top style, the title is redundant with the active tab, so `ChatTitlebar` renders breadcrumb-only and the tab carries the name.

### 5.3 Migration

- Default unchanged. Users on the sidebar keep the sidebar with zero visual diff.
- The setting is additive in `BetterShapeSettings`; a missing section reads as `{ barStyle: "sidebar" }`, so the settings merge needs no migration step.

---

## 6. Design: dragging a chat out of the sidebar

This is the interaction the user asked for by name: drag a chat row into the chat area to open it, with automatic placement.

### 6.1 Drag source

- Make the sidebar chat row a dnd-kit draggable with id `chat:<conversationId>` and data `{ kind: "chat", conversationId, title }`.
- Use a separate `DndContext` per surface or one app-level context with a typed collision strategy. The current `TabBarShell` contexts are local; a cross-surface drag needs an app-level context that both the sidebar and the chat surface join. dnd-kit supports multiple containers under one context; the clean path is one provider at `AgentLayout` and sensors disabled on text selection (activation distance 6px).
- Drag preview: a 240px row clone with the chat's avatar, title and model marks, 0.96 scale, `shadow-md/30`, 60 percent opacity, `cursor-grabbing`. Do not use the browser's native drag image; it cannot match the design.
- Sidebar auto-scroll while dragging within 48px of the list edges, 8px per frame, capped so it does not overshoot.
- Escape cancels and restores the row; the row returns with a 140ms spring, no teleport.

### 6.2 Drop zones

The chat area (`features/chat/ui/chat.tsx` container, or the pane wrapper once panes exist) registers:

| Region | Bounds | Result |
| --- | --- | --- |
| Center | inside 60 percent of width and height | open the chat as a tab in the active pane |
| Left edge | left 22 percent, full height | split left, new pane, chat active |
| Right edge | right 22 percent | split right |
| Top edge | top 18 percent | split above |
| Bottom edge | bottom 18 percent | split below (above the composer dock) |
| Existing pane body (multi-pane) | pane bounds | retarget that pane; open as its active tab |

- While dragging, draw a 2px outline around every eligible pane at `--border-secondary`, and fill the hovered zone with `color-mix(in srgb, var(--accent) 10%, transparent)` plus a 12px radius. One zone is highlighted at a time; the decision is made by pointer position, not by dnd-kit's closest-center, which picks badly for edge bands.
- The zone overlay mounts in a portal above the chat but below dialogs, `pointer-events-none` except the overlay root which must capture `dragover` and `drop`. Take the drop in the capture phase so the composer's file-drop handler never sees a chat drag. This is exactly the herdr PR's `application/x-herdr-pane` lesson.
- Autoplacement when there is no pointer decision yet (keyboard drop, or drop on a pane with no zones): if the target pane has one tab, open as a second tab; if the workspace has only one pane and the drop is within 48px of an edge, split; otherwise open in the target pane.
- Dropping a chat that is already open in another pane moves it, not duplicates it (single owner rule). Duplicating a live transcript is a bug factory; a "Duplicate" context action can exist later.

### 6.3 Keyboard equivalent

- The command palette gets `Open chat in split right` and `Open chat in split down` for the active chat.
- On a focused sidebar row, the context menu offers "Open in split right/down" and "Open in other pane" once panes exist.
- Drag must never be the only path. This is also the accessibility story: dnd-kit's keyboard sensor can move a row, but the destination ("chat surface") is not a sortable list, so the menu commands carry the feature.

### 6.4 Feedback and edges

- After a drop that opens a chat, focus moves to that pane's composer only if the drop was on the center zone. A split drop focuses the new pane's tab strip, so an accidental keypress does not type into a different chat.
- If the target chat is generating, its pane shows the running indicator from `generating-chats`, which is already keyed by chat id.
- If the chat was deleted between drag start and drop, drop is a no-op with a toast, not a crash.

---

## 7. Design: the pane tree

### 7.1 Model

```ts
type PaneId = string;

type PaneSurface =
  | { kind: "chat"; conversationId: string }
  | { kind: "editor"; path: string; revealLine?: number }
  | { kind: "diff"; path?: string }
  | { kind: "files"; folderTrail?: string }
  | { kind: "browser"; tabId: string }
  | { kind: "problems" }
  | { kind: "plan" }
  | { kind: "prs"; number?: number }
  | { kind: "terminal" };

type Pane = {
  id: PaneId;
  tabs: { id: string; surface: PaneSurface; title: string; pinned?: boolean }[];
  activeTabId: string | null;
  /** Per-pane composer dock state, see section 9. */
  composer: ComposerDock;
};

type SplitNode =
  | { kind: "leaf"; paneId: PaneId }
  | { kind: "split"; id: string; direction: "row" | "column"; ratio: number; a: SplitNode; b: SplitNode };

type WorkspaceLayout = {
  root: SplitNode;
  panes: Record<PaneId, Pane>;
  activePaneId: PaneId;
  /** Dia-style saved layouts, recalled in one click. */
  saved: { id: string; name: string; root: SplitNode; panes: Record<PaneId, Pane> }[];
};
```

Rules:

- The tree is binary. Every operation is expressed as split, close, move, resize. A 1x3 row is a row split containing a row split; ratios carry the sizes.
- `ratio` is the fraction for `a`, clamped to `[0.2, 0.8]` for row and `[0.15, 0.85]` for column. Clamps are per direction because vertical space is scarcer.
- A leaf at rest always has at least one tab. The one transient exception is a leaf the moment a split creates it: it starts empty and shows the snap assist chooser (section 8.3), which fills it. Closing the last tab closes the leaf if another leaf exists; the last remaining leaf is never closed, it resets to a new chat. The empty-leaf state is not persisted and cannot survive a reload; a saved layout with an empty leaf is normalized on read by the rules below.
- At most **2 leaves** and at most 8 tabs per leaf. Two leaves means one split, in either direction, and nothing deeper: a drag onto the divider or onto a pane that already has a sibling retargets a leaf instead of creating a third. The cap is a product decision, not a limitation to work around, so the template picker only ever shows one-split templates (left/right, top/bottom, and the ratio variants of each).
- The cap changes the tree math: `ratio` can only exist on the root node, so the validator can assert `depth <= 1` and reject deeper trees written by an older build rather than rendering them. Splitting a leaf that already has a sibling is a no-op with a toast ("Two panes is the limit. Close one first."), never a silent failure.
- Persistence: `bettershape-workspace-layout:<project>` v1. Write debounced 400ms, and on `beforeunload` synchronously. Validate on read: unknown pane ids, missing leaves, ratios outside clamps, unsupported surfaces drop to a single chat leaf rather than throwing.
- The same tree shape is used in the sidebar and top-bar styles. Only the strip rendering differs.

### 7.2 Operations

Modeled on herdr's pane verbs, with the mouse path first:

| Operation | Mouse | Keyboard | Command id |
| --- | --- | --- | --- |
| Split right | drag to right edge, or header menu | `Cmd+Alt+Right` | `pane.splitRight` |
| Split down | drag to bottom edge | `Cmd+Alt+Down` | `pane.splitDown` |
| Focus next | click pane | `Cmd+Alt+]` / `Ctrl+Tab` within pane group | `pane.focusNext` |
| Focus direction | click | `Cmd+Alt+Arrow` | `pane.focusLeft/Right/Up/Down` |
| Swap panes | drag a pane header onto another pane | `Cmd+Alt+Shift+Arrow` | `pane.swap` |
| Resize | drag divider | `Cmd+Alt+Shift+h/l` (8px steps) | `pane.resize` |
| Zoom | double-click divider? no: header zoom button | `Cmd+Alt+Z` | `pane.toggleZoom` |
| Close pane | header x | `Cmd+Alt+W` | `pane.close` |
| Move tab to other pane | drag tab | `Cmd+Alt+M` menu | `pane.moveTab` |
| Saved layout | header menu | palette | `pane.saveLayout`, `pane.recallLayout` |

Zoom means "this pane fills the area, others hidden", toggled, restoring the exact tree and ratios on exit. herdr calls it `z`; Dia's splits do not have it, but the user asked for herdr behavior.

### 7.3 Chrome per pane

Each pane gets a 34px header, mirroring Dia 1.20.0's per-pane chrome and herdr's slim bar:

- Left: pane mark (a small square in the pane's accent), the active surface icon, then the pane's tab strip (horizontal, scrollable, `TabBarShell`).
- Right on hover or focus: split-right, split-down, zoom, close. Split controls open a small zone flyout (section 8) instead of splitting immediately when the user holds the button, so the same affordance serves both.
- The focused pane's header gets `border-border-secondary` and a 2px top accent; unfocused panes are 1px at 60 percent alpha. Focus follows pointer-down anywhere in the pane, including the content area, and the previous pane's composer loses focus.
- A pane with one tab hides the tab strip and shows a single title row with the surface icon, which keeps a two-pane layout from feeling like a cockpit.

### 7.4 Dividers

- Hit area 10px (14px on touch), visible line 1px `--border-subtle`.
- A 28px pill at the divider midpoint appears on hover, drags to resize, double-click resets to 50/50. The pill moves toward the focused pane (cplieger's PR pattern).
- During drag, set body `cursor: col-resize` / `row-resize`, disable text selection, and suspend the 200ms width transition on the workspace panel so the resize is 1:1 with the pointer.
- Resize must use `requestAnimationFrame` and write CSS variables on the pane wrapper, not React state per pointer move. Commit the ratio to state and storage on pointer-up.

### 7.5 Responsive

- Under 900px of chat-area width: a second pane is not created by edge drop; the drop opens as a tab. At 769px the strip drops group pills to icon-only.
- Under 640px: the layout shows the active pane only, with a two-segment control in the header to switch. Persisted so resizing back restores the split. This copies herdr's 769px rule with our own breakpoints, which are already encoded in `layoutMinWidth`.

---

## 8. Design: Windows-style placement

Three distinct features, often conflated:

### 8.1 Template picker

- Trigger: hover the split button in a pane header for 500ms, or click its caret, or `Win+Z` equivalent `Cmd+Alt+Space`. Also available from the palette as "Choose layout".
- Flyout: 4 templates drawn as nested rectangles, 72x48 each, 2 columns by 2 rows, labels on hover only. Templates: halves left/right (1x2), halves top/bottom (2x1), main left (70/30), main top (70/30). A "Flip" action in the flyout swaps the ratio direction without adding a fifth thumbnail.
- Choosing a template applies one split to the active pane's rectangle: the current pane keeps the first zone, the second zone opens snap assist. There is never a third zone to fill.
- Windows ships six templates because a 4K window can host them. Two panes means four useful shapes plus a flip, and a picker that shows shapes the app will refuse is a lie. Any future three-zone template is a product decision that starts by reopening ADR-16.

### 8.2 Snap preview on drag

- While a chat tab, pane header, or sidebar row is dragged, edge bands show the same zone hints as section 6. Corners resolve to the nearer edge of the target pane; they do not create a quadrant, because a quadrant needs four zones. Herdr's two-half outline is the model, not Windows' nine-zone grid.
- The preview is a translucent rectangle inset 8px from the zone, 10 percent accent fill, 1px accent border, 12px radius, and it must be its own composited layer (`will-change: transform`, no layout reads during pointer move). Measure pane rects once on drag start, cache them, and re-measure on scroll or resize only.
- Dropping on a preview commits. Releasing outside any zone cancels and animates the drag clone back.

### 8.3 Snap assist

- After a split leaves an empty pane, a chooser appears in that pane: "Fill with..." listing open chats, open tabs (files, diffs, browser), and "New chat". It is a compact list, not a modal, and it dismisses on Escape or on first focus elsewhere.
- Choosing a chat in the empty pane opens it there. If it is the live chat already shown elsewhere, the empty pane takes it over and the previous pane falls back to its next tab. This is the single-owner rule again.
- Snap assist should also appear after restoring a saved layout whose panes reference closed chats.

### 8.4 Freeform zones, FancyZones style

- Shift plus drag on the pane area outlines a rectangle; releasing stores it as a custom zone for this layout.
- Custom zones live in `WorkspaceLayout` (`zones: { id, rect, paneId? }[]` normalized 0..1) and are per project, not per monitor (we have one window).
- A custom zone may only cover a region inside one of the two leaves, or exactly one leaf. It cannot carve a third surface out of the layout, so the cap still holds after a FancyZones-style arrangement.
- While a custom zone exists, unmodified drag uses the standard bands; Shift+drag snaps to custom zones only. This preserves FancyZones' "modifier means zones" property.
- Zone management UI is a 3-item menu (rename, delete, reset). Do not build a zone editor in v1.

---

## 9. Design: the detached composer

### 9.1 Why detach

Today the composer is created in `chat.tsx:292` as a JSX constant and rendered in two places: inside the empty-state stack, or at the bottom of the chat column (lines 330-332 and 421-432). It is coupled to column width (`max-w-4xl`), to the scroll container's gradient, and to the `emptyStage` animation. It cannot move without being rebuilt.

Detaching means three things:

1. The composer's DOM is a sibling of the chat scroll area, positioned by a dock model, not by document order.
2. Its state (draft, attachments, queue, selected model, mode, effort) follows the chat, not the mount point.
3. It can be floating (free position over the pane), docked bottom (today's look), docked top, or collapsed to a pill.

### 9.2 Model

```ts
type ComposerDock =
  | { mode: "docked"; edge: "bottom" | "top"; height: number }
  | { mode: "floating"; x: number; y: number; width: number; height?: number }
  | { mode: "collapsed" };

type ComposerPlacement = {
  perPane: Record<PaneId, ComposerDock>;
  /** Floating composers are owned by a pane; only one floats at a time. */
  floatingPaneId: PaneId | null;
};
```

- Docked bottom keeps today's visuals exactly: `max-w-4xl`, `insetX`, bottom gradient, 80px reserved space below the last message (`pb-80` stays).
- Docked top is for people who read upward; it reuses the same component with the gradient flipped.
- Floating: 560px default width, min 420, max 720, anchored to the pane, drag by a 22px grip at its top edge, resize from the bottom-right corner only. Position is stored relative to the pane (0..1), not the viewport, so a window resize does not strand it off-screen. Clamp on restore.
- Collapsed: a 44px pill at the pane's bottom-right showing a pencil icon and the queued count, click or `Cmd+Alt+C` to restore.

### 9.3 Behavior

- The floating composer sits above chat content (`z-30` under dialogs), with a 12px offset from the pane edge and a subtle shadow. It must not cover the last message by default: when it appears, scroll the list by its height if the user was at the bottom, and never if they had scrolled up.
- Drag uses pointer capture, not HTML drag and drop, so text selection inside the textarea stays intact.
- While floating, the composer's dropdowns, mention picker and queue panel must portal to the pane, not the document body, otherwise they detach visually on window scroll. `OverlayRootProvider` already exists for this pattern (`layout.tsx` uses it for the sidebar peek).
- The composer keeps a single instance per pane. Moving between dock modes must not remount the textarea; unmounting loses caret position and IME composition. Render it once in a stable wrapper and move the wrapper with CSS transform until the drop, then commit.
- Per-chat drafts (dossier 01) and the message queue (dossier 02) are keyed by conversation id, so a composer attached to a pane follows that pane's active chat. When the active chat changes, swap draft content with a 120ms crossfade; never persist the wrong draft into the wrong chat.
- Attachment drop: the floating composer keeps the file-drop handler. Chat drags from the sidebar must be ignored here because the pane captures the drop first.
- IME: do not animate the composer's width or height while `compositionstart` is active.

### 9.4 What "detached" must not break

- `bettershape-chat-focus-input` event listeners (the empty state dispatches it) must still find the composer. Keep the event and route it to the active pane's composer.
- `emptyStage` layout math (`emptyTop`, `emptyStackRef`) assumes the composer is in the stack. When the composer is floating, the empty state centers the hero and the floating composer anchors bottom-right; disable the margin-top animation in that mode.
- The queue panel and usage menu are absolutely positioned relative to the composer container. Give the floating container `position: relative` and its own overflow-visible layer.

---

## 10. Motion and visual rules

- All durations from tokens: `--transition-fast` for hover and press, `--transition-base` for collapse and peek, 180-220ms for split open/close, never longer than 240ms.
- Splits open by scaling the new pane from the divider edge (scaleX 0.96 to 1 plus opacity), 180ms `--ease-out`. The divider itself slides in.
- Closing a pane fades and collapses its rectangle, then the sibling expands in one animation, not two sequential ones.
- Group header collapse: height only, content fades at 60 percent of the duration.
- Drag ghost follows the pointer 1:1; zone highlight follows with 80ms of easing to avoid strobe when crossing a boundary.
- `prefers-reduced-motion: reduce`: no scale, no slide, only opacity and instant layout. Every new animation must have the guard per `DESIGN.md`.
- Group color tints: `color-mix` with `--sidebar`/`--panel`. Check contrast on the 6 palette colors; `amber` and `teal` are the risky ones against `--panel`.
- No new colors outside `CHAT_COLORS` in v1. A custom color picker is a later ADR because it breaks token discipline.

---

## 11. Traps

1. The tab strip is a DOM slot with a single owner. Two panes rendering `ChatTitlebar` into `#bettershape-agent-tabs` will render both into the same node. Panes must pass their strip container down, and `Chat` must accept a `tabsSlot` prop instead of polling the document.
2. `use-chat-session` is a per-mount hook with module-level events. Two `Chat` mounts will each call `activate_conversation` on selection and fight over the backend's single live chat. Until Stage B, only one `Chat` may mount. Enforce it with an explicit `primary` flag rather than hoping.
3. The `embedded` prop on `Chat` exists but has no callers. It suppresses the titlebar portal and shrinks padding, which is the right starting point for pane chats, but it does not isolate state. Do not treat `embedded` as pane support.
4. `Panel` persists sizes by index under `panel-<key>`. If pane count or order changes, indices silently map to the wrong pane. When reusing `Panel` for the first split, persist a layout signature alongside sizes and discard on mismatch.
5. dnd-kit contexts do not talk to each other. A sidebar-to-pane drag needs one provider above both. Adding a second `DndContext` and expecting a drop event across them will fail silently.
6. Pointer-based drags inside a text field break selection. The composer must opt out of pane drag affordances (no draggable header overlapping it), and the pane drop overlay must be `pointer-events-none` except during a drag.
7. localStorage is per webview and the app spawns new windows as new processes (`spawn_new_window` execs the binary with `--fresh-window`). A layout written in one window is invisible to another until reload. Document this; do not promise cross-window sync in v1.
8. `activate_conversation` saves the chat being left. Rapid tab switching during a turn can thrash disk writes. Debounce activation by 120ms and skip if the previous activation is still running; the existing `viewSeqRef` pattern in the stream store is the model.
9. `send_chat` requires `current_project` for some paths. A second-pane send before Stage B would use whatever project the focused chat set. Never expose a send path for a non-focused chat until Stage B lands.
10. Group auto-naming must not fire while the user is editing a name, while a drag is active, or during the 800ms after a rename. A name that changes under the caret is worse than no auto-naming.
11. Closing a group must not close its chats. The current sidebar close/archive path publishes `bettershape-chat-close-tab` (handled in `chat.tsx:100-108`). Group close must not emit that.
12. Split persistence and the existing `bettershape-agent-splash-seen` / zen-mode keys share localStorage. Namespace everything under `bettershape-layout:` and version the envelope.
13. The workspace column already owns the word "panel" (`AgentWorkspace`, "Hide panel"). UI copy for the new feature should use "split" and "pane" to avoid two different things called panel.
14. A floating composer inside a pane that is itself zoomed needs a portal target change; test zoom plus float together, not separately.

---

## 12. Port plan

### Stage 0 - preparation (2d)

- Extract `ChatGroup` v2 storage in `chat-list-meta.ts` with migration and tests.
- Add `settings.tabs` (`barStyle`, `groupTint`, `composerDockDefault`, `paneBreakpoints`) and the Settings > Features > Tabs leaf.
- Register pane command ids in the palette and keybinding config (dossier 06 rules: ids, not labels).

### Stage 1 - groups in the sidebar (6d)

- Header row, tint, icon, count, collapse with persistence.
- Drag chat rows in and out of groups, drop on header to append.
- Rename, color and icon pickers reusing `CollectionDialog`.
- Auto-naming with debounce and lock.
- Pinned ordering.
- Close to Storage shelf, reopen, cap and eviction.

### Stage 2 - peek and the strip (5d)

- Hover peek with corridor, keyboard path, running and unread state.
- Mount `ChatTabBar` for real in `AGENT_TABS_SLOT`, replacing the titlebar-only portal.
- Group headers inside the strip, pinned groups leading, drop-on-header joins.
- Drag a tab into a group and out of it; reorder within a group.

### Stage 3 - horizontal bar (5d)

- `TopTabBar` with group pills, inline expansion, overflow menu, active-tab edge indicator.
- Setting, toggle, transition between styles without remounting the chat.
- Verify content anchoring during expansion (the 1.53.0 lesson).

### Stage 4 - split tree (8d)

- `WorkspaceLayout` model, reducer, persistence, validation (`depth <= 1`, at most two leaves), migration from today's single split.
- `Pane`, `PaneHeader`, `PaneTabs`, divider, focus, zoom, close, swap, and the cap guard on every mutation path.
- Keyboard map and palette commands.
- Responsive collapse under 640px.
- Reuse `Panel` only if signature persistence lands; otherwise a small tree renderer with explicit ratio math.

### Stage 5 - drag and placement (7d)

- App-level dnd provider, sidebar drag source, tab drag source.
- Edge bands (corners resolve to the nearer edge), capture-phase drop, drag ghost, auto-scroll.
- Snap preview layer with cached rects.
- Template picker flyout (two-zone templates only) and snap assist chooser.
- Custom zones behind Shift, per-project storage, reset.

### Stage 6 - detached composer (4d)

- Dock model per pane, floating drag and resize, collapse pill.
- Move without remount; portal dropdowns; IME and focus handling.
- Empty-state and scroll interactions.

### Stage 7 - multi-live-chat backend, Stage B (14d)

This is the risky one and should be gated on a spike.

- Extract `LiveChat { history, title, title_locked, title_anchor_turns, project, kind, summary, compaction, recent_files, checkpoints, design_preview, incognito }`.
- `AgentState.chats: Mutex<HashMap<String, LiveChat>>` plus `focused: Mutex<Option<String>>`; keep the old fields as accessors over `focused` for one release so 268 command call sites do not all change at once.
- Read commands take `conversation_id: Option<String>`; `None` means focused, preserving behavior.
- `send_chat` writes into the owned chat's `LiveChat`, not the focused one.
- Per-chat emit payloads already carry `conversationId`; the stream store becomes a selector store (`useChatStreamState(conversationId)`), with the existing single-view API kept as a wrapper.
- Spawn cap: max 2 concurrent turns by default (configurable), to keep provider rate limits and memory bounded.
- Tests: two chats generating simultaneously, cancel one, switch focus mid-turn, restore both from disk, checkpoint restore in the non-focused chat.

### Estimated effort

| Stage | Days |
| --- | --- |
| 0 preparation | 2 |
| 1 groups | 6 |
| 2 peek and strip | 5 |
| 3 horizontal bar | 5 |
| 4 split tree | 8 |
| 5 drag and placement | 7 |
| 6 detached composer | 4 |
| 7 multi-live backend | 14 |
| Regression and visual QA | 4 |
| Total | 55 |

Stage A (0 through 6) is 37 days and delivers everything visible except two simultaneous live chats. Stage B is 18 more including QA, and can be deferred without invalidating Stage A's models: `PaneSurface.kind = "chat"` already carries the id.

The single most important scheduling note: Stage 4 and Stage 5 must not start before Stage 2 has replaced the DOM slot with a prop, or the pane work will be a rewrite.

---

## 13. Acceptance criteria

Groups

- A group can be created from a tab or a chat row, renamed, given a color and an icon, collapsed, pinned, and closed to Storage.
- Collapse state and order survive reload and project switch.
- Hovering a collapsed group shows its members; a member can be opened from the peek without expanding.
- Closing a group never closes or deletes a chat; every member remains openable from search.
- Auto-naming never changes a name the user typed, and never while the menu is open.
- Keyboard-only: create, rename, collapse, open peek, pick a member, reopen from Storage.

Horizontal bar

- Switching the setting changes the strip without remounting the chat or losing the draft.
- The setting is global: switching projects keeps the chosen bar, and a second window opened on another project shows the same bar.
- Group expansion does not move the chat column's scroll position by more than 1px.
- Active tab is identifiable when scrolled out of view.
- The strip reads as one container: shared outer radius, 6px gaps, one filled pill, no per-tab chrome.

Drag and split

- Dragging a sidebar row to the right edge of the pane area creates a second pane and opens the chat there; dropping in the center opens it as a tab.
- While dragging, exactly one zone is highlighted, and no file-drop handler fires.
- Every drop has a palette or context-menu equivalent.
- Split ratios, pane membership and active tabs restore exactly after reload.
- Closing one pane returns the survivor to the full area with a single animation.
- A third pane cannot be created by any path: not drag, not palette, not template, not a restored layout. The attempt surfaces the cap message instead of mutating the tree.
- The template picker offers only templates whose zone count is two or fewer.
- Under 640px only the active pane is visible and switching works.

Composer

- Docked and floating modes preserve the draft, attachments, caret and queue.
- Floating position restores relative to the pane after a window resize and never lands fully off-screen.
- No remount occurs when changing dock mode; IME composition is never interrupted.

Stage B

- Two chats generate at once; stopping one leaves the other running.
- Switching focus mid-turn persists both transcripts correctly.
- A checkpoint restore in a background chat does not touch the focused chat's files or history.

---

## 14. Decisions and the questions that remain

Resolved by the user, now binding on the implementation:

1. **Both stages ship.** Stage A and Stage B are one deliverable. The Stage 7 work is not deferred, and the acceptance criteria for Stage B are part of done.
2. **Two panes maximum.** One split, either direction. Templates that imply more than two zones are removed, not disabled.
3. **The top bar is global.** One setting key, app scope, no per-project override.

Still open, to settle during Stage 0 rather than before:

1. Plain (ungrouped) chats: below groups, or groups interleaved with a flat list as in Dia? This dossier recommends interleaved, because that is the shape the reference product chose, and because a "groups only when created" rule makes the first group feel like a mode switch. This is a one-line sorting decision, reversible.
2. The peek delay: 180ms open plus a 260ms travel corridor is the recommendation. If it feels twitchy in QA, raise the corridor, not the delay.
3. Whether the closed-group shelf appears in the sidebar (above the list) or only in the top bar overflow. Recommended: both, one component, because a user who closes a group while in top-bar mode must still be able to find it after switching to the sidebar.
4. Which shipped layout templates deserve a keyboard command. Recommended: left/right and top/bottom only, with the ratio variants available from the picker. Adding eight commands to the palette for the same action is noise.
5. Whether `ComposerDock` remembers floating position per pane or per chat. Recommended per pane, because the position is about the screen, not the conversation.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/22-tabs-panes-and-composition.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D22: Tab groups, panes, and the composition of the chat surface. Scope: Dia-style groups, the global top bar option, dragging a chat to open it, a two-pane tree with Windows placement previews, and the detached composer; Stage A plus Stage B, both in scope. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/22-tabs-panes-and-composition` from the current `draft/mega-absorb-all` only after dossier 21 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
