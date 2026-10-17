# D04: Secrets vault with a loud fallback

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/04-secrets-vault`) |
| Roadmap source | mausCode step 11 (issue #13) |
| Issue title | `D04: Secrets vault with a loud fallback` |
| Labels | `port`, `dossier:04`, `area:core`, `size:S`, `stage:1` |
| Depends on | D01 (store, settings versioning), D02 (typed failures) |
| Blocks | D05 (plugin grants), D19 (providers), D27 (egress), D30 (import), D33 (remote) |
| Effort | 8 days |

**Port verdict: BUILD. mausCode step 11 is the second critical gate. BetterShape already uses the OS keyring in two unrelated namespaces and still keeps API-key strings in the settings object, so the app has three answers to "where is the secret" and no answer to "who read it".**

## 1. Today

| Store | Path | Problem |
| --- | --- | --- |
| AI provider keys | `commands/ai_byok.rs:26` `VAULT_SERVICE = "bettershape-ai"` | one namespace, per-provider entries, probe at `:482` |
| MCP OAuth tokens | `mcp/credentials.rs:3` `SERVICE = "bettershape-mcp-oauth"` | second namespace, no shared interface |
| Settings object | `lib/settings/store.ts:441-456` `apiKey` fields | legacy plaintext migration path; keys are still rendered into settings state |
| Plugin keys | Composio key in the same settings object | read directly by `lib/plugins/api.ts:41` |

There is no list API, no last-used record, no redaction layer, and no consent model. A failure message that contains a token reaches the UI unchanged, because `AppError::Message` carries a `String` (D02).

## 2. Design

### 2.1 One store, three backends

```rust
pub trait SecretBackend {
    fn probe(&self) -> BackendStatus;
    fn get(&self, id: &str) -> Result<Option<SecretValue>, SecretError>;
    fn set(&mut self, id: &str, value: &SecretValue) -> Result<(), SecretError>;
    fn delete(&mut self, id: &str) -> Result<(), SecretError>;
}

pub enum BackendStatus { Ready, Locked, Unavailable { reason: String } }
```

| Backend | When | Persistence |
| --- | --- | --- |
| `OsKeyring` | probe succeeds | keyring item under `bettershape-secrets` with the secret id as account |
| `EncryptedFile` | user opts in after a failed probe | XChaCha20-Poly1305, key file `secrets.key` mode 0600 in the app data dir |
| `Memory` | default after a failed probe | process lifetime only; the user re-enters the key after restart |

The backend is chosen once at startup and shown in Settings > Agent > Secrets. Never per-secret: two backends in one install is how a user ends up with a key that works in one screen and not another.

The fallback is loud. `EncryptedFile` shows a persistent banner in Settings and a marker in the status bar: "Secrets are stored in a local file, not the OS keychain." It is opt-in, recorded as `secrets_fallback_consent(at, version)`, and revocable. `Memory` shows "Secrets are not saved" on the provider form before the user types.

The file backend protects against casual disk reads, not against an attacker who can read both files. Say that in the UI, not only in the docs.

### 2.2 References, never values

```rust
pub struct SecretRef { pub id: String, pub label: String, pub kind: SecretKind,
                       pub last4: String, pub created_at: u64, pub last_used_at: Option<u64>,
                       pub scopes: Vec<Scope> }
```

`SecretKind` is `Provider`, `Mcp`, `Plugin`, `Remote`, `Webhook`, `Other`. `id` is a UUID; `label` is user text. The webview receives `SecretRef` only. There is no command that returns a value. A consumer asks the host to perform an operation with the reference:

```rust
vault.with_secret(&ref_id, Scope::ProviderCall, |value| { /* build header */ })
```

`with_secret` checks the grant, updates `last_used_at` (coalesced to one write per minute), and zeroizes the buffer on drop. A plugin gets a one-shot handle (`D05` §4.2), not the bytes.

### 2.3 Consent

A secret is readable by exactly these principals: the user (never displayed after save), the feature that created it, and any principal the user granted in the permission sheet. Grant rows are `secret_grants(secret_id, principal, scope, granted_at)`. Principal is `provider:<id>`, `mcp:<id>`, `plugin:<id>`, or `remote:<id>`.

First use by a new principal prompts: "Acme Remote wants to read 'Daytona API key' (dtn_...9f2a). Allow once / Always for this transport / Deny." Denials are typed failures with `permission_denied` and the principal named.

### 2.4 Migration

On first run after this dossier:

1. Enumerate `bettershape-ai` entries, copy to `bettershape-secrets` with `kind: Provider`, then delete the old entry only after a read-back succeeds.
2. Same for `bettershape-mcp-oauth` with `kind: Mcp`.
3. If the settings object still holds a non-empty `apiKey`, move it, then blank the field and persist. The field stays in the type for one release as `#[serde(default, skip_serializing)]` so old files load.
4. Migration is idempotent and recorded as one receipt (D01-B2). A partial failure leaves the old entry in place and reports which ids moved.

### 2.5 Redaction

One `Redactor` in `src-tauri/src/core/redact.rs`, applied at four boundaries: `Failure` serialization (D02), log lines, plugin stdout/stderr, and any string returned to the webview from a tool.

Patterns: `sk-[A-Za-z0-9_-]{16,}`, `sk-ant-`, `gh[pousr]_[A-Za-z0-9]{20,}`, `github_pat_`, `dtn_[A-Za-z0-9]{16,}`, `boat_[A-Za-z0-9]{16,}`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-`, `Bearer\s+\S{20,}`, PEM private-key blocks, and any value currently held by the vault (exact-match set, longest first).

Replacement keeps the last four characters: `sk-...9f2a`. A test feeds a 4 MB log through the redactor and asserts the token is absent and the tail is present.

## 3. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/core/secrets/{mod,backend,file,migrate,redact}.rs` | store, backends, migration |
| `src-tauri/src/core/redact.rs` | patterns and the exact-match set |
| `src-tauri/src/commands/secrets.rs` | list, set, delete, probe, grant, revoke, consent |
| `commands/ai_byok.rs`, `mcp/credentials.rs` | delete their keyring code, call the vault |
| `commands/ai_byok.rs:482` | probe moves to the vault |
| `lib/settings/store.ts` | blank migration; keep the type for one release |
| `features/settings/ui/pages/secrets/*` | list, add, rotate, fallback banner |

## 4. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | store trait, keyring backend, refs, CRUD, probe | 2.5 |
| P1 | file backend, consent, memory fallback, banner | 1.5 |
| P2 | migration of both namespaces and the settings object, receipts | 1.5 |
| P3 | redactor at four boundaries, pattern tests, exact-match set | 1.5 |
| P4 | grant sheet, list/rotate UI, export exclusion test | 1 |
| | **total** | **8** |

## 5. Acceptance criteria

1. `grep -rn "keyring::" src-tauri/src` returns hits only in `core/secrets/`.
2. No Tauri command returns a secret value. A test invokes every `secrets::*` command and asserts no response contains the fixture value.
3. Saving a provider key writes one keyring entry under `bettershape-secrets`; the old `bettershape-ai` entry is gone after a successful read-back.
4. With the keyring probe forced to fail, the app starts in memory mode, the provider form says "Secrets are not saved", and no file is written.
5. With the file backend consented, the banner is visible on every settings page, and the key file is mode 0600.
6. Redaction removes all twelve pattern classes from a log line and replaces them with `...` plus the last four characters.
7. A new principal reading a secret without a grant gets `permission_denied`; the prompt appears on first use and the "always" choice persists.
8. Deleting a secret that a remote transport is using fails with `secret_in_use`, names the transport, and offers "Move sessions first".
9. Settings export contains secret labels and ids, never values.
10. The full gate passes.

## 6. Traps

- **Do not use `Debug` on `SecretValue`.** Implement `Debug` by hand and print `[redacted]`; a derive here leaks through any `dbg!` or error chain.
- **Do not keep a copy in `AgentState`.** A cached key defeats rotation and survives a revoke.
- **Do not let redaction run after the failure is stored.** Apply it at construction; a stored raw message is already a leak.
- **Do not treat the file backend as equivalent to the keyring.** Different copy in the UI, different consent, different risk sentence.
- **Do not migrate on a background thread without a lock.** Two windows can both migrate; the receipt plus a startup mutex makes it once.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/04-secrets-vault.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D04: Secrets vault with a loud fallback. Scope: the `SecretBackend` trait, the OS keyring backend, the consented encrypted-file fallback, memory mode, secret references with no value-returning command, grants for principals, the migration from both existing keyring namespaces and the settings object, the redactor at its four boundaries, and the Secrets settings page. Do not implement plugin capability grants (D05), do not add a remote transport, and do not keep a second keyring call site.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/04-secrets-vault` from the current `draft/mega-absorb-all` only after dossier 03 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
