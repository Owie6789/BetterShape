# D25: Orchestrator MCP, delegation, and cross-agent control

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/25-orchestrator-mcp-and-delegation`) |
| Roadmap source | mausCode steps 19, 28 (issues #21, #30) |
| Issue title | `D25: Orchestrator MCP, delegation, and cross-agent control` |
| Labels | `port`, `dossier:25`, `area:agent`, `size:L`, `stage:5` |
| Depends on | D01, D08 (runs), D14 (worktrees) |
| Blocks | none |
| Effort | 19 days |

**Port verdict: TAKE the MCP server as a new capability. RE-DERIVE the delegation semantics on top of BetterShape's existing subagent runtime.**

BetterShape has an MCP **client** (`lib/mcp/config.ts`, `registry.ts`, `oauth.ts`, `parse.ts`, 491 lines total) and no MCP **server**. t3 ships a server whose only purpose is to let an agent control the orchestration layer: delegate tasks, inspect threads, send messages, wait, interrupt, schedule. That is the most strategically interesting port in the entire plan, because it turns the app from a chat window into an orchestrator that other agents can drive.

## 1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `packages/contracts/src/orchestratorMcp.ts` | 900+ | tool input and output schemas with descriptions |
| `apps/server/src/mcp/OrchestratorMcpService.ts` | 1,100+ | tool handlers |
| `apps/server/src/mcp/WorktreeMcpService.ts` | 464 | worktree tools |
| `apps/server/src/mcp/ThreadMetadataMcpService.ts` | 234 | title, pin, settle metadata tools |
| `apps/server/src/mcp/McpHttpServer.ts` | - | transport |
| `apps/server/src/mcp/McpSessionRegistry.ts` | - | per-session state |
| `apps/server/src/mcp/McpToolAccess.ts` | - | allow/deny policy |
| `apps/server/src/mcp/McpInvocationContext.ts` | - | caller identity and thread scope |
| `apps/server/src/mcp/threadAccess.ts` | 184 | which threads a caller may see |
| `apps/server/src/mcp/toolkits/**` | 12 dirs | attachment, device, environment, html, orchestrator, preview, previewControls, project, pullRequests, thread, worktree |
| `apps/server/src/mcp/PreviewAutomationBroker.ts` | - | let an agent drive the preview browser |
| `apps/server/src/orchestration-v2/DelegatedTaskQuestionReactor.ts` | 178 | child asks a question, parent gets it |
| `apps/server/src/orchestration-v2/DelegatedCompletionDelivery.ts` | - | child completion into the parent |
| `apps/server/src/orchestration-v2/ContextHandoffService.ts` | 498 | portable context between providers/threads |

## 2. Mechanism

### 2.1 The tool surface

The contract defines families:

- **Delegation**: `delegate_task`, `task_status`, `task_cancel`.
- **Threads**: `create_threads`, `thread_list`, `thread_read`, `thread_send`, `thread_wait`, `thread_interrupt`.
- **Capabilities**: `orchestrator_capabilities` returns provider instances, models, and option selections.
- **Schedules**: `schedule_task`, `list_scheduled_tasks`, `update_scheduled_task`, and related.
- **Worktrees**: list, create, remove.
- **Metadata**: title, pin, settle state.
- **Preview**: controls for the in-app browser.
- **Pull requests**: link, read, review actions.

### 2.2 Semantics that make delegation usable

`delegate_task`:

```
task: self-contained prompt
target?: { providerInstanceId?, driverKind?, model?, options? }
title?, role?: implementation | research | review | design | test | general
isolation?: shared | worktree      // worktree starts from the parent's current local commit;
                                   // uncommitted edits are NOT copied
mode?: async | wait                // default async
timeoutMs?                         // wait budget only; elapsing does NOT cancel the child
clientRequestId?                   // idempotency key; reuse on retry
runtimeMode?, interactionMode?     // defaults to inherit
```

The doc comments encode hard-won behavior. Three examples:

1. On runtime mode: "A narrower mode is not a read-only switch: on most providers, approval-required and auto-accept-edits pause the child at each action that needs approval until a person approves it in the child's thread, which this thread cannot do. To limit what the child does, say so in the task." That is exactly the kind of guidance a tool description must carry, because models will otherwise pick `plan` mode and deadlock.
2. On isolation: uncommitted edits are not copied into the worktree. A child that needs the parent's in-progress work must run shared.
3. On wait: a timeout returns `waitTimedOut: true` and does not cancel the child. The parent decides.

Result shape includes `childThreadId`, `childRunId`, `childNodeId`, `status`, `workState: "working" | "waiting_for_children" | "result_available"`, `hasPendingChildRuns`, and the latest terminal run status. That is enough for a parent to reason about a child without polling the transcript.

### 2.3 Parent-child run semantics

`thread.created.record` ties a child thread to a parent. `delegated_task.completion-delivery.acknowledge` and `.dispose` control whether a child's result is delivered into the parent as a message. `QueuedRunOrder.isAutomaticCompletionRun` (D09) makes those completion runs jump the parent's queue. `DelegatedTaskQuestionReactor` routes a child's user-input request to the parent thread so the question is not stranded.

`ContextHandoffService` builds a portable context when a child runs on a different provider or when a thread must continue after a provider change. The strategies are `native_fork`, `portable_context`, and `delta_context`, with `ContextHandoffBudget` limiting size.

### 2.4 Access control

`McpToolAccess`, `McpInvocationContext`, and `threadAccess.ts` mean the MCP server is not a root shell. A caller has an identity, a thread scope, and a tool allowlist. `McpSessionRegistry` keeps per-session state so two agents do not share a tool cursor.

## 3. BetterShape today

| capability | status | evidence |
|---|---|---|
| MCP client | exists | `lib/mcp/*` (491 lines) |
| MCP server | absent | no listener, no stdio bridge |
| subagents | exists: `spawn_subagent`, max 4, model allowlist, shared/worktree | `agent/subagents.rs`, `tools/schema.rs:832` |
| subagent completion | posts an update when finished | `subagents.rs` |
| subagent questions | not routed to the parent | no reactor |
| external agent control | absent | no API |
| thread read/send API | absent | commands are internal Tauri IPC |
| worktree tools | exists as agent tools, not MCP | `tools/dispatch/git.rs` |

BetterShape's `spawn_subagent` description already tells the model that shared isolation can overwrite files and that it must not merge the subagent's branch. That is the right instinct. What is missing is the control plane: status, cancel, wait, and questions.

## 4. Port plan

### Phase 1: a local MCP server (5-6 days)

Transport choice: **stdio** first, mounted as `bettershape mcp serve`, and **loopback HTTP** second if an external tool needs it. Do not expose a network port by default.

Server core in Rust (`src-tauri/src/mcp_server/`):

```
mod server;      // JSON-RPC framing and lifecycle
mod registry;    // tool registration and schemas
mod access;      // caller identity, allowlist, thread scope
mod tools;       // implementations that call existing AgentState APIs
```

Tools for phase 1, deliberately small:

| tool | behavior |
|---|---|
| `orchestrator_capabilities` | return providers, models, modes, and limits |
| `delegate_task` | create a background subagent or child conversation; return ids and status |
| `task_status` | return status, work state, latest terminal run, and a short result summary |
| `task_cancel` | cancel by id, idempotent |
| `thread_list` | list conversations with title, project, updated_at, status |
| `thread_read` | return the last N messages of a conversation, token-capped |
| `thread_send` | append a user message to a conversation, with idempotency key |
| `worktree_list` | list managed worktrees |

Every mutating tool takes `clientRequestId`. Store the last 1,000 request ids with their results and replay the stored result on a duplicate. This is the single most important reliability feature of an agent-facing API.

### Phase 2: delegate semantics (4 days)

1. Extend `subagents.rs` with a task registry: `{ id, parent_conversation, child_conversation, role, status, work_state, created_at, completed_at, result_summary }`.
2. Add `task_status` and `task_cancel` to the existing agent tool schema, not just MCP. BetterShape's own agent should use the same tools as an external caller; one implementation, two frontends.
3. Work state: `working`, `waiting_for_children`, `result_available`. Compute it from the child's run status and pending questions.
4. `wait` mode with a budget, returning `wait_timed_out` without cancelling. Cap the budget at 10 minutes by default.
5. Completion delivery: when a child finishes, post a compact result message into the parent (summary plus artifacts), and mark it so the parent's queue can prioritize it.

### Phase 3: questions and handoff (5 days)

1. Route a child's ask-user question to the parent thread as a structured card, with the child id and the question. Answering forwards to the child.
2. `ContextHandoff` for cross-provider children: serialize a bounded transcript summary plus file references. Budget it explicitly (for example 40k characters) and record truncation.
3. If a provider switch happens while a child is running, either keep the child on its original provider or hand off with the portable strategy; never silently restart it.

### Phase 4: external access and policy (4 days)

1. `McpToolAccess`: a per-caller allowlist, default deny for destructive tools (`thread_send` to an arbitrary thread, worktree removal, task cancel of another caller's task).
2. `threadAccess`: a caller sees only threads it created or was granted.
3. Audit log: one row per tool call with caller, tool, thread, result, and duration. Local only, never uploaded.
4. Settings UI: MCP server on/off, allowed tools, connected clients, recent calls, revoke.

### Phase 5: preview and PR tools (deferred)

The preview broker and PR tools are valuable but depend on D16 and D21. Keep the registry extensible so they can be added without touching the server core.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `OrchestratorMcpService.test.ts` | delegation results, idempotency, status transitions |
| `OrchestratorMcpToolkit.integration.test.ts` | end-to-end delegate, wait, cancel |
| `TaskCancelNativeSubagent.integration.test.ts` | cancel propagates to a native subagent |
| `McpToolAccess.test.ts` and `.race.test.ts` | allowlist and concurrent access |
| `threadAccess` tests | scope isolation |
| `DelegatedCompletionDelivery.test.ts` (1,933) | delivery ordering, acknowledgement, disposal |
| `ContextHandoffService.test.ts` | budget and truncation |

## 6. Traps

- **Do not expose a LAN port.** Stdio or loopback only. An MCP server is a remote code execution surface by design.
- **Idempotency is not optional.** Agents retry on timeout. Without stored request ids, a retry spawns a second child.
- **Wait must not cancel.** A timeout is a reporting event, not a control action. Upstream is explicit and correct.
- **Runtime mode is not a sandbox.** Document that a narrower mode can deadlock a child waiting for approval. Recommend prompt-level constraints instead.
- **Do not let a caller read arbitrary threads.** The scoping check is the difference between an orchestrator and a data leak.
- **Tool descriptions are prompt engineering.** Port the upstream descriptions almost verbatim; they encode failure modes the model needs to know.

## 7. Effort

| phase | days |
|---|---:|
| MCP server core, stdio, 8 tools | 6 |
| delegation registry and semantics | 4 |
| questions and handoff | 5 |
| access policy, audit, settings | 4 |
| **total** | **19** |
| preview/PR tools (deferred) | 6 |

## 8. Acceptance criteria

1. An external MCP client can list threads, read one, and send a message that appears in the UI immediately.
2. Repeating a `delegate_task` with the same `clientRequestId` returns the original child and does not spawn a second.
3. `task_cancel` on a completed task is a no-op with a terminal status, not an error.
4. `wait` with a 1 second budget returns `wait_timed_out` and the child keeps running.
5. A child's question appears in the parent as a card and can be answered from the parent.
6. A caller cannot read a thread outside its scope; the attempt is denied and audited.
7. The server refuses to bind beyond loopback and starts disabled by default.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/25-orchestrator-mcp-and-delegation.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D25: Orchestrator MCP, delegation, and cross-agent control. Scope: a stdio MCP server with eight orchestrator tools, a delegation registry, task status and cancel, and replay protection for 1,000 client request ids. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/25-orchestrator-mcp-and-delegation` from the current `draft/mega-absorb-all` only after dossier 24 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
