# D20: Model variants, reasoning effort, and verbosity

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/20-model-variants-and-verbosity`) |
| Roadmap source | none (opencode, not mausCode) |
| Issue title | `D20: Model variants, reasoning effort, and verbosity` |
| Labels | `port`, `dossier:20`, `area:agent`, `size:M`, `stage:4` |
| Depends on | D19 (model manifest), D01-B5 (settings versioning) |
| Blocks | none |
| Effort | 15 days |

**Port verdict: TAKE the model, not the config file. OpenCode's `variants` array, capability-driven generation, and verbosity default are the right shape. BetterShape already sends a reasoning effort on every request; what it lacks is a named, inspectable, per-model overlay that a user can pick, that an agent can pin, and that fails loudly when it does not exist.**

Status: ready to implement. The design below is complete; the prompt at the end is the handoff.

## 1. What was asked

Bring over OpenCode v2's "verbosity variance" option. In OpenCode that is one feature with three parts:

1. **Variants**: named, per-model option bundles (`fast`, `deep`, `high`, `max`) that carry `settings`, `headers`, and `body` overlays.
2. **Capability-driven generation**: the model catalog declares its reasoning controls (`effort`, `toggle`, `budget`), and the app generates the sensible variants for the provider protocol.
3. **Verbosity**: `textVerbosity` (`low`, `medium`, `high`) for the OpenAI Responses family, defaulted to `low` unless configuration or the chosen variant says otherwise.

BetterShape has a single unexplained effort value threaded through `send_chat` into provider-specific request bodies. It works, it is invisible, and it cannot express "use low verbosity with high reasoning" or "this agent always runs at max".

## 2. What OpenCode actually does

Source: `anomalyco/opencode` at `8c173a8f3805d8e749d44311054b07e37a1b2ce1` (2026-10-17).

### 2.1 The data model

`packages/schema/src/model.ts`:

```ts
const Overlays = {
  settings: Settings.optional,
  headers: Record<string, string>.optional,
  body: Record<string, unknown>.optional,
}
const Variant = Struct({ id: VariantID, ...Overlays })
const Info = Struct({
  id, modelID, providerID, canonical?, family?, name,
  compatibility?, package?,
  ...Overlays,                  // model-level defaults
  capabilities: { tools, input, output, temperature? },
  variants: Variant[],
  cost, status, enabled, limit,
})
```

`packages/schema/src/config/provider.ts` adds what the user may write:

```ts
class Model {
  modelID?, family?, name?, releaseDate?, compatibility?, package?
  settings?, headers?, body?
  capabilities?: { tools?, input?, output?, temperature?,
                   reasoning?: { supported: false } | {
                     supported: true, toggle?, effort?: string[], budget?: { min?, max? } } }
  variants?: { id, settings?, headers?, body? }[]
  cost?, disabled?, limit?
}
```

Three facts matter more than the field list:

- A variant is **not** a model. It is an overlay on the same wire model, selected by `provider/model#variant`.
- The same overlay shape exists at provider, model, and variant level, and they merge.
- A model reference with an unknown variant is a **resolution error**, not a silent fallback to the base model. `packages/app/src/providers/models/variant.ts` normalizes an unavailable selection to `undefined` rather than picking a neighbor.

### 2.2 Resolution order

`packages/app/src/providers/models/variant.ts` and `packages/tui/src/mini/variant.shared.ts`:

```
explicit selection for this session
  > agent/command configured variant      (only when its model matches)
  > saved preference for this model       ("default" is a real, stored value)
  > model default                         (no variant)
```

`cycleModelVariant` walks the named variants and then returns to "default"; it never invents a value. `resolveVariant` drops a saved value the provider no longer offers, so a model catalog change cannot apply a stale effort.

### 2.3 Generated variants

`packages/core/src/variant.ts` (690 lines) defines a `Protocol` per provider package. The inputs are `Model.Info` and a `Support` union:

```ts
type Support =
  | { type: "effort"; values?: string[] }
  | { type: "toggle" }
  | { type: "budget_tokens"; min?: number; max?: number }
```

Representative outputs:

| Protocol | Default variants |
| --- | --- |
| OpenAI Responses | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, each setting `reasoningEffort`, `reasoningSummary: "auto"`, `include: ["reasoning.encrypted_content"]` |
| OpenAI Chat | `low`, `medium`, `high` with `reasoningEffort` |
| Anthropic Messages | `none`, plus `low..max`; pre-4.6 models get `budget_tokens` with a 16k manual budget; 4.6+ use adaptive thinking with `effort` |
| Google Gemini | `thinkingLevel` + `thinkingSummaries: "auto"` |
| DeepSeek | `low`, `high`, `max`; `none` disables via `body.thinking.type` |
| NVIDIA / vLLM templates | toggles map to `chat_template_kwargs` (`thinking`, `enable_thinking`) |
| Z.ai / GLM | `high`, `max` with `thinking.clear_thinking: false` |
| Bedrock Converse | `budget_tokens` mapped through `additionalModelRequestFields` |

Budget variants clamp: `maximum = min(support.max, model.limit.output - 1)` and `high = clamp(floor((max+1)/2), min, max)`, with per-family ceilings (Anthropic 32,000; Alibaba 64,000). This is the detail that prevents a "max" variant from exceeding the output limit and failing the request.

Custom variants are applied **on top of** generated ones; an explicit variant with the same id replaces the generated one. That is the rule that lets a user redefine `high` without losing `low`.

### 2.4 Merge rules

From the v2 docs and `provider.ts`:

- Provider values first, model values second, variant last.
- Nested `settings` and `body` objects merge; later arrays and scalars replace.
- Header names match case-insensitively.
- Unknown keys in `settings` are passed through to the provider package; OpenCode does not validate them against a closed list.

### 2.5 Verbosity

`packages/core/src/plugin/verbosity.ts` is a small plugin with a large lesson:

```ts
if (event.options.textVerbosity !== undefined) return
const model = yield* models.get(...)
const id = openAIModelID(model)
if (!id || !supportsVerbosity(id)) return
if (model.settings?.textVerbosity !== undefined) return
const variant = model.variants.find(v => v.id === event.model.variant)
if (variant?.settings?.textVerbosity !== undefined) return
event.options.textVerbosity = "low"
```

- It runs on four hooks: `context`, `compaction`, `generate`, `title`.
- It only applies to models it recognizes (`gpt-5`, `gpt-5.1` through `gpt-5.6`, `gpt-6`; not `-chat`, `-image`, not unknown minors).
- It resolves aliases and gateways: direct OpenAI, Azure, Bedrock mantle, Cloudflare/Vercel gateways strip their prefixes.
- `null` is a real configuration value meaning "leave it unset", which is how a user opts out.
- The default is `low` because long answers are the common complaint; the model is still asked to reason at whatever effort was chosen.

### 2.6 Persistence and UI

- TUI: last-used variant per model in `~/.local/state/opencode/model.json`; `ctrl+t` cycles (`config/keybind.ts:176`); the footer shows the active variant next to the cycle action, and the variant dialog lists them with `default` as an explicit choice.
- App: the model picker writes a session-scoped selection; agent definitions can pin `model: "anthropic/..."` plus `variant`; v2 merges them into `provider/model#variant`.
- Docs: variants come from catalog metadata; an unknown variant is a model-resolution error.

## 3. What BetterShape has today

Verified at `289b134`.

### 3.1 The effort path

- `SendChatArgs.reasoning_effort: Option<String>` (`send_chat.rs:48`), normalized at lines 84-90.
- `streaming.rs` documents the UI vocabulary: `low | high | ultra | max | super` (`streaming.rs:115`). `super` is a UI flourish, not a provider value.
- `openrouter_effort()` (lines 1301-1312) collapses that vocabulary to `low | high | xhigh`.
- `reasoning_config_for_model()` (lines 1315-1355) branches by model family:
  - Gemini: `max_tokens` 4,096 / 16,384 / 24,576 / 32,768.
  - Anthropic: always `high` for ultra and max, `low` otherwise.
  - GPT-5: `effort` as-is.
  - o1/o3/o4: `effort`.
  - DeepSeek/R1: `low` or `high`.
  - Everything else: `effort` only when high or xhigh.
- `send_chat.rs` writes `reasoningEffort` into the request body at three places (753, 812, 863, 898).

This is a hardcoded protocol table embedded in the transport layer. It cannot be inspected before a request, cannot be overridden per model, and has no verbosity concept at all.

### 3.2 The UI

- `features/chat/ui/composer/thinking-bar.tsx` plus `reasoning-effort.ts`: a draggable slider, blue until High, particles at High, rainbow at Super. It is a genuinely good control and the user should keep it.
- The slider's value is a `ReasoningEffort` union, stored per conversation, sent with the turn.
- No model picker shows what the effort actually maps to for the selected model.
- Agents (subagents, workflows) have a model setting but no variant setting.

### 3.3 Provider configuration

`src-tauri/src/core/ai_providers.rs` holds provider entries (kind, key, base URL, headers, model list). Models are strings. There is no per-model settings object, no capabilities, and no catalog metadata.

So the port is not "add a field". It is "introduce a model descriptor and route every request through it", which is why D19 (model manifest) comes first.

## 4. Design

### 4.1 Types

New Rust module `src-tauri/src/agent/models/variants.rs` (or an extension of the D19 manifest):

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelSettings(pub serde_json::Map<String, Value>);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Variant {
    pub id: String,
    #[serde(default)] pub settings: Option<Value>,
    #[serde(default)] pub headers: Option<BTreeMap<String, String>>,
    #[serde(default)] pub body: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReasoningSupport {
    pub supported: bool,
    #[serde(default)] pub toggle: bool,
    #[serde(default)] pub effort: Option<Vec<String>>,   // "default" is filtered out
    #[serde(default)] pub budget: Option<Budget>,        // min, max
}

pub struct ModelDescriptor {
    pub provider_id: String,
    pub model_id: String,          // wire id
    pub catalog_id: String,        // selectable id (alias support from D19)
    pub settings: Option<Value>,
    pub headers: Option<BTreeMap<String, String>>,
    pub body: Option<Value>,
    pub capabilities: ModelCapabilities,   // tools, input, output, temperature
    pub reasoning: ReasoningSupport,
    pub variants: Vec<Variant>,            // generated + configured, deduped by id
    pub limit: ModelLimit,
}
```

The `Variant` shape matches OpenCode field for field, because that is what makes custom JSON portable and the semantics documented.

### 4.2 Generation

`variants.rs` gets one function per protocol family that BetterShape actually speaks. This is deliberately smaller than OpenCode's 60-package table: BetterShape supports OpenRouter plus native OpenAI, Anthropic, Gemini, xAI, DeepSeek, Groq, Mistral, and OpenAI-compatible base URLs.

| Family | Support | Generated ids | Overlay |
| --- | --- | --- | --- |
| openai.responses | effort `none,minimal,low,medium,high,xhigh` | same | `{reasoningEffort, reasoningSummary:"auto", include:["reasoning.encrypted_content"]}` |
| openai.chat | effort `low,medium,high` | same | `{reasoningEffort}` |
| anthropic.messages | effort `low..max` for 4.6+; budget for older | `none,low,medium,high,xhigh,max` or `none,high,max` | adaptive `{thinking:{type:"adaptive", effort}}` or `{thinking:{type:"enabled", budgetTokens}}` |
| gemini | effort `low,medium,high` | same | `{thinkingConfig:{includeThoughts:true, thinkingLevel}}` and budget for older |
| deepseek | effort `low,high,max` | same plus `none` | `{thinking:{type:enabled-or-disabled}, reasoningEffort}` |
| xai / groq / mistral / openrouter | effort `low,high` | `low,high,max` where supported | `{reasoningEffort}` |
| openai-compatible | effort `low,medium,high` | same | `{reasoningEffort}`; if the provider declares a template, `body.chat_template_kwargs` |

Rules:

- If the catalog declares `reasoning.supported = false`, no variants are generated, and the UI says "this model has no reasoning controls" rather than showing a dead slider.
- If effort values are declared, use them verbatim (minus `default`).
- If only `budget` is declared, generate `high` and `max` from the clamp formula, never exceeding `limit.output - 1`.
- Configured variants are merged after generation; same id replaces, new id appends, order is generated order then configured order.
- Every generated variant carries a `source` field in memory (`generated` | `configured`) so the UI can say which ones the user owns and a reset can restore the original.

### 4.3 Request application

One function, one place:

```rust
fn apply_variant(
    provider: &ProviderEntry,
    model: &ModelDescriptor,
    variant: Option<&VariantId>,
    req: &mut ChatRequest,
) -> Result<(), VariantError>
```

Order: provider overlays, model overlays, variant overlays. Merge nested objects; replace arrays and scalars; header names case-insensitive; `null` removes a key (this is how `textVerbosity: null` opts out). Then the reasoning adapter runs, then the transport serializes.

`reasoning_config_for_model()` is deleted. Its table becomes data, and every branch becomes a test case with a stored expected body.

### 4.4 Verbosity

- Add `textVerbosity` as a first-class overlay key, not a bespoke setting.
- Default to `low` for recognized OpenAI Responses models, exactly like the plugin, with the same exclusions (`-chat`, `-image`, unknown minor versions).
- Precedence: explicit request option > variant `settings.textVerbosity` (including `null`) > model `settings.textVerbosity` > generated default.
- The UI exposes a three-position control (Low, Medium, High) only when the selected model supports verbosity. Otherwise the control is absent, not disabled.
- Applying verbosity to non-OpenAI models is a no-op, and the UI must not pretend otherwise.

### 4.5 Selection and persistence

Precedence, adapted to BetterShape's multi-chat window:

```
per-turn explicit choice (composer)
  > per-conversation saved variant
  > agent/subagent configured variant (only when its model matches)
  > per-model saved preference
  > none (model default)
```

- Storage: `settings.models.variants: Record<"provider/model", string | "default">` for the saved preference, plus `conversation.variant` in the conversation metadata for the per-chat value. "default" is stored explicitly so it can override an agent's pin.
- `cycling` the control walks named variants then returns to default, matching OpenCode. The existing slider keeps working: dragging maps to the nearest named variant, and the label under the thumb shows the variant id.
- The model menu shows `gpt-5.2 · high` and a submenu listing each variant with its one-line effect ("low: fastest, least reasoning"). The submenu also offers "Edit variants..." which opens the model's JSON in Settings.

### 4.6 Failure semantics

- An unknown variant in a conversation (model catalog changed under it) resolves to none and writes a one-line notice into the transcript on the next send: "The variant 'high' is no longer offered for this model. Using the model default." It does not block the turn.
- An unknown variant in configuration is a load error with the file, line, and valid ids. It does not silently drop the whole model.
- A variant that produces an invalid body (for example a budget above the limit) fails validation at load time, not at request time.
- No silent provider fallback: if the overlay cannot be applied to the selected provider, the turn fails with a typed error the UI can show.

### 4.7 UI detail

- Composer: keep the current bar. Add a small variant chip to its right (`high`, `max`, `default`), clickable, with a keyboard cycle (`Cmd+Shift+.`).
- Settings > Agents > Models: per-model variant list, editable as JSON with a form fallback for the common fields (`reasoningEffort`, `textVerbosity`, `thinking`), reset to generated.
- Subagents and workflows: a variant field next to the model picker, stored as `model#variant`.
- No variant badge in the transcript; D17's thinking row stays about the thought, not the dial.

## 5. Files

New:

- `src-tauri/src/agent/models/variants.rs` (types, generation, merge, validation)
- `src-tauri/src/agent/models/variants_tests.rs` or inline tests with fixtures per family
- `features/chat/ui/composer/variant-chip.tsx`
- `features/settings/ui/models/variants-editor.tsx`

Modified:

- `src-tauri/src/agent/models/mod.rs`: `ModelDescriptor` becomes the request input.
- `src-tauri/src/agent/commands/streaming.rs`: delete `openrouter_effort` and `reasoning_config_for_model`; consume applied overlays.
- `src-tauri/src/agent/commands/send_chat.rs`: accept `variant` and keep `reasoning_effort` as a compatibility alias that maps to the nearest variant for one release.
- `src-tauri/src/core/ai_providers.rs`: parse per-model settings, capabilities, variants.
- `features/chat/ui/composer/thinking-bar.tsx` and `reasoning-effort.ts`: map to variants, keep the visual language.
- `features/chat/lib/use-chat-session.ts`: persist the per-conversation variant.
- `lib/settings/store.ts`: add the `models.variants` map under the D01-B5 versioned settings.

## 6. Port plan

### V0 - model descriptor and schema (3d)

- Types, parsing, validation, and the settings merge with tests (nested merge, array replace, header case, null removal).
- Load the existing provider config into descriptors without changing behavior. The acceptance gate for this stage is "no wire change".

### V1 - generation per family (4d)

- Implement the seven families with table-driven tests.
- Budget clamps, model-family detection (`claude-4-5` vs `4-6`, `gpt-5.x`, `o1/o3/o4`, `gemini`), alias handling.
- Golden request-body tests captured from the current `reasoning_config_for_model` behavior, so the port cannot regress effort silently.

### V2 - request application and verbosity (3d)

- `apply_variant`, the verbosity default, and deletion of the old branches.
- A test that every model in the fixture catalog either applies or explicitly refuses an overlay.

### V3 - UI and persistence (4d)

- Variant chip, model menu submenu, settings editor, per-chat and per-model persistence, agent pinning, cycle shortcut.
- Slider mapping and the "no reasoning" state.

### V4 - migration and docs (1d)

- Map saved `reasoning_effort` values to variants (`low→low`, `high→high`, `ultra→high`, `max→max`, `super→max`).
- Document the variant JSON, the precedence order, and the family table in `docs/` and `DESIGN.md` where the composer is described.

Total 15 days.

## 7. Acceptance criteria

- Selecting `provider/model#high` sends exactly the overlay the table specifies, verified by a request-body snapshot for every family.
- A model with no reasoning support shows no slider and no variant chip; it never sends a reasoning field.
- `textVerbosity` defaults to `low` for supported OpenAI models, can be set to `medium`/`high` per model or variant, and `null` prevents the field entirely.
- A variant's `body` and `headers` reach the request; nested objects merge and arrays replace.
- An unknown variant in a conversation degrades to default with a visible notice; an unknown variant in settings fails to load with the valid ids listed.
- Cycling the control walks named variants then default, and the slider's label matches the active variant.
- Per-conversation variants survive app restart; changing a model clears a variant that the new model does not offer.
- Deleting `reasoning_config_for_model` leaves no behavior change in the captured golden tests.
- `npm run test:all` and `cargo test` cover the merge, generation, and failure paths.

## 8. Traps

- **Do not key variants by effort alone.** Providers disagree about effort, budget, and toggle; a variant is an arbitrary overlay, and modeling it as an enum forces another hardcoded table later.
- **Do not let the UI invent variants.** The list comes from generation plus configuration; a free-text effort box produces 400s that look like provider outages.
- **Do not fall back silently.** OpenCode normalizes an unavailable variant to "default" and says so; a silent fallback makes cost and latency unexplainable.
- **Do not apply verbosity to models that ignore it.** Sending `textVerbosity` to Anthropic is harmless in some proxies and a 400 in others.
- **Do not exceed the output limit with a budget.** The clamp is the difference between a working `max` and a failed turn.
- **Do not remove the slider's personality.** The particles and rainbow are a deliberate product choice; the variant system is underneath it, not a replacement for it.
- **Do not store variants in localStorage.** They belong to the settings file with the rest of provider config, or a second window will disagree.

## 9. Effort

| Stage | Days |
| --- | ---: |
| V0 descriptor and schema | 3 |
| V1 generation | 4 |
| V2 request application and verbosity | 3 |
| V3 UI and persistence | 4 |
| V4 migration and docs | 1 |
| **Total** | **15** |

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/20-model-variants-and-verbosity.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D20: Model variants, reasoning effort, and verbosity. Scope: a model descriptor with a variants array, capability-driven variant generation per provider family, provider-model-variant overlay merging, the textVerbosity default with an explicit opt-out, per-conversation and per-model persistence, agent pinning, and a variant chip that keeps the existing thinking slider. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/20-model-variants-and-verbosity` from the current `draft/mega-absorb-all` only after dossier 19 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
