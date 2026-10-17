# D17: Tool call and thinking presentation

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/17-tool-calls-and-thinking`) |
| Issue title | `D17: Tool call and thinking presentation` |
| Labels | `port`, `dossier:17`, `area:chat`, `size:M`, `stage:3` |
| Depends on | none |
| Blocks | D22 |
| Effort | 9 days |

**Port verdict: RE-DESIGN on primitives that already exist. TAKE t3code's row grammar, status vocabulary, and summary rules. TAKE mausCode's verb-tense registry and its auto-collapse behavior. Do not port either renderer wholesale, and do not build a second component library beside `ActionLine`.**

Status: ready to implement. The design below is complete; the prompt at the end is the handoff.

Scope: how a turn shows what the agent is doing. One row model for every tool call, one thinking block, one set of labels, one state machine, one expansion contract, and one motion discipline. The transcript itself, markdown, diffs, and terminal rendering are out of scope except where this dossier changes their frame.

## 1. The problem

The chat surface has a good row primitive and no system around it.

`features/chat/ui/blocks/action-line.tsx` already renders a row the right way: a 15px line (`chat-text`), the action verb in `text-text-secondary`, the detail in `text-text-muted`, up to four favicon marks, optional `+n/-n` counts in `tabular-nums`, and a chevron that rotates 90 degrees over `--transition-fast`. `Collapse` animates its body with `grid-template-rows` over 180ms using `--ease-out`. Those two components are the visual contract worth keeping.

What sits on top of them is ad hoc:

- `TurnWorkflowSummary` (`features/chat/ui/blocks/turn.tsx:711`) owns coalescing, grouping, stats, header text, pending approvals, and the open state, all in one component.
- `features/chat/ui/blocks/workflow.tsx` is 1,483 lines and mixes label logic, grouping, diff bodies, file lists, git parsing, terminal output, and menus.
- Thinking exists twice: a `think`/`thought` chunk path inside the workflow summary, and `blocks/thinking.tsx`, which opens by default and says "Thought for a moment" with no duration.
- `generating.tsx` renders an Eclipse spinner and ignores its `label` prop, so "Thinking" is not actually rendered where the name suggests.
- The `Chunk` union in `features/chat/ui/md/renderer.tsx:121` carries roughly 40 types, each with its own renderer, and several of them mean the same thing to a reader ("search", "grep", "search_result", "web_search", "web_result", "web_visit").
- There is no status model. Pending is inferred from a `commandStatus === "pending"` string, failure is inferred per block type, interruption has no representation, and there is no way to express "this attempt was superseded".

The result is readable in the happy path and inconsistent everywhere else: verb tense flips between gerund and past by renderer, failures can be hidden inside a collapsed group with no marker, a superseded attempt looks identical to a finished one, and the same action gets two different labels depending on which block type carried it.

## 2. What the two upstreams do

### 2.1 t3code: a work log, not a message list

Files: `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/components/chat/WorkLog.tsx`, `packages/client-runtime/src/work-log/presentation.ts`, `packages/client-runtime/src/work-log/itemDetail.ts`, `packages/client-runtime/src/work-log/commandLabel.ts`, `apps/web/src/components/chat/AgentElapsed.tsx`.

Anatomy:

- Rows are `WorkLogRow` inside a list, minimum height 24px (`min-h-6`), with a 24px icon slot so labels never shift when an icon appears. That constraint is the single most important detail to copy: the label column is stable because the icon column is fixed, not because every row happens to have an icon.
- An expanded body is `WorkLogDetails`, capped at `max-h-96` (384px) with internal scroll and auto-follow only while the user is within 4px of the bottom. Auto-follow that fights the user is a bug; this is the exact threshold that avoids it.
- The live row uses `live-tool-shine`: a gradient text effect animated over 2.2 seconds with `steps(30)`, paused unless the row is visible. It reads as motion without changing layout.
- Failed rows switch to `circle-alert`, and `workEntrySignalsSevereFailure` keeps the failure flagged even when the group is collapsed.
- Reasoning is a row, not a block. `ReasoningTraceContent` renders each reasoning entry through `ChatMarkdown` into `WorkLogDetails`, with `followLive` while the entry is streaming. When expanded, the row label is "Thinking" while in progress and "Thought" when done. When collapsed, the label comes from `workEntryDisplayLabel`, which is a content preview rather than a fixed word.
- Turn folds and attempt folds are first-class rows: `TurnFoldTimelineRow` is a button with a label, a morphing chevron, and a right-aligned timestamp; `AttemptFoldTimelineRow` adds a "Cut off by a steer" caption for superseded attempts.
- `presentation.ts` decides what a group says. `summarizeToolGroup` keeps at most two priority groups, then appends "Used X integration" for dynamic tools, then "Performed N other actions" for the remainder. `liveThoughtLine` extracts a bold heading or the first sentence for the live line.
- `commandLabel.ts` is 1,436 lines of shell-aware parsing: it unwraps `env`, `sudo`, shell and PowerShell layers, normalizes up to 64 segments, and only then does the UI pick a label. The lesson is that command text is not a string, it is a small grammar.
- Elapsed time formatting is `12s`, `3m 05s`, `1h 05m`; it never shows milliseconds in the transcript.

The lesson: t3code's power comes from normalizing every upstream tool into a small set of display actions (`read | edit | command | search | code-search | browser`) before rendering. Labels, icons, grouping, and summaries are then computed from that normalized layer. BetterShape renders the raw chunk types instead, which is why label logic spreads across a 1,483-line file.

### 2.2 mausCode: a registry with verbs

Files: `src/renderer/features/agents/ui/agent-tool-registry.tsx`, `agent-tool-call.tsx`, `agent-thinking-tool.tsx`, `agent-exploring-group.tsx`, `agent-todo-tool.tsx`, `agent-mcp-tool-call.tsx`.

- `ToolMeta` is `{ icon, title, subtitle, tooltipContent, variant }` and every tool resolves through one registry. Titles are already tense-aware pairs: "Reading/Read", "Generating command/Running/Ran", "Preparing edit".
- `getToolStatus` returns `isPending` (only while the chat is streaming), `isError`, `isSuccess`, `isInterrupted`. Interruption is a real state with its own rendering, not a failed call.
- `agent-tool-call.tsx` deliberately leaves the icon slot commented out in this build and injects title and subtitle as HTML. That is a bug-shaped decision, but the row shape (title, subtitle, chevron, 1.2s `TextShimmer` while pending) is the shape to keep.
- `agent-thinking-tool.tsx`: "Thinking" to "Thought", a 60-character preview, a chevron that only appears on hover, a 1-second tick for elapsed time, and auto-collapse when the thought finishes. Auto-collapse is the behavior that keeps long turns readable.
- `agent-exploring-group.tsx`: "Exploring" to "Explored", a count of tools and files, up to five 24px tool icons, and a top gradient fade so the group reads as a stack rather than a list.
- `agent-todo-tool.tsx` diffs successive todo lists and shows only what changed: creation, single change, or multiple changes. A todo list that reprints itself on every update is noise; this is the alternative.
- `agent-mcp-tool-call.tsx` maps the first verb of an MCP display name through active and completed tables ("List" to "Listing"/"Listed"), shows up to one priority argument in the subtitle, and reports "N results" from the output shape.

The lesson: a verb registry plus a status function is enough to make every tool read consistently. The renderer should not decide grammar; the registry should.

### 2.3 BetterShape today: the parts worth keeping

- `ActionLine` is already the row. It needs a status prop, an icon slot that is always reserved, and a failure tone, and then it can serve every row in the new model.
- `Collapse` is already the expansion primitive at 180ms.
- `coalesceConsecutiveSameTasks` and `coalesceConsecutiveSameFileEdits` already merge adjacent identical actions, including merging consecutive thoughts into one and merging repeated same-file edits into the last edit. Those rules are correct and should move into the new module with tests rather than being rewritten.
- `groupWorkflowRows` already flushes the right buckets: stages, reads, searches, web, writes, lists, subagents. The bucket names map one to one onto the normalized row kinds in section 4.
- `computeGroupHeader` already produces the right summary sentences: "Explored and edited", "Edited files", "Ran commands", "Explored codebase", "Thought", "Worked". Keep the sentences; move the function.
- `TerminalCommandStep` (`blocks/terminal-live.tsx`, 582 lines) streams output keyed by `commandId` under `agent-terminal-stream` and caps output at 16,000 characters. This is a solid body renderer for the `command` row and does not need replacing.

### 2.4 Comparison

| Concern | t3code | mausCode | BetterShape today | Decision |
| --- | --- | --- | --- | --- |
| Normalization | display actions, strong | per-tool registry, strong | none, raw chunk types | add `WorkRow` normalization |
| Label grammar | computed in `presentation.ts` and `commandLabel.ts` | verb tables in registry | spread across workflow file | one label module with verb tables |
| Status | lifecycle status plus severe-failure detection | four booleans | pending string, per-type errors | one `WorkStatus` union |
| Reasoning | row with markdown body, live line | row with preview, auto-collapse | two competing blocks | one thought row, auto-collapse |
| Expansion | `max-h-96`, follow within 4px | per-tool bodies | bespoke per block | same cap and same follow rule |
| Summary | two priority groups plus overflow | exploring group | bucket header sentences | keep sentences, cap at two groups |
| Motion | gradient shine, 2.2s steps | shimmer 1.2s | gradient 3.4s linear | one shimmer, reduced-motion guard |
| Superseded | attempt fold with caption | interrupted state | none | add both |
| Timing | 12s, 3m 05s, 1h 05m | 1s tick | words per 12 seconds | one formatter, both duration and words |

### 2.5 What the wider pattern survey adds

A survey of agent activity UIs (setproduct's pattern catalog, zylos' agentic UX notes, assistant-ui's reasoning docs, and the status-step examples collected in aiuxplayground) converges on ten recurring patterns. The table records which ones this design takes and why.

| Pattern | Tradeoff | Decision |
| --- | --- | --- |
| A step ledger with status glyphs | scannable, but glyphs become noise at high counts | take, with a fixed 16px slot and no spinner |
| Tool cards nested inside steps | clear hierarchy, but every card costs vertical space | reject: one level of grouping, flat rows inside |
| Identical consecutive calls collapse to one row with a count | removes repetition, can hide a failure | take, with the count and a failure marker on the collapsed row |
| Reasoning collapsed to a one-line summary | keeps the transcript fast to read, hides the argument | take, expanded while streaming if the user asks |
| A separate activity panel | keeps the transcript clean, breaks reading order | reject: activity stays in reading order |
| Failed calls stay flagged when collapsed | essential for trust | take, as the alert dot plus "N failed" |
| Shimmer only while streaming | marks the present without decorating history | take, one shimmer per focused pane |
| Per-step timers | useful for long commands, noise for reads | take for command and thought only |
| A pinned plan or todo checklist above the turn | good for long autonomous runs, duplicates the transcript | take the todo row with change detection, not the pinned panel |
| "Thinking" rendered as body text in the transcript | simple, but floods the view on long reasoning | reject: summary row first, body on demand |

Two patterns the survey warns about and this dossier rules out explicitly: a spinner inside the label text, and a shimmer on every active row simultaneously. Both make a busy turn look broken rather than busy.

## 3. Principles

These come from the three codebases plus the activity-UI pattern survey recorded in `engineering/upstream-read-ledger.md`. They are ordered by how often they decide a case.

1. **One row per action, after coalescing.** If two adjacent actions would read as the same sentence, they are one row with a count. This is already the rule in `coalesceConsecutiveSameTasks`; extend it rather than adding a second mechanism.
2. **Tense is state.** A running row uses the gerund, a finished row uses the past. Never mix within a turn. A row that failed uses the past plus a failure detail, never a gerund.
3. **The verb is bright, the subject is muted.** That is the `ActionLine` contract and it is why the transcript stays scannable at 15px. Long subjects truncate at the end, never wrap to a second line.
4. **Groups summarize, rows explain.** A collapsed group must be readable on its own: "Explored 12 files and edited 3". The rows inside exist for verification, not for comprehension.
5. **Failures never disappear.** A collapsed group that contains a failure shows an alert dot, and the group header gains "1 failed". This is the single highest-value change in this dossier.
6. **Reasoning is opt-in.** Collapsed by default after it finishes, expanded while it streams only if the user opened it. The one-line summary is the default surface.
7. **One shimmer.** Exactly one row is allowed to animate per focused pane. Motion marks the present; if two rows shimmer, the user cannot tell what is happening now.
8. **Bodies are capped, not unbounded.** Every expanded body has a maximum height and internal scroll, and auto-follow only near the bottom.
9. **No spinners inside sentences.** The Eclipse glyph is a status mark in the icon column, not a character in the label. `generating.tsx` currently ignores its label, which is why this rule is needed.
10. **Density over decoration.** No card backgrounds, no borders between rows, no per-row dividers. Spacing and weight do the work. A tool call is not a message.

## 4. The target model

### 4.1 Pipeline

```
Chunk[]  ->  normalize  ->  WorkRow[]  ->  coalesce  ->  group  ->  WorkRowGroup[]  ->  summary
```

Normalization is a pure function over the existing chunks. It does not touch the stream store, the Rust side, or the persisted message format. That is the property that keeps this dossier at nine days instead of becoming a data migration.

### 4.2 Types

New module `features/chat/ui/work-rows/`:

```ts
export type WorkStatus =
  | "queued"
  | "running"
  | "waiting"      // waiting on a human, for example an approval
  | "ok"
  | "failed"
  | "interrupted"
  | "superseded";

export type WorkRow =
  | { kind: "thought"; id: string; status: WorkStatus; text: string;
      startedAt?: number; endedAt?: number; wordCount: number }
  | { kind: "read"; id: string; status: WorkStatus; paths: string[]; count: number }
  | { kind: "edit"; id: string; status: WorkStatus; paths: string[];
      added: number; removed: number }
  | { kind: "command"; id: string; status: WorkStatus; command: string;
      exitCode?: number; durationMs?: number; output?: string }
  | { kind: "search"; id: string; status: WorkStatus; query: string;
      scope: "code" | "files" | "web"; hits?: number }
  | { kind: "web"; id: string; status: WorkStatus; query?: string; urls: string[] }
  | { kind: "tool"; id: string; status: WorkStatus; name: string;
      integration?: string; subject?: string }
  | { kind: "subagent"; id: string; status: WorkStatus; title: string;
      childConversationId?: string; outcome?: "completed" | "failed" }
  | { kind: "approval"; id: string; status: WorkStatus; action: string; target: string }
  | { kind: "notice"; id: string; status: WorkStatus; tone: "info" | "error"; label: string };
```

Mapping from today's chunks, which is mechanical and testable:

| Chunk types | Row kind |
| --- | --- |
| `think`, `thought` | `thought` |
| `cat`, `read_file` style reads, `inspect_runtime` | `read` |
| `create_file`, `edit`, `edit_pending`, `delete_file`, `rename_file`, `mkdir` | `edit` |
| `terminal_command`, `run` | `command` |
| `search`, `grep`, `search_result` | `search` (scope code or files) |
| `web_search`, `web_result`, `web_visit` | `web` or `search` with web scope |
| `plugin_call`, MCP calls | `tool` |
| `subagent`, `subagent_ref` | `subagent` |
| `status`, `ls`, `git_operation` | `command` or `notice` depending on content |
| approval chunks | `approval` |

Three rules for normalization:

- Unknown chunk types become `notice` with the raw type as the label. Nothing disappears silently, and a new upstream chunk type never crashes the transcript.
- A row's `id` is the existing `commandId` when present, otherwise a stable hash of type, index, and content. Stability matters because expansion state and error dismissal are keyed by it.
- `status` is derived once, in order: explicit error, explicit interrupted, streaming and latest turn, pending wait, then ok. No renderer may reinterpret it.

### 4.3 Labels

New `work-rows/labels.ts`, a pure function `label(row, status)` returning `{ verb, subject }`. Verb tables, in the spirit of mausCode's registry:

| Kind | Running | Done | Failed |
| --- | --- | --- | --- |
| read | Reading | Read | Could not read |
| edit | Editing | Edited | Edit failed |
| command | Running | Ran | Command failed |
| search (code) | Searching | Searched | Search failed |
| search (web) | Searching the web | Searched the web | Search failed |
| web | Opening | Visited | Could not open |
| tool | Calling | Used | Tool failed |
| subagent | Delegating to | Delegated to | Delegation failed |
| thought | Thinking | Thought | (never failed) |
| approval | Waiting for approval | Approved | Rejected |

Subject formatting rules:

- File paths are shown relative to the project root. The existing `getDisplayPath` idea from mausCode is correct: strip the workspace prefix, keep two leading segments when ambiguous, and truncate from the left at 48 characters so the basename survives.
- Commands are shown verbatim, never sentence-cased. `git status` stays `git status`, not `Git status`. `commandLabel.ts` earns its 1,436 lines by unwrapping shell layers before display; a simple version is fine, but it must not capitalize shell input.
- Counts are pluralized with a real plural function, and the count is part of the subject, not a separate column: "Read 12 files", "Ran 3 commands".
- No ellipsis character. Truncation uses three periods per `DESIGN.md`, or better, truncates with a tooltip and no punctuation.
- A subject that is a single item drops the count: "Read package.json", not "Read 1 files".

### 4.4 Groups

`work-rows/summary.ts` owns grouping and the header sentence. Reuse the bucket order from `groupWorkflowRows`: stages, reads, searches, web, writes, lists, subagents. Reuse the sentences from `computeGroupHeader`.

Changes:

- At most **two** priority buckets appear in the summary line. t3code's rule, and it is right: a summary that lists five buckets is a paragraph. The remainder becomes "and N more" where N is the number of remaining rows, not buckets.
- Mixed read and write with no commands keeps "Explored and edited". Read only is "Explored codebase". Write only is "Edited files". Commands only is "Ran commands". Nothing but thought is "Thought". Anything unmapped is "Worked".
- If any row failed, the header gains a leading alert glyph and the suffix " · 1 failed". This must survive collapse.
- The summary line uses the same `ActionLine` rendering with `shimmer` while the turn is running, so the font, height, and color are identical to a single row. Today's summary uses the same path, which is why this is a small change visually.

### 4.5 Expansion

| Row | Body | Default |
| --- | --- | --- |
| thought | markdown reasoning, max 320px, internal scroll | collapsed when done, collapsed while live unless opened |
| read | grouped path list with line ranges | closed |
| edit | existing diff body from `workflow.tsx` | open while pending approval, closed when done |
| command | `TerminalCommandStep` output, capped at 16,000 chars | open while running, closed when done |
| search | query, scope, hit list | closed |
| web | host list with favicons, first snippet per host | closed |
| tool | arguments and result JSON, pretty-printed, collapsed > 40 lines | closed |
| subagent | title, outcome, link to the child conversation | closed |
| approval | existing `ApprovalCard` | always visible |
| notice | one line, no body | n/a |

Expansion rules:

- Multiple rows may be open at once. Bodies are capped at 384px each with internal scroll, so three open bodies cannot push the transcript off screen.
- Opening a body does not scroll the transcript. The row stays put and the body appears below it, pushing later content down. Scroll anchoring must be applied to the row, not the container, or the view jumps.
- Expansion state is keyed by row id and kept for the life of the conversation view, not persisted to disk. Reloading a conversation shows the default states.
- A row with no body is not interactive and has no chevron. This is what stops every line from looking clickable.

### 4.6 Failure, interruption, supersession

- Failed: `text-error` on the verb, `circle-alert` in the icon slot, past-tense verb, body opened automatically exactly once, and a dismiss action on the body header. The row stays failed until dismissed, even if a later retry succeeds; history must not rewrite itself.
- Interrupted: `text-muted`, a "Stopped" detail, and no error color. Distinguishing this from failure is the whole point of mausCode's `isInterrupted`.
- Superseded: rendered as a fold row above the attempt that replaced it, caption "Cut off by a steer", collapsed, muted, and expandable. t3code's `AttemptFoldTimelineRow` is the reference. In BetterShape the trigger is a steer or a restart dispatch, both of which already exist in the upstream semantics recorded in the plan.
- A group containing any failed or interrupted row shows a dot in the collapsed header: error color for failed, muted for interrupted.

### 4.7 Timing

`work-rows/timing.ts`:

```
< 1s        -> no duration shown
< 60s       -> "12s"
< 60m       -> "3m 05s"
otherwise   -> "1h 05m"
```

- The live row ticks once per second, derived from `startedAt`, not from an interval counter, so a backgrounded window returns to the right value.
- Thought rows show duration once finished: "Thought for 12s". If the reasoning is long, add the word count: "Thought for 40s · 320 words". `ThoughtStep` already computes words per 12 seconds for its live line; replace that with the same formatter.
- Do not show a duration for a read, search, or web row under two seconds. It is noise and it makes fast turns jitter.
- Do not show durations in the collapsed summary line. The summary is a sentence, not a dashboard.

### 4.8 Shimmer and motion

There are currently three shimmer implementations: `ShimmerText` (`.agent-progress-loading-text`, 3.4s linear), mausCode's `TextShimmer` at 1.2s, and t3code's `live-tool-shine` at 2.2s with `steps(30)`.

Decision: one implementation, `ShimmerText`, with the timing changed to 2.2s and a stepped easing that approximates `steps(30)`. The 3.4s linear version is too slow to read as activity and too smooth to read as text being generated.

Rules:

- One shimmer per focused pane.
- The shimmer applies to the verb only, never the subject, never the summary sentence's details.
- `animation-play-state: paused` when `document.hidden` or when an IntersectionObserver says the row is offscreen.
- `prefers-reduced-motion: reduce` replaces the shimmer with `text-text-secondary` and no animation. `DESIGN.md` requires this guard for every new animation; the existing `.agent-progress-loading-text` needs it too.
- The chevron rotation is `--transition-fast` (90ms) with `--ease-out`, matching `ActionLine` today.
- `Collapse` stays at 180ms.

### 4.9 Density and typography

| Property | Value | Source |
| --- | --- | --- |
| Row height | 22px min (`py-0.5` plus a 15px line) | `ActionLine` today |
| Font | `chat-text` at 15px, `leading` from the chat tokens | `DESIGN.md` section 3 |
| Verb color | `text-text-secondary`, hover `text-text-primary` | `ActionLine` |
| Subject color | `text-text-muted` | `ActionLine` |
| Row gap | 2px inside a group, 8px between groups | new, matches the current rhythm |
| Icon slot | 16px, always reserved | adapted from t3code's 24px slot |
| Chevron | 16px, visible on hover or when open, always present for rows with a body | current `ActionLine` |
| Expanded body | 384px max, internal scroll, 12px inset | t3code's `max-h-96` |
| Failed verb | `text-error` | new, uses the existing token |

No row background, no border, no shadow. The one exception is the approval card, which already has `squircle-[20px] bg-surface-3` and should keep it because it is an action, not a log line.

### 4.10 Status glyphs

The icon slot is 16px and always reserved. What goes in it:

| State | Glyph | Tone |
| --- | --- | --- |
| queued | hollow circle | `text-text-muted` |
| running | the kind's icon (document, terminal, magnifier, globe, sparkle, branch) | `text-text-muted`, with the verb shimmer carrying the motion |
| waiting | the approval glyph | `text-text-secondary` |
| ok | the kind's icon | `text-text-muted` |
| failed | `circle-alert` | `text-error` |
| interrupted | a stop square | `text-text-muted` |
| superseded | a corner-up-left arrow | `text-text-muted` at 60 percent opacity |

Rules:

- The glyph never changes size or column position between states, so a row that fails does not shift its label.
- No spinner in this slot. The Eclipse component is for the composer's send state and the sidebar's working dots, not for log rows; a spinning glyph at 16px reads as noise when twenty rows are visible.
- A tool with a known brand icon uses it (GitHub, Figma, Linear), the same way `ActionLine` uses favicons for web marks. Unknown tools get the generic sparkle.
- The glyph is decorative for screen readers (`aria-hidden`); the state is announced by the label text and an `aria-live` region only for failures.

### 4.11 A worked example

The same turn, collapsed and expanded, in the grammar this dossier specifies:

```text
Thought for 8s                                                     [chevron]
Read 4 files                                          +12 -3          [chevron]
  src/agent/session.rs, src/agent/models/mod.rs, and 2 more
Ran 2 commands                                                        [chevron]
  cargo check
  cargo test --lib
Edited 3 files                                        +48 -11         [chevron]
```

Expanded, the failed row keeps its place and opens itself once:

```text
Ran 2 commands · 1 failed                                             [chevron]
  cargo check                                             0.8s    exit 0
  cargo test --lib                                        4.1s    exit 101
    error[E0308]: mismatched types
    ... 42 more lines
```

And the thinking row, expanded while it streams:

```text
Thinking                                                             [chevron]
  The failing assertion is in the session restore path. The checkpoint
  index is written before the workspace guard runs, so a restore that
  is rejected still advances the index. I need to move the write after
  the guard returns.
```

Three things to notice: the summary is a sentence, not a table; counts sit on the right where they do not interrupt the verb; and the failed command is visible without opening anything, because the group header already says "1 failed".

## 5. Thinking, in detail

The thinking block is where the three codebases disagree the most, and where the user asked for the deepest research.

### 5.1 States

| State | Label | Body | Default |
| --- | --- | --- | --- |
| streaming, collapsed | "Thinking" with shimmer, ticking | hidden | this |
| streaming, expanded | "Thinking", ticking | streaming markdown, last block faded | user opened it |
| done, short | "Thought" | hidden | collapsed |
| done, timed | "Thought for 12s" | hidden | collapsed |
| done, long | "Thought for 40s · 320 words" | markdown | collapsed |
| none | nothing rendered | n/a | n/a |

### 5.2 Behavior rules

- Auto-collapse 900ms after the thought finishes, unless the user expanded it by hand during the turn, or the pointer is inside the body, or focus is inside the body. mausCode auto-collapses; t3code leaves it open. The user is mid-turn and reading; collapsing under the pointer is the failure to avoid, so the three exemptions are required.
- While collapsed and streaming, the row shows a one-line live preview after the verb, truncated at 80 characters, taken from the latest sentence rather than the first. This is where `liveThoughtLine` is wrong for a long thought: it uses the first sentence, which is stale after ten seconds. Use the last complete sentence, falling back to the last fragment.
- If the provider returns no reasoning text, render nothing. Do not render "Thought for a moment" as a placeholder; that is a fake claim about work.
- Reasoning text is displayed only. It is never re-sent to the provider on the next turn and never used for title generation. If the stream and the stored message already separate reasoning from assistant text, keep them separate; the UI must not merge reasoning into the visible assistant message.
- Persist at most 32,000 characters of reasoning per turn, marked truncated when clipped. Do not index reasoning for search. This is a storage cap decision, consistent with the checkpoint and output caps elsewhere in the plan.
- The body renders through `ChatMarkdown`, muted, at 15px. Do not drop to 14px: it looks like a footnote and invites skipping, which defeats the purpose of showing it.
- Words and duration are both derived, never stored. Word count is whitespace-split on the trimmed text.

### 5.3 Why not a separate "activity panel"

The pattern literature recommends an activity panel separate from the transcript for long-running agents. That is right for a browser or a canvas product with a persistent right rail. BetterShape's chat already has a right workspace column, and the transcript is the primary surface. Moving tool calls to a rail would break the inline reading order and make the transcript lie about what happened between two messages.

Decision: keep activity inline, in reading order, with the summary row as the compressible surface. This is the t3code model, not the dashboard model.

## 6. Files

New:

- `features/chat/ui/work-rows/types.ts`
- `features/chat/ui/work-rows/normalize.ts`
- `features/chat/ui/work-rows/labels.ts`
- `features/chat/ui/work-rows/summary.ts`
- `features/chat/ui/work-rows/timing.ts`
- `features/chat/ui/work-rows/row.tsx` (renders `ActionLine` plus the body slot)
- `features/chat/ui/work-rows/thought.tsx`
- `features/chat/ui/work-rows/group.tsx`

Modified:

- `features/chat/ui/blocks/turn.tsx`: `TurnWorkflowSummary` becomes a thin wrapper over `group.tsx`; the open state and the active-turn behavior stay.
- `features/chat/ui/blocks/workflow.tsx`: loses label and grouping functions to the new module; keeps diff, file list, and git parsing bodies.
- `features/chat/ui/blocks/action-line.tsx`: gains `status`, `failed`, and a reserved icon slot; the visual contract does not change.
- `features/chat/ui/blocks/thinking.tsx`: deleted after migration.
- `features/chat/ui/blocks/generating.tsx`: honors its `label` prop, or is replaced by the thought row's status mark.
- `components/ui/shimmer-text.tsx` and `app/globals.css`: one shimmer, 2.2s, stepped, reduced-motion guard.
- `features/chat/ui/md/renderer.tsx`: `Chunk` stays as the wire shape; only the `WORKFLOW_CHUNK_TYPES` set is replaced by the normalizer's coverage test.

## 7. Port plan

### T0 - model and normalization (2d)

- Types, normalizer, and the chunk coverage table in section 4.2 as a unit test with fixtures taken from real stored conversations.
- Move `coalesceConsecutiveSameTasks` and `coalesceConsecutiveSameFileEdits` into `work-rows/normalize.ts` unchanged, with their current behavior pinned by tests (consecutive thoughts merge, interleaved thoughts do not, same-file edits merge, repeated commands merge).
- Move `groupWorkflowRows` and `computeGroupHeader` into `summary.ts`, unchanged except for the two-bucket cap and the failure suffix.

### T1 - renderer and labels (3d)

- `row.tsx`, `labels.ts`, and the verb table.
- `ActionLine` gains status and a failure tone; every row renders through it.
- Switch `TurnWorkflowSummary` to the new module behind `settings.chat.workRows: "legacy" | "next"`, default `legacy` until T4.
- Snapshot the old and new summaries for a corpus of ten stored turns and diff them by eye before flipping the default.

### T2 - thinking (1.5d)

- `thought.tsx` with live preview, auto-collapse exemptions, duration and word count, 32,000-character cap.
- Replace both legacy thinking paths and the `ThinkingBlock` export.
- Reduced-motion behavior for the live line.

### T3 - failure, interruption, supersession (1.5d)

- Status derivation for error, interrupted, and superseded.
- Alert dot and "N failed" in collapsed groups.
- Attempt fold row.
- Dismiss on failed body.

### T4 - polish and cleanup (1d)

- Density pass against the table in 4.9 at 15px.
- Keyboard: rows with bodies are focusable, Enter/Space toggles, Escape closes the innermost open body.
- Delete `blocks/thinking.tsx`, remove the flag, delete the dead helpers in `workflow.tsx`.
- Verify with both bar styles and the two-pane layout from D22.

Total 9 days.

## 8. Acceptance criteria

Presentation

- A single tool call, a group of twenty, and a group with a failure all read correctly when collapsed.
- Verb tense matches status in every row; no running row shows a past tense and no finished row shows a gerund.
- Commands render verbatim; no shell input is sentence-cased.
- Counts are pluralized and single-item subjects have no count.
- Row height, font size, and colors match the table in 4.9 in both bar styles.

Behavior

- Two adjacent identical searches merge into one row with a count; two searches separated by an edit do not merge.
- Consecutive thoughts merge; a thought followed by an edit and another thought stays three rows.
- Only one row shimmers at a time per focused pane, and the shimmer pauses when the window is hidden.
- A failed row stays failed and visible through group collapse, and the collapsed header says "1 failed".
- An interrupted row is muted and says "Stopped", not an error.
- A superseded attempt is a collapsed fold above its replacement with the "Cut off by a steer" caption.
- Expansion state survives scrolling but not reload; reloading a conversation shows default states.
- Auto-follow in a command body stops as soon as the user scrolls more than 4px from the bottom.

Thinking

- A finished thought is collapsed by default, shows "Thought for 12s" when measurable, and does not collapse while the pointer or focus is inside it.
- A thought with no text renders nothing at all.
- Reasoning is capped at 32,000 characters and is never sent back to the provider.
- Reduced motion removes all shimmer and preserves the state change.

Quality

- Normalizer tests cover every chunk type in `WORKFLOW_CHUNK_TYPES` plus one unknown type.
- Label tests cover every verb pair and the path truncation rules on Windows and POSIX paths.
- No new dependency.
- `npx tsc --noEmit`, `npm run lint`, and `npm run test:all` pass; any existing tests that assert workflow labels or grouping are updated to the new module, not deleted.

## 9. Traps

- **Do not rewrite the chunk pipeline.** The normalizer is a view over existing chunks. The moment it changes the wire format, this becomes a storage migration and D01 Part B gains a dependency.
- **Do not keep two label sources.** If `workflow.tsx` keeps its own verb strings while `labels.ts` exists, the drift is guaranteed within a month. Delete as you move.
- **Do not animate the summary and the rows independently.** The summary's shimmer is the turn's state; if a row also shimmers, there are two "nows".
- **Do not auto-collapse a body the user opened.** mausCode's auto-collapse works because the body is a preview, not a reading surface. Guard with pointer and focus, and with an explicit `userOpened` bit per row.
- **Do not use the ellipsis character.** `DESIGN.md` is explicit; three periods or a tooltip.
- **Do not put durations in the summary.** It turns a sentence into a metrics bar and makes every turn look slower than it felt.
- **Do not render an empty thought.** A placeholder "Thought for a moment" is a claim about work that may not have happened.
- **Do not add per-row borders.** The moment rows become cards, a turn with twenty calls becomes a wall, and the transcript loses its reading rhythm.

## 10. Effort

| Piece | Days |
| --- | --- |
| T0 model, normalization, moved coalescing | 2 |
| T1 renderer, labels, flag | 3 |
| T2 thinking | 1.5 |
| T3 failure, interruption, supersession | 1.5 |
| T4 polish, keyboard, cleanup | 1 |
| Total | 9 |

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/17-tool-calls-and-thinking.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D17: Tool call and thinking presentation. Scope: a normalized WorkRow model, one label grammar, one status model, one thinking block, failure and supersession markers, expansion limits, and one shimmer. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/17-tool-calls-and-thinking` from the current `draft/mega-absorb-all` only after dossier 16 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
