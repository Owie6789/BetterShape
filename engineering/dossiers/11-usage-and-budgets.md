# D11: Usage, pricing, and budget controls

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/11-usage-and-budgets`) |
| Issue title | `D11: Usage, pricing, and budget controls` |
| Labels | `port`, `dossier:11`, `area:usage`, `size:L`, `stage:2` |
| Depends on | D07 (composer), D08 (run records, usage events) |
| Blocks | D13, D21 |
| Effort | 17 days |

**Port verdict: TAKE the aggregation and pricing model, RE-DERIVE the data sources, DEFER provider quota ingestion.**

t3 treats usage as a first-class product surface: a `/usage` route, a rate table fetched from LiteLLM with overrides, per-model and per-provider charts, a share bar, cache read and cache write pricing, and a quota panel fed by provider subscription endpoints. BetterShape records token counts and a cost per message and shows a context-window ring. The gap is not measurement, it is accounting.

## 1. Upstream inventory

| file | lines | role |
|---|---:|---|
| `apps/server/src/usage/UsageService.ts` | 1,400+ | orchestration: readers, rate fetch, caches, summary |
| `apps/server/src/usage/usageAggregation.ts` | 329 | `UsageAggregator`, `resolveModelAliases`, categories |
| `apps/server/src/usage/usagePricing.ts` | 305 | rate table, overrides, LiteLLM parsing |
| `apps/server/src/usage/usageTranscriptReader.ts` | 338 | read provider transcript files |
| `apps/server/src/usage/usageScanCache.ts` | 363 | incremental scan cache, pruning |
| `apps/server/src/usage/cliproxyApi.ts` | 377 | alternative source |
| `apps/server/src/usage/UsageLimitSources.ts` | - | subscription quota sources |
| `packages/contracts/src/usage.ts` | 168 | summary, source, fingerprint, version |
| `packages/contracts/src/providerUsageLimits.ts` | - | quota shapes |
| `apps/web/src/components/usage/UsagePage.tsx` | 1,549 | page |
| `apps/web/src/components/usage/UsagePriceOverrides.tsx` | 621 | per-model override editor |
| `apps/web/src/components/usage/UsageProviderChart.tsx` | 527 | chart |
| `apps/web/src/components/chat/ComposerUsageLimits.tsx` | - | limits in composer |
| `apps/web/src/components/chat/UsageLimitRecoveryBanner.tsx` | - | recovery flow |
| `apps/server/src/provider/*UsageLimits*.ts` | - | Claude, Codex, Antigravity quota parsers |

Total about 9,000 lines of upstream usage work, of which roughly 2,500 are genuinely portable.

## 2. Mechanism

### 2.1 Contract

`USAGE_CONTRACT_VERSION` is bumped whenever `UsageSummary` changes incompatibly. The summary carries `sources: UsageSource[]`, and each source has a `fingerprint` (provider, path, volume, mtime), a `status` (`ok | missing | partial | failed`), and records. The fingerprint matters: it lets the client cache and lets the server explain staleness instead of silently showing zero.

### 2.2 Sources and readers

Two reader kinds are registered from built-in drivers:

- `transcripts`: parse provider transcript files (Claude and Codex formats). `transcriptFormats` maps provider to format; `readTranscriptRecords` handles the format.
- `scan`: providers that expose usage through a scan API (for example a local proxy).

`UsageService` constants encode operational care:

```
MTIME_SLACK_MS = 36h          // a session written just before local midnight
MAX_HOURLY_WINDOW_MS = 24h
CACHE_RETENTION_DAYS = 92
TRANSCRIPT_READ_CONCURRENCY = 4
RATES_TTL_MS = 24h
RATES_REFRESH_FLOOR_MS = 60s
```

`LITELLM_RATES_URL` points at the public LiteLLM price file, fetched daily and cached in a JSON file with `fetchedAtMs` plus `document`. A rate refresh is floored at 60 seconds so a UI retry loop cannot hammer GitHub.

### 2.3 Pricing

`ModelRate` has four token rates (input, output, cache read, cache creation) plus `fast` and `ultrafast` variants. LiteLLM also publishes `*_above_272k_tokens`, `*_flex`, and `*_batches` variants; t3 deliberately does not price them because transcripts do not record which tier was used. That is an honest limitation worth copying.

`createOverrideRateTable` converts per-million prices to per-token and fills omitted cache rates with the input rate. The comment explains the alternative: "cached input is priced as plain input rather than as free". Underpricing is the failure mode they chose to avoid.

`UsageModelPriceOverride` is a settings record keyed by trimmed model name, with non-negative finite numbers; tests assert that whitespace keys are trimmed on encode and that invalid values are rejected for both full settings and patches.

### 2.4 Aggregation

`UsageAggregator` accumulates records into categories and providers, applies `resolveModelAliases` so `claude-sonnet-4-5-20250929` and `claude-sonnet-4-5` land in one bucket, and resolves a cost source per record (`provider_reported`, rate table, or override) so the UI can mark estimated costs. `UsageCategoryCost`, `UsageTokenTotals`, and `UsageCostSource` are the output shapes.

### 2.5 Quota panel

`ComposerUsageLimits` reads provider subscription usage (`claudeUsageLimits`, `codexUsageLimits`, `antigravityUsageLimits`) and shows remaining quota per provider. `UsageLimitRecoveryBanner` is the flow when a turn fails because the limit is hit: it can resume after a reset, and `run.usage-limit` style commands carry a recovery request id. In the orchestrator, `usageLimitBlockedRun` prevents draining a queue when the provider session is limit-blocked, which is the queue safety rule from D09.

## 3. BetterShape today

| capability | status | evidence |
|---|---|---|
| per-message tokens | exists: `MessageStats { tokens, input_tokens, output_tokens, cost }` | `agent/models/mod.rs:100-114` |
| per-turn meter | exists in memory: `turn_meter`, `record_turn_usage`, `turn_meter_totals` | `models/mod.rs:767-793` |
| last turn usage | exists: `lib/chat/last-turn-usage.ts` | 60 lines |
| cost per message | field exists but is always `0.0` | `MessageStats.cost`, written as 0.0 in `send_chat.rs:748,807,858,893` |
| cost aggregation | absent | no usage aggregation module |
| pricing table | absent | no model price registry |
| price overrides | absent | - |
| usage page | absent | settings nav has no Usage leaf |
| quotas | absent | no subscription usage |
| budget alerts | absent | - |
| cache-aware pricing | absent | no cache read/write token accounting |

The presence of `cost` on `MessageStats` is misleading. A grep finds the field written as `0.0` in four places and never computed, and `formatMessageUsageRows` in `lib/chat/usage-display.ts` only renders tokens, input, and output. There is no price source to reuse. Build one, and make the ledger the only place that writes a cost.

## 4. Port plan

### Step 1: accounting core (4 days)

New Rust module `src-tauri/src/usage/`:

```
mod pricing;   // rate table, overrides, fallbacks
mod aggregate; // by model, provider, category, period
mod store;     // append-only usage ledger
```

Ledger record: `{ at, conversation_id, turn_id, provider, model, input, output, cache_read, cache_write, cost_usd, cost_source }`. Append on turn completion from the existing `MessageStats` plus the per-turn meter. Store in SQLite (BetterShape already depends on SQLite for the index? if not, a JSONL file is acceptable at this volume). The ledger, not the transcript, is the query surface.

Do **not** port transcript scanning. BetterShape owns its own provider calls, so it can record usage at the source. This removes ~1,200 lines of reader and cache code and removes the entire class of "provider changed its transcript format" bugs.

### Step 2: pricing (3 days)

1. Embed a small static price table for the models BetterShape ships.
2. Add optional remote refresh from the LiteLLM URL with a 24 hour TTL, a 60 second floor, and a cached copy on disk. Guard the fetch behind a setting that defaults to on but can be disabled for offline use.
3. Add per-model overrides in settings with a Zod-equivalent Rust validator: non-negative, finite, trim keys, cache rates default to input rate.
4. Record `cost_source` per turn so the UI can show "estimated" versus "reported".

### Step 3: aggregation API (2 days)

Commands: `usage_summary({ period, group_by, provider?, model? })`, `usage_series({ period, bucket })`, `usage_records({ cursor })`. Return the same conceptual shape as `UsageSummary`: totals, categories, providers, sources with fingerprints and statuses. The fingerprint can be a simple `{ generated_at, ledger_rows }`.

### Step 4: usage page (5 days)

A new settings leaf (or a standalone route) with:

- Period selector: day, week, month, quarter, all. Bind the same period switching to keybindings later (D13 lists `usage.period.*`).
- Total cost, total tokens, split by input/output/cache.
- Stacked chart by provider and model. BetterShape has no chart dependency; use a lightweight SVG chart, not a charting library, to keep bundle cost near zero.
- Table of models with tokens, cost, share, and an override editor.
- Empty state that explains what will appear after the first turn.

### Step 5: budget and alerts (2-3 days)

Add `budget: { monthly_usd: number | null, warn_at: 0.8, hard_stop: bool }`. On turn completion, compute month-to-date; emit a notification at the threshold; if `hard_stop`, block new sends with a clear banner and an override action. Do not silently stop: the user must know why.

### Step 6: quotas (deferred)

Provider subscription quota parsing is provider-specific and brittle. Defer until D19's provider layer exists, and implement it per provider with a capability flag so a missing parser shows "not available" rather than zero.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `usagePricing.test.ts` | cache rate fallbacks, override precedence, LiteLLM variants ignored |
| `usageAggregation.test.ts` | alias resolution, category totals, cost source precedence |
| `settings.test.ts` (usage section) | key trimming, invalid values rejected, patch semantics |
| `UsagePage.refresh.test.tsx` | refresh debounce and error states |
| `UsageService` reader tests | mtime filtering, midnight slack, partial source status |

## 6. Traps

- **A zero cost is not a free turn.** BetterShape writes `0.0` into `MessageStats.cost` unconditionally. Until the ledger ships, any UI that shows a cost is lying. Hide it rather than show zero.
- **Zero is not missing.** A missing source must show as missing, not as $0.00. Copy the `UsageSourceStatus` union.
- **Cost is estimated unless reported.** Mixing estimated and reported costs in one total without a marker produces support tickets.
- **Cache tokens matter.** On long sessions, cache read is often 80 percent of input tokens. Ignoring it overstates cost by multiples.
- **Do not re-scan transcripts you already own.** BetterShape is the writer of its own usage data; scanning is a workaround for tools that are not.
- **Time zones.** "Today" means local midnight. t3's 36 hour mtime slack exists for this reason; a ledger with UTC timestamps avoids the class of bug entirely but the UI must bucket in local time.

## 7. Effort

| step | days |
|---|---:|
| accounting core and ledger | 4 |
| pricing | 3 |
| aggregation API | 2 |
| usage page | 5 |
| budget and alerts | 3 |
| quotas (deferred) | 5 |
| **total now** | **17** |

## 8. Acceptance criteria

1. Every completed turn produces exactly one ledger row with token counts that match the provider's reported usage.
2. Month-to-date cost recomputes identically after a restart.
3. A model with an override uses the override and marks the cost source.
4. Cache read and cache write tokens are priced at their own rates when known, and at the input rate when not.
5. A missing price shows "unknown" and excludes the turn from the total rather than counting it as zero, with the excluded count visible.
6. The budget threshold fires once per period, not once per turn.
7. The usage page loads in under 200 ms for 100,000 ledger rows (index on time and model).

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/11-usage-and-budgets.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D11: Usage, pricing, and budget controls. Scope: an append-only usage ledger, pricing with per-model overrides, a usage page, and budgets, with unknown cost kept at 0.0 rather than guessed. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/11-usage-and-budgets` from the current `draft/mega-absorb-all` only after dossier 10 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
