# D19: Providers, instances, models, and handoff

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/19-providers-and-models`) |
| Roadmap source | mausCode step 05 (issue #7) |
| Issue title | `D19: Providers, instances, models, and handoff` |
| Labels | `port`, `dossier:19`, `area:agent`, `size:M`, `stage:4` |
| Depends on | D01-B5 |
| Blocks | none |
| Effort | 13 days |

**Port verdict: TAKE the instance and capability model. TAKE the model manifest and alias resolution. DO NOT port the CLI-process provider packages. DEFER provider switching until handoff exists.**

Provider work is where a port can quietly consume a year. t3 has 11 provider packages and roughly 170,000 lines of provider-adjacent code, most of it plumbing for CLI tools, ACP, and vendor-specific auth. BetterShape is a BYOK HTTP client with three native provider kinds and a local model catalog. The right port is the **shape** of the provider layer, not its implementations.

## 1. The two systems

### t3code

| layer | files | lines | role |
|---|---:|---:|---|
| `packages/provider-core` | 66 | 11,035 | driver contract, adapter contract, catalogs, auth, usage, failures, maintenance, instances |
| `apps/server/src/provider` | 130+ | 33,062 | concrete Claude, Codex, Grok, Antigravity, OpenCode providers; auth; installation; model catalogs |
| `packages/provider-acp` | 18 | 16,961 | Agent Client Protocol bridge |
| `packages/provider-acp-registry` | 18 | 8,248 | ACP provider registry |
| `packages/effect-acp` | 18 | 27,406 | ACP protocol in Effect |
| `packages/effect-codex-app-server` | 16 | 61,550 | Codex app-server protocol |
| `packages/provider-cursor` | 38 | 10,665 | Cursor SDK adapter |
| `packages/provider-opencode` | 39 | 19,950 | OpenCode adapter |
| `packages/provider-pi` | 22 | 11,365 | Pi adapter |
| `packages/provider-muse` | 21 | 6,690 | Muse adapter |
| `packages/provider-grok` | 22 | 7,227 | Grok adapter |

### BetterShape

| layer | files | role |
|---|---|---|
| `src-tauri/src/core/ai_providers.rs` | 1 | `ProviderKind::{OpenAi, Anthropic, Google}`, `ProviderEntry` with stable id, label, base URL, key |
| `src-tauri/src/agent/model_router.rs` | 1 | family classification (Anthropic, OpenAI, DeepSeek, Google, xAI, Z.AI, Qwen, Other), `auto` resolution, `apply_patch` vs edit tool selection |
| `src-tauri/src/agent/commands/provider_wire.rs` | 1 | per-provider request and stream shaping, thinking support |
| `lib/ai/providers.ts`, `sync.ts`, `vault.ts` | 3 | frontend provider sync and key vault |
| `lib/catalog/*` | 2 | local model catalog, no server catalog |

The BetterShape model is honest and simple: model ids are `provider/model`, `auto` resolves to the configured default, and the family decides tool shape. That simplicity is an asset; do not trade it for a 60,000-line protocol bridge.

## 2. What is worth taking

### 2.1 The driver/instance contract

From `packages/provider-core/src/server/driver.ts`:

```
ProviderDriver<Config> {
  driverKind
  metadata: { displayName, supportsMultipleInstances?, hasDefaultInstance? }
  configSchema: Codec<Config, unknown>   // Codec, not Schema, on purpose
  defaultConfig(): Config
  create(input) -> ProviderInstance
  usage?: ProviderUsageReader
}
```

Three rules encoded here:

1. **No per-driver Context tags.** "Tags are singleton-per-runtime and we need many instances of the same driver." BetterShape's `ProviderEntry` is already instance-like, but the runtime treats `ProviderKind` as the identity in places. Move identity to `instance_id` and keep `kind` for wire behavior.
2. **Instances share no mutable state.** Explicit contract on `create`. Test it: two instances with different configs must not share a client, a token cache, or a rate limiter.
3. **Drivers must not throw defects.** Failures become unavailable snapshots. A provider that is misconfigured still renders; it does not crash the settings page.

`ProviderInstance` carries the snapshot, an optional per-cwd snapshot, model refresh, cache invalidation, reset-credit consumption, the orchestration adapter, text generation, auth controller, and optional ACP session management. For BetterShape, the useful subset is: snapshot, model refresh, auth controller, and the orchestration adapter.

### 2.2 Model manifest and aliases

t3 keeps a `model-manifest.json` plus per-provider catalogs (`ClaudeModelCatalog`, `codexModelCatalog`, `ModelManifest`). `resolveModelAliases` collapses dated and undated ids into one bucket for usage (D11), and `createModelSelection`/`normalizeModelSlug` do the same for sending.

BetterShape's `lib/catalog` is a local list. The port target is a manifest with, per model:

```
{ id, aliases[], family, context_window, max_output,
  supports: { tools, images, thinking, cache },
  options: [{ id, values[], default }] }
```

That single structure unlocks: context meter accuracy, effort/thinking controls, usage pricing keys, model picker grouping, and capability-aware validation before send. Today these are scattered across `model_router`, `provider_wire`, and UI conditionals.

### 2.3 Capability probing

`ClaudeCapabilitiesProbe`, `providerCompatibility.ts`, `providerStatusCache.ts`, `providerInstallation.ts`, `providerMaintenanceRunner.ts` solve a problem BetterShape has in a milder form: the provider's available models and features change, and the UI must not offer options that will fail.

For an HTTP provider the probe is cheaper: a models endpoint plus a tiny test completion. Cache the result with a TTL and an explicit "last checked" timestamp. Do not probe on every settings render.

### 2.4 Credentials

`ProviderCredentialStore` and `ProviderAuthService` separate secret storage from provider config. BetterShape has `lib/ai/vault.ts` on the frontend and provider entries in settings on the Rust side. The port target: secrets in the OS keychain (via the `keyring` crate) keyed by `instance_id`, with the settings file holding only a reference. Never write a key into a JSON settings file, and never send one to the frontend except when the user is editing it.

### 2.5 Provider switching and handoff

t3's `ProviderSwitchService`, `ProviderSelectionTransition`, and `ContextHandoffService` make switching providers mid-thread a first-class operation with explicit strategies:

```
native_fork      // provider can fork/resume its own conversation
portable_context // build a bounded transcript summary and start fresh
delta_context    // send only the delta since a known point
```

BetterShape currently switches by changing the model selection; the provider conversation restarts with whatever the harness sends. That works because the harness owns the transcript, but it loses provider-native state (for example Anthropic prompt caching and any provider-side tool state).

Port the handoff **concept** now: when the model changes across providers mid-conversation, write a `context_handoff` record with the strategy, the token budget, and what was truncated. Even without native forks, the record makes the behavior legible and testable.

## 3. What not to port

| package | reason |
|---|---|
| `effect-acp`, `provider-acp`, `provider-acp-registry` | BetterShape talks HTTP APIs directly; ACP is for wrapping external agent CLIs |
| `effect-codex-app-server` (61,550) | protocol bridge for the Codex CLI; not applicable |
| `provider-cursor`, `provider-pi`, `provider-muse`, `provider-opencode` | each is a vendor-specific CLI/SDK bridge with its own auth and process lifecycle |
| `provider-grok` | the HTTP path can be added to BetterShape as an OpenAI-compatible provider in days, without the package |
| installation and maintenance runners | BetterShape does not install provider binaries |

Porting any of these would be an order of magnitude more work than their feature value to a BYOK desktop app.

## 4. Port plan

### Step 1: instance identity (3 days)

1. Add `instance_id` to `ProviderEntry` (migrate existing entries by deriving `kind + index`).
2. Thread `instance_id` through the model selection: `{ instance_id, model_id, options }` instead of `provider/model` strings parsed at each layer. Keep the string form for display and backward compatibility.
3. Audit every `ProviderKind` match in the runtime and move wire behavior behind a `provider_driver(kind)` lookup that takes the entry, not the kind alone.

### Step 2: model manifest (4 days)

1. A Rust `models.json` (embedded, user-overridable) with the fields above.
2. Resolution: alias to canonical id, family from manifest, fall back to `model_router` classification for unknown ids.
3. Capability validation before send: images to a text-only model produce a clear error, not a provider 400.
4. Context window per model feeds the existing usage ring (D11).

### Step 3: secrets (3 days)

1. Move API keys to the OS keychain via `keyring`.
2. Settings store holds `{ instance_id, kind, label, base_url, key_ref, enabled, options }`.
3. A "test connection" action that probes the models endpoint and stores the result with a timestamp.
4. Migration: read existing plaintext keys, write them to the keychain, then scrub the settings file. Refuse to run if the keychain is unavailable rather than silently keeping plaintext.

### Step 4: handoff record (3 days)

1. On a cross-provider model change in a live conversation, create a `context_handoff` record: `{ from_instance, to_instance, strategy, budget, truncated_items, created_at }`.
2. Build the portable context from the harness history with an explicit character budget (start at 40k) and keep the most recent turns plus a summary of older ones.
3. Surface it in the transcript as a small system marker: "Switched from Claude to GPT-5.2; 12 older messages summarized."
4. Never claim native continuation unless the provider actually supports it.

### Step 5: provider additions (optional, 2-3 days each)

Add xAI, DeepSeek, Qwen, and Z.AI as OpenAI-compatible entries with correct base URLs and model manifests. These are configuration plus a manifest row, not new packages. OpenRouter already fits this path.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `ProviderInstanceRegistry.test.ts` | instance isolation, config validation |
| `ModelManifest.test.ts` | alias resolution, capability defaults |
| `providerCompatibility.test.ts` | option validation before send |
| `ProviderCredentialStore.test.ts` | secret lifecycle, no plaintext fallback |
| `ContextHandoffService.test.ts` | budget, truncation, strategy selection |
| `ProviderSwitchService.test.ts` | switch refusal when unsupported |

## 5.1 Roadmap row (mausCode step 05)

One default-model table, `agent/models/defaults.rs` with a generated TypeScript mirror, replaces every scattered default literal. Resolution order is explicit: user setting, agent setting, project setting, table default. BetterShape has no Codex process, so the table covers the providers it actually ships. The acceptance criterion is mechanical: `grep` for a model id string outside the table and the provider manifests returns nothing.

## 5.2 Roadmap row (mausCode step 28)

MCP gets one source of truth. Server definitions live in the D01 store with `mcp_servers` and a `mcp_secrets` reference table; each provider config is a projection written by a `ProviderWriter` that regenerates only app-owned entries and preserves unknown user keys. Provider OAuth tokens stay in D04's vault and are referenced by id, never by value. Two legacy provider-specific MCP procedures collapse into one router with thin deprecated aliases for one release. Acceptance: key preservation, atomic write failure, ambient read-only entries, and secret resolution at spawn each have a test.


## 6. Traps

- **Do not unify provider wire formats behind an abstraction that hides the differences.** Anthropic thinking blocks, OpenAI reasoning tokens, and Google function calls do not map 1:1. Keep per-kind request shaping; share the lifecycle.
- **Secrets leak through logs.** Scrub headers and base64 payloads in every error path. BetterShape already has a security command allowlist; add a redaction helper for provider errors.
- **Model catalogs go stale.** Treat the manifest as a default, allow a refresh, and show the source and date.
- **`auto` must stay honest.** If it resolves to a model that cannot handle the current input (images, tools), say so before sending.
- **Handoff is lossy.** If truncation happens, the record must say so and the UI must show it.

## 7. Effort

| step | days |
|---|---:|
| instance identity | 3 |
| model manifest | 4 |
| secrets | 3 |
| handoff record | 3 |
| provider additions (optional) | 2-3 each |
| **total core** | **13** |

## 8. Acceptance criteria

1. Two instances of the same provider kind with different base URLs and keys do not share state, proven by a test.
2. A model with no image support rejects an image attachment before the provider call, with an actionable message.
3. API keys never appear in the settings JSON, logs, or the frontend after save.
4. Switching from one provider to another mid-conversation creates a visible handoff marker and does not silently lose messages.
5. A model alias resolves to one canonical id in usage, pricing, and the picker.
6. The context meter uses the manifest's context window for the selected model.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/19-providers-and-models.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D19: Providers, instances, models, and handoff. Scope: provider instance identity, a models.json manifest with alias resolution, secrets in the OS keychain, visible handoff records, the single default-model table in section 5.1, and the MCP source-of-truth row in section 5.2. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/19-providers-and-models` from the current `draft/mega-absorb-all` only after dossier 18 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
