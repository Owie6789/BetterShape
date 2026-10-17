# D05: Plugin host, manifests, capabilities, and the event bus

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/05-plugin-host`) |
| Issue title | `D05: Plugin host, manifests, capabilities, and the event bus` |
| Labels | `port`, `dossier:05`, `area:core`, `size:XL`, `stage:1` |
| Depends on | D01 (store, receipts, turn coordinator), D02 (typed failures), D03 (permission floor), D04 (secrets vault) |
| Blocks | D06 (session portability), D27 (governed research), D33 (remote backends as plugins) |
| Effort | 26 days |

**Port verdict: BUILD. opencode v2 has the most complete plugin model of the three upstreams, but it is an in-process Bun module system with full ambient authority. BetterShape is a Rust core with a webview and an agent that can already write files and run commands. Copying a dynamic module loader would hand every third-party plugin the same authority as the agent, with none of the per-action review the app already applies to tools.**

Port the *shape*: a manifest with an id and an API version, declared capabilities, a per-capability permission grant, a lifecycle with cleanup, domain registries that plugins extend, and one ordered event stream. Do not port the npm-at-startup install, the Bun shell, or unversioned hook keys.

## 1. What exists today

- 268 Tauri commands are registered by hand in `src-tauri/src/lib.rs:204`. The command list is the entire extension surface, and every addition is a core change.
- Agent tools are a closed Rust match: `agent/tools/dispatch/mod.rs:141` dispatches by name against roughly 40 built-ins. `TRUST_GATED_TOOLS` at `:26` hardcodes 21 names that need workspace trust. There is no registration API.
- There are two incompatible uses of the word "plugin". `lib/plugins/api.ts:11` and `agent/tools/plugins.rs` are a Composio client for third-party SaaS actions. The settings leaf `plugins` (`features/settings/ui/shared/nav.ts:64`) is that client. This dossier keeps the Composio feature and renames it **Integrations** in the UI, so "plugin" means one thing.
- No runtime dependency can host a foreign plugin: 52 entries in `src-tauri/Cargo.toml`, no `wasmtime`, `rquickjs`, `mlua`, or `deno_core`.
- Events are emitted ad hoc with `app.emit("agent-...")` from dozens of call sites. Payloads are free-form JSON, names are inconsistent (`agent-browse`, `agent-stream`, `chat_renamed`), and nothing replays.
- Credentials live in two keyring namespaces (`bettershape-ai`, `bettershape-mcp-oauth`) and in the settings object. D04 unifies them.

## 2. What opencode v2 actually gives us

| Idea | opencode v2 | What we take |
| --- | --- | --- |
| Identity | `Plugin.define({ id, setup })`, stable id scopes storage and diagnostics | a manifest `id` in reverse-DNS form, immutable for the plugin's life |
| Lifecycle | `setup(ctx)` returns a cleanup function; registrations auto-dispose | `setup` returns `dispose`; every registration has a handle |
| Extension | domain transforms (`ctx.provider.transform`, `ctx.tool.transform`) replay in registration order | ordered transforms over a small, named set of registries |
| Hooks | `ctx.tool.hook("execute.before", event)`, `ctx.session.hook("prompt")` | a hook table with explicit ordering and veto semantics |
| Events | `ctx.event.subscribe()`, one event stream | one `AppEvent` envelope with sequence numbers |
| Config | `plugins: ["pkg@version", { package, options }]`, `-` disables, `*` wildcard | manifest plus enable/disable list, no wildcard authority |
| Install | npm/Bun install at startup, cache in `~/.cache` | explicit install with a displayed permission sheet; no code execution before consent |

Two upstream details matter and are easy to miss. First, opencode's V2 hook migration table shows how fine-grained the surfaces became: `chat.params` split into prompt admission, model context, semantic options, and native HTTP. Second, the two built-in plugins ignore removal so a repository cannot switch off policy enforcement. Both translate directly: our host pins policy plugins as `builtin` and cannot be disabled by project config.

## 3. Architecture

### 3.1 Three tiers, one contract

| Tier | Runs where | Use | Trust |
| --- | --- | --- | --- |
| `declarative` | host | contributes settings, commands, status panels, and a transport descriptor that the host implements | no code; the safest default |
| `sidecar` | separate OS process | integrations that need network or process access | sandboxed by the permission sheet; JSON-RPC over stdio |
| `wasm` | host (wasmtime), phase 2 | pure transforms: prompt rewriting, path policy, render filters | no ambient authority; only host functions granted |

A plugin picks one tier in its manifest. Tier cannot change without reinstall and a new consent screen.

### 3.2 Manifest

`plugins/<id>/plugin.json`, validated against `plugin.schema.json` at install and on every load:

```json
{
  "$schema": "./plugin.schema.json",
  "id": "dev.bettershape.daytona",
  "name": "Daytona",
  "version": "0.1.0",
  "apiVersion": 1,
  "tier": "declarative",
  "builtin": true,
  "entry": { "transport": "daytona" },
  "capabilities": ["remote.transport", "remote.preview", "settings.page"],
  "config": {
    "type": "object",
    "required": ["apiKeyRef"],
    "properties": {
      "apiKeyRef": { "type": "string", "format": "secret-ref" },
      "defaultSize": { "enum": ["small", "default", "large"] }
    }
  },
  "contributes": {
    "remoteTransports": [{ "id": "daytona", "label": "Daytona", "configSchema": "config.schema.json" }]
  }
}
```

Rules:

1. `id` matches `^[a-z0-9]+(\.[a-z0-9-]+)+$`, is permanent, and is the storage namespace.
2. `apiVersion` is an integer. The host accepts one major version and refuses newer ones with a typed failure, never a silent skip.
3. `builtin: true` plugins ship in the binary, cannot be uninstalled, and are ignored by project-level disable lists.
4. `entry` must match `tier`. A `sidecar` entry names `command` and `args` with no shell interpolation.
5. Unknown top-level keys are rejected on install and ignored on load, with a warning. A plugin that needs a newer host fails loudly (doctrine 3).

### 3.3 Capability and permission model

A capability is a named, versioned contract. A permission is the concrete grant the user sees.

| Capability | Grants | Permission scopes |
| --- | --- | --- |
| `remote.transport` | own execution of a moved session: exec, fs, pty, port forward, status, dispose | `net:<host>`, `fs:session`, `process` |
| `session.export` / `session.import` | read or write the session bundle | `sessions:<ids or *>` |
| `events.subscribe` | receive a filtered event stream | `events:<topics>` |
| `tools.register` | add namespaced agent tools | `tools:invoke` |
| `commands.register` | add palette commands | none beyond invocation |
| `settings.page` | declare a settings page from a schema | none |
| `storage.kv` | per-plugin key-value storage, 5 MB cap | none |
| `hook.tool.before` / `hook.prompt` | veto or rewrite | `agent:mutation` |

Enforcement is in the host, not the plugin. A sidecar is spawned with a scrubbed environment containing only the env names its grant lists; the process gets no inherited handles, a 30-second handshake deadline, and no ability to invoke Tauri commands. A declarative plugin cannot call anything the host did not already implement for its transport id.

Grants are stored as `plugin_grants(plugin_id, capability, scope, granted_at, granted_by)` in the D01 store. An upgrade that adds a capability re-prompts only for the delta. Removing a grant disables the plugin until consent is restored; it never degrades silently.

### 3.4 Event bus

One enum, one envelope:

```rust
pub struct AppEvent {
    pub seq: u64,            // monotonic per process, gap-free for subscribers
    pub ts_ms: u64,
    pub topic: Topic,        // Session | Turn | Tool | Permission | Plugin | Remote | Ui
    pub scope: EventScope,   // { session_id?, turn_id?, plugin_id? }
    pub payload: serde_json::Value,
}
```

Rules:

1. Emission goes through `EventBus::publish`, never `app.emit` directly. Existing call sites are migrated mechanically; the payload keeps its old shape under `payload` so the webview listener contract does not break in this PR.
2. Subscribers declare topics at subscribe time. Filtering happens in the host; a plugin never receives events it did not subscribe to.
3. Bounded channel of 1,024 events per subscriber. Overflow drops the oldest and publishes one `plugin.events_lagged` event with the dropped count. Silent loss is forbidden.
4. Plugins are observers. They cannot mutate a published event or block delivery. Mutation exists only through the declared hooks.
5. Replay: the bus retains the last 10,000 events in memory for diagnostics, not for correctness. D08 adds durable run records.

### 3.5 Hooks

A hook is a synchronous, bounded, ordered call with one of three outcomes: `allow`, `deny(reason)`, `rewrite(value)`.

```rust
pub enum HookKind { ToolBefore, ToolAfter, PromptSubmit, PromptContext, Compaction, PermissionAsk, SessionImport }
```

Rules:

- Registration order is plugin load order, and load order is the manifest list order. No wildcard priority.
- A hook has 2,000 ms for transforms and 250 ms for vetoes. Overrun is a timeout, the hook is disabled for the rest of the session, and the failure is surfaced (D02).
- `PromptContext` hooks run in the same order as opencode's `context` hook: after prompt admission, immediately before the model request.
- A hook may rewrite only the fields its capability names. `PromptSubmit` cannot change tool arguments; `ToolBefore` cannot change the system prompt.
- Two plugins denying the same call produce one failure with `cause_id` naming both.

### 3.6 Registries

| Registry | Owner | Transform | Read |
| --- | --- | --- | --- |
| `transports` | D33 | add, remove (builtin only by host) | list by capability |
| `tools` | this dossier | add, namespace, disable | resolve by name at dispatch |
| `commands` | this dossier | add, rebind | merge into the palette |
| `settings` | this dossier | add page from schema | render in Settings > Plugins |

Registries are rebuilt deterministically from the active transform list on every change, never mutated in place. This is opencode's replay model, and it is the reason a plugin reload cannot leave a half-registered tool.

## 4. Runtime, lifecycle, failure

### 4.1 States

`discovered -> consented -> starting -> active -> draining -> stopped`, with `failed` reachable from every state. The state machine lives in `src-tauri/src/plugins/host.rs`; the UI reads it, never infers it.

### 4.2 Sidecar protocol

JSON-RPC 2.0, newline-delimited, over stdin/stdout. stderr is captured as a log with a 1 MB ring.

| Direction | Method | Notes |
| --- | --- | --- |
| host to plugin | `handshake` | `{apiVersion, hostVersion, pluginId, config}`; plugin replies with its capability list |
| host to plugin | `capability.invoke` | `{capability, method, params, deadlineMs}` |
| host to plugin | `shutdown` | plugin has 5 s, then SIGTERM, then SIGKILL |
| plugin to host | `host.log` | level, message, fields; redacted by D04 |
| plugin to host | `host.emit` | topic must be in the grant |
| plugin to host | `host.storage.get/set/delete` | namespace enforced |
| plugin to host | `host.confirm` | only if granted; shows a host-rendered confirmation |
| plugin to host | `host.secret.use` | returns a one-shot handle, never the value |

Every request has an `id` and a `deadlineMs`. The host enforces both; a plugin cannot extend its own deadline.

### 4.3 Crash and hang policy

- Three crashes in ten minutes disables the plugin and emits `plugin.crashed` with the last 50 log lines.
- A missing handshake within 30 s is a crash.
- A hung invocation is cancelled at its deadline. If the capability is `remote.transport` and a session is active on it, the session enters `orphaned` and the UI offers "Reconnect" (never a silent fallback to local).
- Disabling a plugin with an active session requires either moving the session back or confirming that its remote state will be left running.

### 4.4 Install and update

Install is explicit: choose a folder or a `.bsplugin` archive, validate the manifest, show the permission sheet, then copy to `plugins/<id>/<version>/`. Content is hashed; the hash is shown. Updates never reuse a running process; the new version starts after drain. There is no auto-update in this dossier, and no npm resolution at startup.

## 5. Where the code goes

| File | Contents |
| --- | --- |
| `src-tauri/src/plugins/{mod,manifest,registry,host,bus,hooks,grants,storage,error}.rs` | host |
| `src-tauri/src/plugins/runtime/{declarative,sidecar,wasm}.rs` | tiers; `wasm.rs` lands behind a feature flag in phase 2 |
| `src-tauri/src/plugins/conformance.rs` | the in-repo mock plugin and the contract suite |
| `src-tauri/src/commands/plugins.rs` | list, install, grant, disable, logs, storage |
| `schemas/plugin.schema.json`, `schemas/plugin-api.v1.json` | manifest and protocol schemas |
| `lib/plugins/host.ts` | webview client, never used by the Composio client |
| `features/settings/ui/pages/plugins/*` | list, detail, permissions, logs |
| `plugins/mock/` | fixture used by tests only |

## 6. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | manifest, schema, loader, content hashing, storage namespace, list/disable | 4 |
| P1 | sidecar runtime, JSON-RPC, handshake, deadlines, crash policy, log ring | 6 |
| P2 | capability registry, grants table, permission sheet, revocation | 4 |
| P3 | event bus, migration of existing emits, subscriptions, backpressure | 3 |
| P4 | hook table, ordering, timeouts, `ToolBefore`/`PromptContext` wiring | 4 |
| P5 | tool and command registries, namespacing, palette merge | 2 |
| P6 | conformance suite (12 cases), mock plugin, settings UI, docs | 3 |
| | **total** | **26** |

## 7. Acceptance criteria

1. A manifest with an unknown capability, a wrong `apiVersion`, or an `entry` that does not match its tier is rejected with a typed `Failure`, and the message names the offending field.
2. Installing the mock plugin shows a permission sheet listing every scope; denying `events.subscribe` means zero events reach it, proven by a test that counts deliveries.
3. A sidecar plugin cannot read the parent environment: a test sets `BETTERSHAPE_TEST_SECRET` and asserts it is absent in the child.
4. Killing the mock plugin mid-invocation produces one `plugin.crashed` event, disables it after the third crash, and leaves the calling turn in a typed failed state.
5. Event sequence numbers are gap-free per subscriber, and an overflowing subscriber receives exactly one `plugin.events_lagged` with the correct count.
6. A `ToolBefore` hook that denies returns the existing tool-denial UI path, and the model receives a message that names the plugin.
7. `builtin` plugins cannot be disabled by project configuration; a test writes a project disable list and asserts the transport still loads.
8. Removing a grant for an active plugin moves it to `failed` with `permission_revoked`, and no capability call succeeds afterward.
9. The conformance suite runs in CI against the mock plugin and fails on protocol drift.
10. The full gate passes, including `cargo clippy` with no new warnings.

## 8. Traps

- **Do not let a plugin register a Tauri command.** The command list stays closed; plugins get the host API and nothing else.
- **Do not accept a plugin-supplied path outside its namespace.** Resolve and canonicalise, then compare against `plugins/<id>`.
- **Do not proxy secrets.** D04's one-shot handle exists so a sidecar never holds a long-lived credential. A plugin that needs a key at spawn time gets it through the host-injected environment, and the host logs the name only.
- **Do not make the bus lossless by blocking.** A blocked UI is worse than a dropped diagnostic event; the lag notice is the contract.
- **Do not name the tier in the manifest and then infer it from the entry.** Two sources of truth produce a plugin that starts in the wrong sandbox.
- **Do not ship the WASM tier in the same PR.** It doubles the dependency surface and does not unblock D33, which is declarative.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/05-plugin-host.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D05: Plugin host, manifests, capabilities, and the event bus. Scope: the manifest schema and loader, the declarative and sidecar tiers, the JSON-RPC protocol, capability and permission grants with a consent sheet, the typed event bus with sequence numbers and backpressure, the bounded hook table, the tool and command registries, the conformance suite, and the Settings > Plugins surface. Do not implement the remote transports themselves (D33), do not implement session export (D06), do not add the WASM tier, and do not change the Composio client beyond renaming its UI label to Integrations.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/05-plugin-host` from the current `draft/mega-absorb-all` only after dossier 04 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
