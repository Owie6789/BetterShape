# D12: Context assembly, instruction files, and the budget

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/12-context-assembly`) |
| Roadmap source | mausCode step 23 (issue #25) |
| Issue title | `D12: Context assembly, instruction files, and the budget` |
| Labels | `port`, `dossier:12`, `area:agent`, `size:M`, `stage:2` |
| Depends on | D07 (composer context records), D08 (run events for per-turn counts) |
| Blocks | D28 (memory), D29 (skills) |
| Effort | 10 days |

**Port verdict: PORT THE LOADER, BUILD THE BUDGET. mausCode step 23 assumes an instruction loader that does not exist in BetterShape either. Today the app has a repo map with a token budget and a `<user_rules>` block appended with no budget at all, and it has never read an `AGENTS.md`.**

## 1. Today

| Surface | Where | Behavior |
| --- | --- | --- |
| System prompt | `agent/prompts/SYSTEM.MD` plus per-family files | static, no project input |
| User rules | `commands/send_chat.rs:37` `custom_rules`, merged with `custom_system_prompt` at `:471-478` | appended verbatim inside `<user_rules>`, unbounded |
| Repo map | `agent/context/repo_map.rs` (`DEFAULT_REPO_MAP_TOKENS`) | the only budgeted part |
| Diagnostics, git status | `agent/context/mod.rs` `ContextOptions` | included by default, unbudgeted |
| Token math | `agent/context/tokens.rs`, `breakdown.rs` | used for display and model limits, not for assembly |
| Compaction | `Conversation.summary` + `summary_fold_end` (`models/mod.rs:152-159`) | a rolling summary exists; nothing guards what happens when it fails |
| Instruction files | none | `grep -rn "AGENTS.md" src-tauri/src` returns nothing |

So the model gets whatever fits by luck. A 4,000-line `AGENTS.md` copied into rules would crowd out the repo map and the last two turns, and the user would see a context-limit failure with no breakdown of what consumed it.

## 2. Design

### 2.1 Discovery and precedence

For a session with a workspace root `R`:

1. Global: `$APP_DATA/instructions/AGENTS.md`, then `~/.claude/CLAUDE.md` if present (read-only, labeled "external").
2. Project root: `R/AGENTS.md`, then `R/CLAUDE.md`.
3. Every ancestor directory from `R` to the active file's directory: `AGENTS.md` in each, nearest last.
4. Project settings rules (`settings.agent.rules`), split into sections by heading.
5. Per-session rules from the composer's context records (D07), highest priority.

Precedence is not "later wins" for conflicting sentences; the assembled prompt groups sources and labels each block with its path, so the model can see that a nested file overrides its parent. The UI shows the resolved order, not a merged blob.

Each source is read through the workspace path guard (D03) and never through a symlink that escapes `R`. The two global sources in step 1 are the one sanctioned exception: they are read from `$APP_DATA/instructions/` and `~/.claude/` because the user put them there on purpose, they are labeled `external` in the assembled prompt, and they are the only reads allowed outside `R`. A file over 256 KiB is refused with `instruction_too_large` and the size.

### 2.2 Counting

`agent/context/tokens.rs` gains `estimate(text) -> usize` using a byte-class heuristic (CJK 1.7 bytes/token, ASCII 3.9, code 3.4) calibrated against the provider's reported usage on the last turn: the assembler keeps `last_error_ratio` per model and corrects estimates within 10 percent. This is an estimate by design; the provider's usage event (D08 `usage.recorded`) is the ground truth for billing, not for the next assembly.

### 2.3 Budget

```rust
pub struct ContextBudget {
    pub context_window: usize,
    pub reserve_output: usize,     // model max output, clamped to 25% of the window
    pub system: usize,             // fixed
    pub instructions: usize,       // 10% cap, minimum 2_000
    pub rules: usize,              // 4% cap
    pub repo_map: usize,           // existing default
    pub retrieval: usize,          // 15% cap
    pub transcript: usize,         // the remainder
}
```

The sum never exceeds `context_window - reserve_output`. Allocation is largest-remainder so the integers add up exactly. When a category overflows, it is cut in a defined order and the cut is reported:

1. Retrieval drops lowest-scored chunks first.
2. Repo map shrinks to its configured minimum, then drops.
3. Instructions drop whole files from the least specific (global) inward, never half a file.
4. Rules are truncated last, and only with an explicit `<rules_truncated original_tokens=...>` marker in the prompt.
5. The transcript is never truncated by assembly; if it overflows, the turn fails with `context_overflow` naming the categories, and the user is offered compaction.

A `ContextPlan` is computed before the request and stored as a `context.assembled` event with per-category counts and per-file hashes. The usage panel reads it.

### 2.4 Stable and volatile parts

Two strings, in this order:

```
[stable]   system prompt, family prompt, instruction files, rules, repo map
[volatile] diagnostics, git status, retrieval chunks, memory (D28), transcript
```

The stable prefix changes only when an input file's hash or a setting changes. That is what makes provider prompt caching work; a timestamp in the stable part would defeat it. `ContextPlan.stable_hash` is recorded per turn, and the cache-hit ratio from `usage.recorded` is shown next to it.

### 2.5 Cache

`InstructionCache` keyed by `(workspace_id, source_path, mtime_ms, size, sha256)`, bounded to 64 entries and invalidated by the file watcher's modify/rename events. A missing file invalidates its entry. The cache is per process and rebuilt on start; correctness never depends on it.

### 2.6 Compaction guard

When the transcript must shrink, the summariser runs on the older half and returns `{summary, folded_to_message_id, tokens_before, tokens_after}`. Rules:

- If the summary fails, times out (20 s), or returns empty, the turn fails with `compaction_failed` and the transcript is unchanged. Fail closed.
- `summary_fold_end` moves only after the summary is persisted in the same transaction.
- The summary may not include instructions or memory; those are re-assembled fresh. A summary that swallows `AGENTS.md` cannot be undone.

## 3. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/context/instructions.rs` | discovery, precedence, hashing, size guard |
| `src-tauri/src/agent/context/budget.rs` | allocation, largest remainder, cut order |
| `src-tauri/src/agent/context/assemble.rs` | stable/volatile assembly, `ContextPlan` |
| `src-tauri/src/agent/context/cache.rs` | instruction cache and watcher wiring |
| `src-tauri/src/agent/context/tokens.rs` | calibrated estimate |
| `src-tauri/src/agent/commands/send_chat.rs` | delete the unbudgeted `<user_rules>` append |
| `features/agent/context/*` | per-turn breakdown, cut notices |

## 4. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | discovery, precedence, path guard, size limits | 2 |
| P1 | token estimate plus calibration, budget allocation, cut order | 2.5 |
| P2 | assembly, stable hash, plan event, cache | 2 |
| P3 | compaction guard and transactional fold boundary | 1 |
| P4 | UI breakdown, notices, tests | 2.5 |
| | **total** | **10** |

## 5. Acceptance criteria

1. A repo with root and nested `AGENTS.md` produces blocks in root-to-leaf order, each labeled with its path; deleting the nested file removes only that block.
2. A 300 KiB instruction file is refused with `instruction_too_large`, and the turn still runs with the remaining sources.
3. The assembled categories sum to the budget exactly; a property test over 1,000 random budgets asserts no overflow and no negative remainder.
4. Overflow drops retrieval, then repo map, then whole instruction files, then truncates rules with a marker; the order is asserted by four fixtures.
5. `stable_hash` is identical for two turns with no file or setting change, and differs when one instruction byte changes.
6. The cache serves a second turn without reading the file (instrumented counter) and re-reads after a modify event.
7. A summariser that returns an empty string leaves `summary` and `summary_fold_end` untouched and fails the turn with `compaction_failed`.
8. The usage panel shows per-category tokens, the cut list, and the prompt-cache hit ratio for the turn.
9. No instruction source is read outside the workspace root through an escaping symlink. The only reads outside `R` are the two global sources named in section 2.1 step 1, and a test asserts no other path outside `R` is opened.
10. The full gate passes.

## 6. Traps

- **Do not put a timestamp or a session id in the stable part.** It looks harmless and silently destroys prompt caching for every provider that supports it.
- **Do not truncate a file mid-sentence.** Whole-file drops are explainable; half a rule is a rule the model follows incorrectly.
- **Do not let the token estimate back the budget for billing.** D11's ledger uses provider usage; assembly uses the estimate.
- **Do not re-summarise on every turn.** The fold boundary only moves when the summary is accepted.
- **Do not merge instruction files into one anonymous block.** Provenance is what lets the user debug a rule that is not being followed.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/12-context-assembly.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D12: Context assembly, instruction files, and the budget. Scope: instruction discovery and precedence, the size and path guards, a calibrated token estimate, the budget allocator and its cut order, stable/volatile assembly with a stable hash, the instruction cache, the transactional compaction guard, and the per-turn breakdown UI. Do not implement memory (D28), do not implement skills (D29), do not change the provider request shape, and do not remove the existing repo map.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/12-context-assembly` from the current `draft/mega-absorb-all` only after dossier 11 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
