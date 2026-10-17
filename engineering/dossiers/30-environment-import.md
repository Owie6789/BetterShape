# D30: Environment import from other agent tools

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/30-environment-import`) |
| Roadmap source | mausCode step 33 (issue #35) |
| Issue title | `D30: Environment import from other agent tools` |
| Labels | `port`, `dossier:30`, `area:agent`, `size:M`, `stage:5` |
| Depends on | D04 (secrets), D12 (instructions), D19 (providers), D25 (MCP), D29 (skills) |
| Blocks | nothing hard; onboarding depends on it |
| Effort | 12 days |

**Port verdict: BUILD. mausCode step 33 is a five-stage import with a manifest and a rollback. BetterShape has every destination (rules, MCP config, skills, provider keys) and no source: a user arriving from Claude Code, Codex, Cursor, or VS Code retypes their setup by hand.**

## 1. What can be imported

| Source | Files | What we take |
| --- | --- | --- |
| Claude Code | `~/.claude.json`, `~/.claude/settings.json`, `CLAUDE.md`, `.claude/skills/`, `.mcp.json` | MCP servers, instructions, skills, permission posture (as seed rules, disabled) |
| Codex | `~/.codex/config.toml`, `AGENTS.md` | MCP servers, model defaults, instructions |
| Cursor | `~/.cursor/mcp.json`, `.cursor/mcp.json`, `.cursorrules`, `.cursor/rules/*` | MCP servers, rules |
| VS Code | `.vscode/mcp.json` | MCP servers |
| BetterShape bundle | a D06 session bundle with an environment section | sessions and rules |

API keys are **detected and listed** (`source`, key name, last four if present) and never imported. The UI links each to the matching provider form (D04). Hooks and scripts are listed and imported disabled; the import never executes anything from a foreign directory.

## 2. Five stages

Each stage returns a typed payload that the UI renders; no stage after Detect reads or writes without the previous stage's explicit confirmation.

```rust
pub struct Detected { pub source: SourceKind, pub path: PathBuf, pub version: Option<String>,
                      pub files: Vec<DetectedFile>, pub warnings: Vec<String> }
pub struct Preview { pub items: Vec<PreviewItem>, pub total_bytes: u64, pub conflicts: Vec<Conflict> }
pub struct MapPlan { pub items: Vec<MappedItem> }   // destination + transform + skip reason
pub struct Confirm { pub decisions: Vec<Decision>, pub manifest_id: String }
pub struct ImportReport { pub written: usize, pub skipped: usize, pub failed: Vec<FailedItem>,
                          pub rollback_token: String }
```

`PreviewItem` is one of `McpServer`, `InstructionFile`, `Skill`, `ProviderDefault`, `PermissionPosture`, `SecretDetected`, `Hook`. Every item has a stable `item_id`, a size, and a fingerprint.

Rules:

1. Detect never opens a path outside the user's home or the selected project root, and refuses a symlink whose target escapes it.
2. Preview parses with size caps (2 MiB per file, 10 MiB per source) and reports a parse failure per file without aborting the source.
3. Map is pure: it produces a `MappedItem` per item with `destination`, `action` (`create` | `merge` | `skip`), and `reason`. Conflicts are shown before any write.
4. Confirm records the decision set and issues the manifest id; the import can proceed item by item.
5. Import writes in dependency order (providers, MCP, skills, instructions, rules), each through its owning module's API, never by editing a file directly.

## 3. Untrusted input

- Every foreign file is read through `agent/security/paths.rs` with a root check and a symlink check.
- Secrets are detected with D04's redactor patterns and replaced with a `SecretDetected` item; the value is never copied.
- Instructions are imported as **candidate rules**, shown in a diff, and require one confirmation per file. A 4,000-line `CLAUDE.md` becomes a rules file the user can trim, not a silent system prompt.
- Skills are copied, not linked, and their `scripts/` are disabled. D29's install path validates frontmatter.
- MCP server commands are shown with argv; a server that needs a secret is created disabled until the secret is set.
- No imported hook runs in this dossier. Hooks are a later feature; the import records them as `unsupported_hook` so the user is not surprised.

## 4. Manifest and rollback

```sql
CREATE TABLE import_manifests (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, source_path TEXT NOT NULL,
  fingerprint TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER,
  decisions TEXT NOT NULL, report TEXT
);
CREATE TABLE import_items (
  manifest_id TEXT NOT NULL, item_id TEXT NOT NULL, kind TEXT NOT NULL,
  destination TEXT, action TEXT NOT NULL, previous_value TEXT, applied_at INTEGER,
  PRIMARY KEY (manifest_id, item_id)
);
```

- `previous_value` is the serialized prior state captured immediately before the write. A rules file body or an MCP entry is stored inline. A skill directory is stored as a captured archive: the prior tree is copied into the import staging area as `previous/<manifest_id>/<item_id>/` before the write, and `previous_value` holds that path plus the folder hash. A hash alone cannot restore bytes, so a directory that was merged into or replaced cannot be promised byte-for-byte restoration without the copy.
- Rollback walks the manifest in reverse and restores `previous_value`; an item that was created is deleted, an item that was merged is restored byte-for-byte from the captured tree, and an item whose prior state was "absent" is deleted. The captured trees are pruned when the manifest is pruned.
- Rollback is itself a receipt (D01-B2) and refuses if a destination changed after the import (`import_destination_changed` names the file).
- Re-running Detect on an unchanged source returns the same fingerprint and offers "Review last import" instead of applying it twice.

## 5. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/import/{mod,detect,preview,map,apply,rollback}.rs` | stages |
| `src-tauri/src/import/sources/{claude,codex,cursor,vscode,bundle}.rs` | per-source readers |
| `src-tauri/migrations/0005_import.sql` | manifest tables |
| `src-tauri/src/commands/import_cmds.rs` | detect, preview, map, confirm, rollback |
| `features/import/*` | staged wizard with per-item diffs |

## 6. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | source detection, parsers, size and path guards | 3 |
| P1 | preview, mapping, conflict model | 2 |
| P2 | writers for MCP, rules, skills, provider defaults | 3 |
| P3 | manifest, previous-value capture, rollback | 2 |
| P4 | wizard UI, per-item diffs, tests | 2 |
| | **total** | **12** |

## 7. Acceptance criteria

1. Each of the five sources is detected from a fixture home directory, and a missing source is a clean "not found", not an error.
2. A symlinked `CLAUDE.md` pointing outside the home is refused with `import_path_escape`.
3. A 3 MiB instruction file is refused with `import_too_large`, and the rest of the source still imports.
4. A foreign API key is listed with its last four characters and never written to the vault; a test greps every destination for the fixture value.
5. No file is written before Confirm; a test runs Detect, Preview, and Map and asserts the destination tree is byte-identical.
6. Every imported MCP server that references a secret is created disabled and names the missing secret.
7. Re-running Detect on an unchanged source returns the same fingerprint and does not duplicate items.
8. Rollback after importing a rules file, an MCP server, and a skill restores the exact prior state, including the byte content of a merged skill directory restored from the captured tree; a changed destination refuses with the file named.
9. Imported hooks are recorded as `unsupported_hook` and none executes.
10. The full gate passes.

## 8. Traps

- **Do not import a key.** "We found your Anthropic key" plus a re-entry form is the only safe flow; copying it creates a second copy the user cannot see.
- **Do not merge instructions automatically.** A foreign `CLAUDE.md` is another product's prompt, not this one's; the user confirms the text.
- **Do not write before Confirm.** A wizard that half-applies is worse than a script.
- **Do not capture `previous_value` after the write.** It must be read immediately before, in the same lock.
- **Do not support a source by guessing its schema.** A parse failure is reported per file; a guessed mapping corrupts a config.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/30-environment-import.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D30: Environment import from other agent tools. Scope: the five source readers, the Detect/Preview/Map/Confirm/Import stages with typed payloads, the manifest tables with previous-value capture, per-item rollback, secret detection without import, instructions as reviewed candidate rules, and skills through D29's installer. Do not import hooks or scripts, do not write anything before Confirm, and do not add a source that is not in the dossier.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/30-environment-import` from the current `draft/mega-absorb-all` only after dossier 29 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
