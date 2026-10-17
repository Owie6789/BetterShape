# D26: Critics for plans and patches, with bounded rounds

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/26-critics-and-review-gates`) |
| Roadmap source | mausCode step 20 (issue #22) |
| Issue title | `D26: Critics for plans and patches, with bounded rounds` |
| Labels | `port`, `dossier:26`, `area:agent`, `size:M`, `stage:5` |
| Depends on | D08 (run events, verdict persistence), D16 (diff), D19 (providers) |
| Blocks | nothing hard; D16's review surface reads its findings |
| Effort | 10 days |

**Port verdict: UPGRADE WHAT EXISTS. BetterShape already runs a two-critic debate with a synthesis pass, but it fires on a markup heuristic, returns free text into the transcript, and has no structured findings, no repair loop, and no record of the verdict.**

## 1. Today

`agent/commands/adversarial_review.rs`:

- `should_run` (`:11`) triggers only when an assistant message contains at least five `<edit`/`<create_file` blocks, or three with 2,500 characters of payload. A turn that edits one large file, or that writes through `apply_patch`, never gets a critic.
- `CRITIC_MODEL: &str = "auto"` (`:9`) is hardcoded. There is no cost cap and no per-user choice.
- Two prompts run in parallel (`:70-80`) against the implementer's own output text, not the diff, then a synthesis pass (`:92`). Failures are swallowed into the prompt (`unwrap_or_else(|e| format!("Critic A failed: {e}"))`), so a provider outage produces a review that silently reviewed nothing.
- Output is an XML block appended to the transcript. Nothing parses it, nothing counts it, nothing acts on it.
- There is no plan critic: the plan is reviewed only if the user asks.

## 2. Design

### 2.1 Two gates, one schema

```rust
pub struct Finding {
    pub id: String,                  // stable hash of (round, file, line, category, message)
    pub severity: Severity,          // Blocker | Major | Minor | Nit
    pub category: Category,          // Correctness | Security | Regression | Test | Style | Scope
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,             // one sentence, imperative
    pub suggestion: Option<String>,  // a concrete change, not "consider"
    pub confidence: Confidence,      // High | Medium | Low
}
pub struct Verdict { pub round: u32, pub findings: Vec<Finding>, pub model: String,
                     pub tokens: u32, pub stop_reason: StopReason }
```

`StopReason`: `clean`, `round_cap`, `budget_exhausted`, `parse_failed`, `provider_failed`.

The critic returns JSON validated against `agent/critic/schema.json`. One repair attempt: if parsing fails, a second call with the schema and the malformed output; a second failure is `parse_failed`, surfaced by D02, never a silent "no findings".

### 2.2 Triggers

| Setting `agent.critic.mode` | Plan gate | Patch gate |
| --- | --- | --- |
| `off` (default until the user opts in) | no | no |
| `plan` | before the first tool call of a plan | no |
| `patch` | no | after the last write of a turn |
| `both` | yes | yes |

The patch gate now triggers on a diff, not on markup: at least one hunk in a source file, or a changed public surface. Pure prose turns never trigger.

### 2.3 Bounded rounds

1. Round 0: critic sees the plan or the diff plus the task statement and the tool list. It does not see raw tool output (prompt-injection surface).
2. Findings are deduped by `(file, line, category, normalised message)`, sorted by severity.
3. If there are Blockers or Majors, the implementer gets one repair instruction naming at most 8 findings. Repairs go through the normal edit path and permissions (D03); the critic never writes.
4. Round 2 re-runs on the new diff. Rounds stop at 2 by default (`agent.critic.maxRounds`, clamp 1-3), or earlier on `clean`.
5. Cost cap: the critic may spend at most 15 percent of the turn's tokens (`agent.critic.budgetPct`, clamp 5-30). Over budget stops with `budget_exhausted` and keeps the findings already produced.
6. The verdict is written as one `critic.verdict` run event (D08) with round, counts by severity, stop reason, model, and token cost. The transcript gets a compact summary row, not an XML blob.

### 2.4 Model choice

`agent.critic.model` is `same` (default), `cheaper`, or an explicit `provider/model#variant` (D20). `cheaper` picks the lowest-cost model in the same family that supports tools and the context window; if none qualifies, it falls back to `same` and says so in the verdict. `auto` disappears.

### 2.5 UI

A `ReviewPanel` above the composer lists current-round findings with file:line, severity, and two actions: "Fix" (sends one repair instruction) and "Dismiss" (records the id as dismissed for this run, with a reason chip). "Fix remaining" batches up to 8. Dismissals never re-appear in the same run; a new run re-evaluates.

## 3. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/critic/{mod,schema,gate,rounds,parse,model}.rs` | gates, rounds, parsing, model choice |
| `src-tauri/src/agent/commands/adversarial_review.rs` | delete or reduce to a thin caller; no XML |
| `src-tauri/src/agent/prompts/REVIEW_CRITIC.md` | rewrite for JSON output and diff input; keep the adversarial angle |
| `src-tauri/src/agent/commands/streaming.rs` | structured completion with schema retry |
| `features/agent/review/ReviewPanel.tsx` | findings UI |
| `lib/settings/store.ts` | `agent.critic.mode`, `maxRounds`, `budgetPct`, `model` |

## 4. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | schema, parsing, retry, verdict persistence | 2 |
| P1 | patch gate on diffs, plan gate, triggers from run state | 2.5 |
| P2 | bounded repair rounds through the edit path | 2.5 |
| P3 | model selection and cost cap | 1 |
| P4 | review panel, dismiss/fix, tests | 2 |
| | **total** | **10** |

## 5. Acceptance criteria

1. A one-file edit that changes behavior triggers the patch gate; a prose-only turn does not; a markup-only heuristic no longer decides.
2. The critic's response is validated against the schema; a malformed response gets exactly one retry and then `parse_failed`, and the turn reports it.
3. A provider failure during round 1 stops the gate with `provider_failed`; it is not rendered as a clean review.
4. Findings are deduped across rounds by the documented key; a dismissed finding does not return within the run.
5. At most 8 findings enter one repair instruction, and every repair goes through the permission floor.
6. Rounds stop at `maxRounds`, and a run with only Minors after round 0 stops with `clean` or `round_cap` as appropriate.
7. The critic's token spend is recorded and stopping at the budget keeps prior findings.
8. `cheaper` either chooses a qualifying model or falls back to `same` with a note in the verdict; `auto` no longer exists.
9. The verdict event is present for every triggered gate and survives a restart (D08).
10. The full gate passes.

## 6. Traps

- **Do not feed tool output to the critic.** The diff and the task are enough; tool output is attacker-controlled text.
- **Do not let the critiquer be the implementer's own transcript verbatim.** It over-approves its own work; the diff is the artifact under review.
- **Do not loop until clean.** A critic with a model can always invent a nit; the round cap is the feature.
- **Do not parse prose with a regex to recover findings.** Schema or failure.
- **Do not make the critic required for a turn.** It is a gate the user turns on, and its failure never blocks the user's work.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/26-critics-and-review-gates.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D26: Critics for plans and patches, with bounded rounds. Scope: the Finding/Verdict schema, schema-validated critic calls with one retry, plan and patch gates driven by run state, dedupe, bounded repair rounds through the permission floor, the 15 percent budget cap, model selection without `auto`, verdict persistence, and the review panel. Do not change the provider protocol, do not build the diff viewer (D16), and do not let the critic write files.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/26-critics-and-review-gates` from the current `draft/mega-absorb-all` only after dossier 25 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
