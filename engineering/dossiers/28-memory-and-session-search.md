# D28: Auditable memory and search across past sessions

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/28-memory-and-session-search`) |
| Roadmap source | mausCode steps 24, 44 (issues #26, #46) |
| Issue title | `D28: Auditable memory and search across past sessions` |
| Labels | `port`, `dossier:28`, `area:agent`, `size:L`, `stage:5` |
| Depends on | D08 (run records), D12 (context budget), D03 (permissions), D04 (redaction) |
| Blocks | D33 (a moved session keeps its memory) |
| Effort | 16 days |

**Port verdict: BUILD, REUSING THE INDEX. mausCode steps 24 and 44 want a memory the user can see, audit, and delete, plus search over finished sessions. BetterShape has an embedding index for code (`agent/index/embeddings.rs`) and chat history in per-project JSON, but no memory concept and no way to search a past conversation.**

## 1. Today

- Conversations are project-keyed JSON (`agent/commands/history.rs`), each `Conversation` holding its full `history`. Loading a project loads all of its sessions.
- `agent/index/` builds a code index with embeddings. It is not used for chat text.
- There is no `memory` table, no memory setting, no recall step in `send_chat`, and no cross-session search command or UI.
- The transcript is the only record of what was decided; a fact stated three months ago is findable only by opening the right chat and scrolling.

## 2. Memory model

```sql
CREATE TABLE memory_entries (
  id            TEXT PRIMARY KEY,
  scope         TEXT NOT NULL,      -- project | global
  project_id    TEXT,
  session_id    TEXT,               -- provenance, never a filter by default
  kind          TEXT NOT NULL,      -- fact | preference | decision | pitfall | command
  text          TEXT NOT NULL,
  text_hash     TEXT NOT NULL,      -- sha256 of normalised text, dedupe key
  confidence    REAL NOT NULL,      -- 0..1
  source        TEXT NOT NULL,      -- user | agent | import
  provenance    TEXT NOT NULL,      -- JSON: session, turn, run, message ids
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  expires_at    INTEGER,            -- null except for decaying entries
  archived_at   INTEGER
);
CREATE UNIQUE INDEX memory_dedupe ON memory_entries(scope, COALESCE(project_id,''), text_hash);
```

Rules:

1. No entry without provenance. `provenance` names the session, turn, run, and message range that produced it. A test rejects an insert with an empty object.
2. `scope = project` requires `project_id`; `scope = global` forbids it. A project memory is never recalled in another project, and the query asserts it.
3. `source = agent` entries start at `confidence <= 0.7` and require the user's approval unless `agent.memory.autoApprove` is on (default off). `source = user` requires a visible "Remember this" action or an explicit instruction.
4. Text is redacted (D04) before insert. A memory that would contain a secret is refused, not stored redacted, because a redacted secret is a misleading fact.
5. Caps: 500 project entries and 5,000 global. At the cap, the lowest-confidence unused entry is archived, not deleted.

## 3. Write gate

Memory is written at seven lifecycle moments, all through `MemoryManager::consider`:

| Moment | What may be written |
| --- | --- |
| Turn completed | decisions and pitfalls the agent proposed, only with approval |
| User says "remember" | any kind, immediately, `pinned = 1` |
| Session switch | unsaved proposals are dropped, never inferred from silence |
| Compaction checkpoint | a decision that the summary would otherwise lose, with provenance to the folded range |
| Fork | no copy; the fork keeps session provenance only |
| Rollback | memory written after the rollback point is archived, not deleted |
| Import (D06) | imported entries keep `source = import` and start unapproved |

The write path has a 300 ms budget. Over budget or on provider failure, the write is skipped and a `memory.write_skipped` event records why. Memory never blocks a turn.

## 4. Recall

`recall(query, project_id, budget) -> Vec<Recalled>`:

1. Candidates: FTS5 over `memory_entries.text` and `conversation_summaries.text`, plus embedding similarity for the top 50 FTS misses (reusing the index's embedding client when configured).
2. Rank: `0.55 * bm25_norm + 0.30 * semantic + 0.15 * recency`, then `* confidence`, then pinned entries boost 0.2.
3. Filter: scope, not archived, not expired, **approved only** (`approved_at IS NOT NULL`), and a per-entry token estimate that fits the remaining memory budget. An entry that still awaits the user's approval is never injected, so an agent-proposed or imported memory cannot reach the prompt before the user has seen it.
4. Inject at most 6 entries and 600 tokens into the **volatile** tail of the prompt, each with `[memory:<id>]`. The stable prefix never changes because of memory (D12).
5. Recall has a 150 ms hard timeout. On timeout, return an empty list and record `memory.recall_timeout`; do not fail the turn.

`last_used_at` is coalesced to one write per minute per entry.

## 5. Decay

A daily job at startup, not a background daemon:

- `confidence *= exp(-age_days / 90)` for entries not used in 90 days, floored at 0.1.
- Unused and unpinned entries archive at 180 days.
- Pinned entries never decay.
- Archived entries are excluded from recall but remain searchable in the memory UI and are restorable.
- Every decay run writes one `memory.decayed` event with counts, not one per entry.

## 6. Search across sessions

One command, `search_history(query, filters)`, and one view:

- Index: FTS5 over message text, tool names, file paths touched, and titles. Built incrementally when a turn completes (D08's `run.completed`), with a backfill job that reports progress.
- Filters: project, date range, session kind, has tool call, has failure.
- Results: session title, matched message with the query highlighted, date, and a jump that opens the session at that message.
- Semantic search is a second mode, off by default, using the same embeddings; it never replaces keyword results, it appends them.
- Search and recall are local by default. The keyword path, the ranking, and the filters never make a network call. When an embeddings provider is configured and semantic mode is on, the query text and the memory text being embedded are sent to that provider; that is the one outbound path and it is named in the UI next to the toggle, and the result row repeats it. With no provider configured, semantic mode is unavailable and nothing leaves the machine.

## 7. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/migrations/0004_memory.sql` | tables, FTS5 virtual tables, triggers |
| `src-tauri/src/agent/memory/{mod,store,write,recall,decay}.rs` | manager |
| `src-tauri/src/agent/search/{mod,index,query}.rs` | history index and query |
| `src-tauri/src/agent/commands/{memory_cmds,search_cmds}.rs` | commands |
| `src-tauri/src/agent/commands/send_chat.rs` | recall injection at the volatile tail |
| `features/memory/*`, `features/search/*` | memory list, edit, delete, provenance; search view |

## 8. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | schema, dedupe, provenance enforcement, caps | 3 |
| P1 | write gate at seven moments, approval flow, redaction | 3 |
| P2 | recall, ranking, 150 ms timeout, volatile injection | 3 |
| P3 | FTS index, backfill, search command and filters | 4 |
| P4 | memory and search UI, memory decay job | 2 |
| P5 | tests: scope isolation, decay, rollback, export | 1 |
| | **total** | **16** |

## 9. Acceptance criteria

1. An insert without provenance fails; an entry with `scope = project` and a null project fails; a global entry with a project fails.
2. A project memory is never returned by recall in another project, proven with two projects and identical text.
3. Text containing a vault secret is refused with `memory_contains_secret`; the row count does not change.
4. An unapproved entry is never returned by recall; a test inserts an agent-proposed entry with no approval and asserts recall skips it until approval is recorded.
5. Recall injects at most 6 entries and 600 tokens, only into the volatile tail; `stable_hash` is unchanged with and without memory (D12).
6. A recall that exceeds 150 ms returns empty, records `memory.recall_timeout`, and the turn completes.
7. Rollback archives entries whose provenance turn is after the rollback point; it deletes none.
8. Decay archives unpinned entries at 180 days, never pins, and writes one event per run.
9. Search returns a message from a session in another project, and the jump opens at that message.
10. Semantic mode says when text is sent to an embeddings provider; keyword-only mode makes no network call (asserted by a request counter).
11. The full gate passes.

## 10. Traps

- **Do not let the agent write memory by calling a tool silently.** The approval is the product: a memory the user did not see is a belief the app invented.
- **Do not put memory in the stable prefix.** It changes between turns and would destroy prompt caching.
- **Do not dedupe on embedding similarity.** Near-duplicates that merge differently worded decisions lose the nuance; dedupe on normalized text and show both.
- **Do not index tool output.** It is the largest, noisiest, and most attacker-controlled text in the transcript.
- **Do not make search depend on the embeddings provider.** Keyword search must work offline, always.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/28-memory-and-session-search.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D28: Auditable memory and search across past sessions. Scope: the memory table with provenance and dedupe, the seven-moment write gate with approval and redaction, recall with ranking and a 150 ms timeout injected into the volatile tail, the decay job, the FTS5 history index with backfill, search with filters and jump-to-message, and the memory and search views. Do not implement skills (D29), do not change the context budget (D12), and do not auto-approve agent-written memory.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/28-memory-and-session-search` from the current `draft/mega-absorb-all` only after dossier 27 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
