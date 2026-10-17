# D13: Keybindings: when-clauses, conflicts, and a real config file

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/13-keybindings`) |
| Roadmap source | mausCode step 06 (issue #8) |
| Issue title | `D13: Keybindings: when-clauses, conflicts, and a real config file` |
| Labels | `port`, `dossier:13`, `area:settings`, `size:M`, `stage:2` |
| Depends on | D09, D10, D11 commands |
| Blocks | D23, D22 |
| Effort | 12 days |

**Port verdict: TAKE the model and the resolver. BetterShape already has chords, presets, and a settings UI; what it lacks is semantics.**

## 1. The two systems side by side

| concern | BetterShape | t3code |
|---|---|---|
| binding count | 39 labels in `config/keybindings.json` | 60+ command ids in `STATIC_KEYBINDING_COMMANDS` plus 9 thread jumps and 9 model-picker jumps |
| chord support | yes, `Ctrl+K S` via `splitKeyChord` | yes, `key` string parsed by `parseKeybindingShortcut` |
| presets | 4 (`default`, `vscode`, `sublime`, `vim`) | defaults plus user config, no named presets |
| `when` | stored as a string, labeled "Display / future context predicate", never evaluated | parsed into an AST and evaluated against a context object |
| override storage | `localStorage["bettershape-keybindings-override"]`, keyed by label or id | server-side config file, atomic writes, validated |
| conflict handling | none | conflict key dedupe with last-wins resolution |
| stable identity | label first, slug id fallback | command id |
| scope | global handler with a small "focused surface owns these" list | context flags: `terminalFocus`, `terminalOpen`, `previewFocus`, `previewOpen`, `isWeb`, `isDesktop`, `editableFocus`, plus arbitrary keys |

The BetterShape file is 373 lines and the matching logic is a key name normalizer plus a chord builder. The t3 pair is 709 lines server plus 452 web plus a 227-line contract, and the extra roughly 1,000 lines are almost entirely semantics.

## 2. What t3 actually does

### 2.1 The contract

`KeybindingRule = { key, command, when? }`, max 64 characters for the key and 256 for the when expression, max 256 rules, max AST depth 64. The `when` grammar is four node types: `identifier`, `not`, `and`, `or`. Identifiers resolve against the context object; `true` and `false` are literals.

`KeybindingShortcut` is the resolved form: `key`, `metaKey`, `ctrlKey`, `shiftKey`, `altKey`, `modKey`. `modKey` is the portable "Cmd on macOS, Ctrl elsewhere" flag, resolved at match time by `isMacPlatform`.

Commands include jump families (`thread.jump.1` through `.9`, `modelPicker.jump.1` through `.9`). Those are trivial to implement and disproportionately useful: Cmd+1 through Cmd+9 to switch threads is the single most requested power-user binding.

### 2.2 Resolution

`effectiveShortcutsForCommand` walks the binding list **backwards**, skips rules whose when-clause does not match, computes a conflict key `key|meta|ctrl|shift|alt`, and lets the first (that is, latest) claim win. Then it collects the shortcuts that belong to the requested command.

This inverted walk is the whole layering model: later rules override earlier ones, a binding shadowed by a higher-priority rule is not effective, and a single command can have multiple bindings if they use different physical shortcuts. It also means the resolver can answer "what is this command bound to right now" without a separate priority field.

`resolveShortcutCommand(event, keybindings, options)` is the inverse: normalize the event, build a conflict key, return the command that owns it. Both directions share the same normalization, which is why `shortcutConflictKey` is exported.

### 2.3 Server-side config

`apps/server/src/keybindings.ts` owns the file. Details worth copying:

- Atomic writes (`writeFileStringAtomically`) so a crash cannot truncate the config.
- A cache keyed by file mtime plus a PubSub for change notifications.
- `LATE_DEFAULT_KEYBINDINGS` adds a default for `composer.sendBackground:mod+enter` only when the user has not already bound that shortcut, which is how a default can be introduced without stealing an existing binding.
- Encoding round-trips a resolved rule back to `{ key, command, when? }` and fails loudly if the shortcut cannot be encoded.
- Parse failures produce `ServerConfigIssue` entries rather than crashing; the UI can show "line 4: unknown command".

## 3. BetterShape today

`lib/ui/shortcuts.ts`:

- `loadKeybindings()` merges `config/keybindings.json` with overrides keyed by label or id.
- `setKeybindingOverride(label, key)` writes a single object to localStorage and dispatches `bettershape-keybindings-changed`.
- `eventToKeyChord` normalizes KeyboardEvent to `Ctrl+K S`.
- `splitKeyChord` renders keycaps.
- `when` is read into the model and never used.

Consequences:

1. Two bindings can claim the same chord and both fire, or the first wins by accident of order.
2. The `editorFocus` and `terminalFocus` strings in the config are decorative. There is no context.
3. Overrides are lost when the webview storage is cleared, and are not portable between windows or machines.
4. Presets replace all keys at once with no preview of conflicts.

## 4. Port plan

### Step 1: stable command ids (1 day)

Add `command` to every entry in `config/keybindings.json`, using the t3 naming style (`composer.stash`, `chat.new`, `thread.jump.1`, `usage.open`). Keep `label` for display. Overrides move from label to command id, with a migration that maps existing label-keyed overrides to ids and keeps the old object for one release.

This is a prerequisite for everything else and it is mechanical.

### Step 2: when-AST (3 days)

Port the grammar exactly:

```ts
type WhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: WhenNode }
  | { type: "and"; left: WhenNode; right: WhenNode }
  | { type: "or"; left: WhenNode; right: WhenNode };
```

Parser: Recursive descent with the same caps (64 characters per identifier, depth 64). A parse error keeps the rule but marks it invalid in the settings UI rather than disabling the whole file.

Evaluator: `evaluateWhenNode(node, context)` where context starts from `{ terminalFocus, terminalOpen, previewFocus, previewOpen, editableFocus, isDesktop: true }` and allows extra boolean keys. BetterShape is desktop-only, so `isWeb` is always false; keep the identifier for config portability anyway.

Context plumbing: a single `useShortcutContext()` provider in the shell that subscribes to focus state from the editor, terminal, preview, and composer. The global keydown handler reads the context snapshot at event time, not from a stale closure.

### Step 3: resolver and conflicts (2 days)

Replace `bindings.find(b => b.key === chord)` with:

```
resolveShortcutCommand(event, bindings, { context })
```

and the inverse `effectiveShortcutsForCommand`. Add `shortcutConflictKey` and use it in the settings UI to show a red badge on a conflicting row, naming the winner. Do not silently reassign; show the conflict and let the user pick.

### Step 4: config file (2 days)

Move overrides from localStorage to a JSON file under app data (`keybindings.json`), written atomically. Keep localStorage as a read-through cache for instant boot, then reconcile when the file loads. The Rust command surface: `keybindings_read`, `keybindings_write`, `keybindings_reset`.

Why move: BetterShape is a desktop app with multiple windows. localStorage is per webview origin and can be cleared by the "reset app data" flow; a config file is what users expect to back up.

### Step 5: command coverage (2 days)

Add the jump families and the new commands the other dossiers introduce: `composer.stash`, `composer.sendBackground`, `thread.settle`, `thread.snooze`, `thread.find`, `usage.open`, `usage.period.day/week/month/quarter`, `usage.cost/tokens/limits`, `chat.newWithoutProject`, `rightPanel.toggle`. Bind them to t3-compatible defaults where they do not conflict with existing BetterShape bindings.

### Step 6: settings UI (2 days)

The existing Keyboard Shortcuts section gets:

- search by label or chord
- conflict badges with the winning binding named
- a "reset to default" per row and for the whole file
- preset preview before apply
- a recorder that captures a chord including modifiers, with a warning when the chord is already claimed

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `keybindings.test.ts` (contract) | AST round-trip, depth cap, invalid identifiers |
| `keybindings.test.ts` (server) | atomic write, late defaults only when unclaimed, encode failure |
| `keybindings.test.ts` (web) | backward resolution, shadowed binding not effective, platform mod |
| `shortcutModifierState.browser.test.ts` | modifier normalization across platforms |

## 6. Traps

- **Do not key overrides by label.** Labels are copy; renaming one loses the user's binding.
- **Do not evaluate `when` in a closure captured at mount.** Focus changes constantly; a stale context makes bindings fire in the wrong surface.
- **Do not let a preset silently shadow a custom binding.** Presets are a bulk write; the preview must show what will be lost.
- **Chords need a timeout.** `Ctrl+K` followed by `S` must expire after roughly 1.5 seconds and on blur, otherwise the next `S` becomes a command.
- **Terminal keys belong to the terminal.** Keep the "focused surface owns these" list and extend it rather than replacing it.

## 7. Effort

| step | days |
|---|---:|
| command ids and migration | 1 |
| when-AST parser and evaluator | 3 |
| resolver and conflicts | 2 |
| config file | 2 |
| command coverage | 2 |
| settings UI | 2 |
| **total** | **12** |

## 8. Acceptance criteria

1. `Ctrl+K S` stashes the composer only when the composer is focused, and the same chord in the terminal does nothing.
2. A user binding that conflicts with a default shows a conflict badge naming both commands.
3. The latest matching rule wins, and removing it restores the default immediately without a reload.
4. Overrides survive a full app data reset of webview storage, because they live in the config file.
5. Cmd+1 through Cmd+9 switch threads when the thread list has focus.
6. An invalid `when` expression disables only that row and reports the parse error.

## 9. Dependencies

D09 introduces `composer.stash`; D10 introduces settle/snooze/find; D11 introduces usage commands. Land this dossier after those command names exist, or land the resolver first with the current 39 bindings and add commands as features arrive. The recommended order is: Step 1 and 2 with the current set, then extend coverage in each feature wave.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/13-keybindings.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D13: Keybindings: when-clauses, conflicts, and a real config file. Scope: command ids, a when-clause AST, conflict detection, depth limits, and an atomic keybindings.json. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/13-keybindings` from the current `draft/mega-absorb-all` only after dossier 12 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
