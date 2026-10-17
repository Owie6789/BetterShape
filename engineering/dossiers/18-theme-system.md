# D18: Theme system

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/18-theme-system`) |
| Issue title | `D18: Theme system` |
| Labels | `port`, `dossier:18`, `area:design`, `size:M`, `stage:3` |
| Depends on | D01-B5 (settings versioning) |
| Blocks | nothing, but every later UI dossier inherits the tokens |
| Effort | 16 days |

**Port verdict: TAKE the token engine, keep dark as the only shipped mode. OpenCode's seed palette to 12-step OKLCH scales to semantic tokens pipeline is the part worth porting. Its mode switcher is not: BetterShape's chrome, window treatment, shadows, and contrast budget are built for dark, and a half-ported light mode is worse than none.**

This dossier answers the open question from the plan: theming comes back, light mode does not. The engine is written so that a light variant is a data file later, not a rewrite.

## 1. What was asked

Bring over OpenCode's theme system. That covers:

- A theme format users can write.
- The built-in theme set.
- Switching themes in the app and in the terminal client.
- The derivation math that makes thirty themes out of ten colors each.

BetterShape currently has one hardcoded dark palette, a 44-line registry with exactly one entry, a CodeMirror theme with its own colors, a syntax theme with a third set, and a terminal theme that reads CSS variables with hex fallbacks. There is no Appearance settings page.

## 2. What OpenCode does

Two systems, one idea. The desktop app and the TUI generate semantic tokens from a small palette, then render.

### 2.1 The desktop engine

Source: `packages/ui/src/theme/` at `8c173a8`.

```
themes/*.json  ->  palette (9 seeds + overrides)
                   |
                   v
          generateScale(seed, isDark)   OKLCH, 12 steps
                   |
                   v
        resolveThemeVariant()           ~250 semantic tokens
                   |
                   v
             themeToCss()               :root { --background-base: #... }
                   |
                   v
        <style id="oc-theme">           injected at runtime
```

**Seed palette** (`ThemePaletteColors`): `neutral`, `ink`, `primary`, `success`, `warning`, `error`, `info`, optional `accent`, `interactive`, `diffAdd`, `diffDelete`. The file also carries `overrides` (any token by name) and `v2Overrides`.

**Scale generation** (`color.ts:146`) uses OKLCH lightness steps and chroma multipliers:

```ts
const lightSteps = isDark
  ? [0.118, 0.138, 0.167, 0.202, 0.246, 0.304,
     0.378, 0.468, clamp(base.l*0.825, 0.53, 0.705),
     clamp(base.l*0.89, 0.61, 0.79),
     clamp(base.l+0.033, 0.868, 0.943), 0.984]
  : [0.993, 0.983, 0.962, 0.936, 0.906, 0.866,
     0.811, 0.74, base.l, Math.max(0, base.l-0.036), 0.49, 0.27]

const chromaMultipliers = isDark
  ? [0.52, 0.68, 0.86, 1.02, 1.14, 1.24, 1.36, 1.48, 1.56, 1.64, 1.62, 1.15]
  : [0.12, 0.24, 0.46, 0.68, 0.84, 0.98, 1.08, 1.16, 1.22, 1.26, 1.18, 0.98]
```

**Neutral generation** (`color.ts:184`) is different: it derives a background from the seed's lightness and chroma, then mixes from that background toward `ink` in 12 fixed steps (`0, 0.018, 0.039, ... 0.984` for dark). This is why OpenCode themes look tonally coherent: the entire gray ramp comes from two colors.

**Derived colors** in `resolve.ts`:

- `amber` from warning with a hue shift, `blue` from interactive.
- `diffAdd`/`diffDelete` fall back to shifted success/error.
- `content()` lifts light seeds so text stays readable.
- `on(fill)` picks white or black by relative luminance, which is how every "on brand" token stays legible without per-theme tuning.
- `surface(seed, alphas)` builds five transparency steps for hidden diffs.
- `overlay` mode: when the theme overrides `background-base` with a non-hex value, surfaces become alpha colors instead of blended ones, so translucency works.

**Resolution output**: roughly 250 tokens across background, surface, text, border, input, button, icon, syntax, markdown, diff, avatar.

**Delivery** (`loader.ts`, `context.tsx`):

- `applyTheme()` builds one CSS string for both modes and injects it into `<style id="oc-theme">`.
- Built-in themes are `import.meta.glob("./themes/*.json")`; 36 files ship.
- Custom themes: `loadThemeFromUrl()` fetches JSON; `registerTheme()` adds it to the store.
- Selection lives in `localStorage` (`opencode-theme-id`, `opencode-color-scheme`).
- A blocking preload script (`public/oc-theme-preload.js`) reads the cached CSS from `localStorage` before first paint, so there is no flash. A test (`theme-preload.test.ts`) pins its behavior for four stored/locale combinations.
- `data-theme` and `data-color-scheme` on `<html>` drive everything else.

### 2.2 The TUI engine

`packages/theme/src/tui/` is a separate implementation with the same philosophy but a different target: terminal colors.

- Hues (`accent`, `interactive`, `neutral`, plus optional) expand to 100 through 900 scales.
- `expand.ts` derives `muted`, `faint`, state variants, and `surface()` with fixed priorities.
- The published JSON (`opencode.json`/`opencode.json2.json`) is `defs` plus a `theme` map with `primary`, `secondary`, `accent`, `error`, `warning`, `success`, `info`, `text`, `textMuted`, `background`, `backgroundPanel`, `backgroundElement`, `border`, `borderActive`, `borderSubtle`, `diff*`.
- Colors are hex, ANSI 0-255, `$ref`, `{dark, light}`, or `none`. Circular refs throw.
- Load order: built-in, then `~/.config/opencode/themes/*.json`, then project directory. V1 files put the map on `theme`; V2 on `base`.
- `generateSyntax()` derives about 50 tree-sitter scopes.

The lesson for BetterShape: the same seed set produces both a GUI palette and a syntax palette, and both stay in sync because neither is hand-maintained.

### 2.3 What the themes look like in practice

`oc-2.json` dark palette:

```json
{ "neutral": "#1f1f1f", "ink": "#f1ece8", "primary": "#fab283",
  "success": "#12c905", "warning": "#fcd53a", "error": "#fc533a",
  "info": "#edb2f1", "interactive": "#034cff",
  "diffAdd": "#c8ffc4", "diffDelete": "#fc533a" }
```

Ten colors. The rest is math. The `overrides` block is small on purpose: only the tokens the seeds cannot express (`text-strong`, `text-base`, `text-weak`, `border-weak-base`, `surface-raised-base`, a few others).

## 3. What BetterShape has today

Verified at `289b134`.

- `app/globals.css`, 1,771 lines. One `:root` block with 171 declarations, 276 unique custom properties in the file overall.
- A second `@theme inline` block maps tokens to Tailwind utilities. Adding a token means editing both blocks.
- `lib/settings/themes.ts`, 44 lines: `ColorThemeId = "dark"`, one entry, `normalizeColorTheme()` returns `"dark"` for anything.
- `paintDarkTheme()` in `lib/settings/store.ts` deletes `data-theme`, sets `color-scheme: dark`, adds `.dark`.
- No Appearance settings page. A `category=appearance` deep link redirects to the editor-font section (`features/settings/ui/settings.tsx:800`).
- `features/editor/ui/codemirror/theme.ts`, 316 lines: colors already read `var(--accent)`, `var(--text-muted)`, `var(--info)`, `var(--warning)`. Good news: the editor is already token-driven. It only needs the tokens to be themeable.
- `lib/ui/syntax-theme.ts`, 57 lines: `react-syntax-highlighter` theme, also token-driven.
- `features/terminal/ui/terminal.tsx`: reads `--text-secondary`, `--panel`, `--warning`, `--error`, `--accent` at construction, and constructs a partial ANSI palette with hardcoded `#27272a` and `#a78bfa`, `#67e8f9`. The observer at line 416 already watches for `class`/`data-theme` mutations, so a theme change can repaint the terminal without new plumbing.
- 131 hex literals in 19 component files outside the palette, measured with `#[0-9a-fA-F]{3,8}` and excluding `app/globals.css`. `DESIGN.md:93` records the same number and the same largest offenders.
- `DESIGN.md` says "dark only" in one line and treats the light-mode comment in `globals.css` as stale.

The token *names* are already role-based (`--surface-*`, `--text-*`, `--border-*`, `--accent*`, `--success/warn/danger/info`, `--added/modified/removed`, `--diff-*`). That is the hard part of a theme system, and it is done. What is missing is a generator behind those names and a picker in front.

## 4. Decision: dark-only mode, both-mode engine

| Option | Verdict |
| --- | --- |
| Port full light/dark/system like OpenCode | **No, not in this dossier.** Every shadow, scrim, window stroke, and screenshot surface assumes dark. A real light mode needs its own contrast audit of 19 component files and a second look at the workbench chrome. That is a separate 8 to 10 day project with its own design review. |
| Dark only, hardcoded | **Rejected.** That is today, and it is what the user asked to replace. |
| **Dark shipped, generator accepts `isDark`** | **Chosen.** The math is mode-parametric anyway. Users get many dark themes, custom themes, and a documented path to light. |

Consequences:

- `theme.mode` exists in settings with one legal value, `dark`. The type is a union of one so adding `light | system` later is a type change plus an audit, not a refactor.
- Theme JSON must contain a `dark` variant. `light` is optional and ignored with a warning until mode support ships.
- The Appearance page states plainly: "BetterShape ships dark only. Themes change the palette, not the mode."
- DESIGN.md and `design-system-baseline.md` are amended in the same PR. The line "dark only, do not add light-mode branches" stays; a new line says colors come from the theme engine, and components may not read palette seeds directly.
- Record this as ADR-18 in the plan: "Dark-only mode, mode-parametric tokens."

## 5. Design

### 5.1 Token layers

Today's 171 declarations split cleanly:

| Layer | Examples | Source |
| --- | --- | --- |
| Palette seeds | `neutral`, `ink`, `primary`, `success`, `warning`, `error`, `info`, `interactive`, `diffAdd`, `diffDelete` | Theme JSON |
| Generated roles | `surface-0..4`, `settings-card`, `chrome`, `sidebar`, `editor`, `text-*`, `border-*`, `accent*`, `success/warn/danger/info`, `added/modified/removed`, `diff-*-bg`, `scrollbar`, `pill-*` | Engine |
| Overrides | `tab-indicator`, `incognito*`, `window-stroke`, `overlay-scrim`, `menu-shadow` | Theme JSON `overrides`, or engine defaults |
| Static | geometry, radii, spacing, type scale, motion, z-index, dimensions | Hand-written, never themed |

Roughly 90 of the 171 declarations are colors. The other 80 stay exactly where they are. That is the migration boundary: **the engine owns color, the stylesheet owns everything else.**

The 131 component hex literals are out of scope for the first pass and get a lint rule instead (see 5.8).

### 5.2 TypeScript engine

New module `lib/theme/`:

```
lib/theme/
  color.ts        hex <-> oklch, scale, neutral scale, blend, withAlpha, shift, luminance, readableOn
  types.ts        ThemeFile, Palette, Variant, TokenName
  resolve.ts      resolveTheme(palette, isDark) -> Record<TokenName, string>
  css.ts          themeToCss(tokens) -> string, with stable ordering
  loader.ts       built-ins, custom files, validation, errors
  storage.ts      cached CSS per theme id, versioned key
  index.ts        public surface
```

`resolveTheme` is a pure function. Given the same palette it returns the same tokens, which is what makes snapshot tests possible.

### 5.3 The generated token set

Ported role for role from OpenCode, renamed to BetterShape's existing vocabulary where one exists, so components do not change:

| BetterShape token | Derivation |
| --- | --- |
| `--surface-0` | `neutral[1]` (background base) |
| `--surface-1` | `neutral[1]` |
| `--surface-2` | `neutral[2]` |
| `--surface-3` | `neutral[3]` |
| `--surface-4` | `neutral[4]` |
| `--settings-card` | `neutral[4]` |
| `--chrome` | `neutral[1]` |
| `--sidebar` | `neutral[3]` |
| `--editor` | `neutral[0]` |
| `--base` | `neutral[11]` (foreground) |
| `--panel` | `neutral[1]` |
| `--panel-secondary` | `neutral[2]` |
| `--panel-active` / `--panel-hover` | `withAlpha(ink, 0.06 / 0.04)` |
| `--text-primary` | `neutral[10]` |
| `--text-secondary` | `neutral[8]` |
| `--text-muted` | `withAlpha(neutral[10], 0.48)` |
| `--text-disabled` | `withAlpha(neutral[10], 0.24)` |
| `--text-active` | `neutral[11]` |
| `--border` / `--border-subtle` / `--border-secondary` | `withAlpha(ink, 0.116 / 0.062 / 0.075)` |
| `--accent` | `primary[8]` |
| `--accent-hover` | `primary[9]` |
| `--accent-text` | `primary[10]` |
| `--accent-text-hover` | `primary[11]` |
| `--accent-text-bg` | `withAlpha(primary[10], 0.16)` |
| `--accent-fg`, `--action-label` | `readableOn(primary[8])` |
| `--success` / `--warn` / `--danger` / `--info` | `success[6]` / `warning[6]` / `error[6]` / `info[6]` |
| `--added` / `--modified` / `--removed` | `diffAdd[5]` / `modified[5]` / `diffDelete[5]` |
| `--diff-added-line-bg` | `withAlpha(diffAdd[4], 0.15)` |
| `--diff-removed-line-bg` | `withAlpha(diffDelete[4], 0.15)` |
| `--scrollbar` / `--scrollbar-hover` | `withAlpha(ink, 0.10 / 0.18)` |
| `--focus` | `--accent` |
| `--pill-*` | derived, as today |

Three BetterShape-specific decisions:

1. **`--modified` gets its own seed.** Today it is `#e2c08d`. Deriving it from warning produces the same family, but git modified should stay distinguishable from "warning" UI. Seed it as `modified` with a fallback to a hue-shifted warning.
2. **The incognito palette stays an override.** Purple is a product signal, not a theme color. A theme may override it; the engine does not derive it.
3. **`--window-stroke` and `--menu-shadow` stay static.** They encode the window chrome, not the palette.

### 5.4 Theme file format

One format, desktop first, matching OpenCode's desktop JSON so a theme written for OpenCode can be dropped in with a rename:

```json
{
  "$schema": "./theme.schema.json",
  "name": "Tokyonight",
  "id": "tokyonight",
  "dark": {
    "palette": {
      "neutral": "#1a1b26", "ink": "#c0caf5",
      "primary": "#7aa2f7", "success": "#9ece6a",
      "warning": "#e0af68", "error": "#f7768e",
      "info": "#7dcfff", "interactive": "#7aa2f7",
      "diffAdd": "#9ece6a", "diffDelete": "#f7768e"
    },
    "overrides": { "tab-indicator": "#ff9e64" }
  }
}
```

Rules:

- `id` must match `^[a-z0-9-]+$` and be unique after load; a duplicate id is a load error naming both files.
- `palette` keys are validated; unknown keys warn, do not fail.
- `seeds` is accepted as an alias for `palette` for OpenCode compatibility.
- `overrides` values may be hex, `rgb()`, `hsl()`, or `var(--token)`; anything else is rejected with the token name.
- Missing `dark` is a load error. Present `light` is ignored with a warning until mode support ships.
- A `$schema` file ships at `public/theme.schema.json` and `lib/theme/theme.schema.json` for editors.

### 5.5 Built-in themes

Four, chosen to prove the engine rather than to fill a menu:

1. `bettershape` (default). Seeds derived from today's tokens. **The failure condition for the whole dossier is that `bettershape` does not reproduce today's computed colors within a small documented delta.** A golden test compares the generated CSS against a checked-in snapshot of the current palette.
2. `tokyonight`, `gruvbox`, `catppuccin-macchiato`, ported from OpenCode's files under their MIT license with attribution in `lib/theme/themes/README.md`.
3. No `system` theme.
4. `amoled` optional if the first three land cleanly.

The `bettershape` theme is the migration oracle. If it cannot reproduce today, the mapping table is wrong.

### 5.6 Custom themes

- Directories, in order: bundled, then `<app config>/themes/*.json`, then `<project>/.bettershape/themes/*.json`. Later overrides earlier by id.
- Settings > Appearance lists every loaded theme with a swatch of four tokens and a "Custom" badge.
- "Import from file" and "Import from URL" (URL only with a clear warning that the app will fetch it once). Both validate before saving.
- "Open themes folder" reveals the directory in the OS file manager.
- Reload themes without an app restart: a file watcher on the user theme directory with a 300ms debounce, same as the settings watcher pattern already used.
- A theme that fails to load appears in the list greyed out with its error, and never breaks the active theme.
- Custom themes are read-only in the UI. Editing happens in the JSON, in the editor, with the schema attached for completion.

### 5.7 Applying a theme without a flash

- `themeToCss` output is cached in `localStorage` under `bettershape-theme-css-v1-<id>` plus a schema version.
- An inline script in `app/layout.tsx` runs before paint: reads `settings.theme.id`, looks up cached CSS, injects it into `<style id="bettershape-theme">`, sets `data-theme` and `color-scheme`. On a cache miss it injects the default theme's cached CSS, and the provider regenerates after hydration.
- The provider is a small React context: current theme id, setTheme, list, reload. It writes CSS and updates the cache on change.
- No `localStorage` as the source of truth. Settings file is the source; `localStorage` is only the paint cache.
- A test mirrors OpenCode's `theme-preload.test.ts`: first paint with each stored state produces the expected background color.

### 5.8 Terminal, editor, markdown, and the hex lint

- **Terminal**: extend the theme file with an optional `terminal` block (16 ANSI colors plus cursor and selection). When absent, derive: black/white from neutral, red/yellow/green/blue/magenta/cyan from error/warning/success/interactive/info/primary, bright variants from scale step 8. The existing `MutationObserver` repaints on theme change; keep it, and add a test that all 16 keys resolve.
- **Editor**: `features/editor/ui/codemirror/theme.ts` already uses tokens. No change beyond confirming every tag maps to a token and none to a literal. If a tag needs a new color, add a token, not a hex.
- **Markdown syntax**: `lib/ui/syntax-theme.ts` reads tokens. Same rule.
- **Preview design tool**: its color panel produces arbitrary colors for the page being designed, not app chrome. Exempt, and documented as exempt in `DESIGN.md`.
- **Lint rule**: a node script (`scripts/check-theme-literals.mjs`) fails when a hex literal appears in `features/`, `components/`, or `lib/` outside `lib/theme/` and an allowlist file. Wire it into `npm run lint`. The allowlist starts with the current 131 literals as `pending`, and the file must only ever shrink. This is how the migration finishes without a big-bang PR.

### 5.9 The Appearance page

New `features/settings/ui/appearance/`, added to `SETTINGS_NAV` under a new `Appearance` entry in the Application group (the deep link already exists and currently redirects).

Sections:

1. Theme grid, 2 columns, each card a 4-token swatch plus name and Custom badge.
2. Density and font size stay where they are (editor settings); link across.
3. "Reduce motion" toggle that sets `data-reduce-motion` and is honored by `transitions.css`.
4. A line of copy: "BetterShape ships dark only."
5. Advanced: theme folder path, reload, import, open folder.

### 5.10 Settings

```ts
theme: {
  id: string;          // default "bettershape"
  mode: "dark";        // union of one until light ships
}
```

Under D01-B5 versioning, with a migration from today's `colorTheme: "dark"` key. Unknown id falls back to `bettershape` with a one-time notice.

## 6. Files

New:

- `lib/theme/color.ts`, `types.ts`, `resolve.ts`, `css.ts`, `loader.ts`, `storage.ts`, `index.ts`
- `lib/theme/themes/{bettershape,tokyonight,gruvbox,catppuccin-macchiato}.json`
- `lib/theme/theme.schema.json`, copied to `public/theme.schema.json`
- `lib/theme/resolve.test.ts`, `loader.test.ts`, `preload.test.ts`
- `features/settings/ui/appearance/{page,theme-card,import-dialog}.tsx`
- `scripts/check-theme-literals.mjs`

Modified:

- `app/globals.css`: the color declarations become `var(--...)` references to tokens the engine injects; static tokens stay. The `@theme inline` block keeps its shape.
- `app/layout.tsx`: inline preload script, `data-theme`, provider mount.
- `lib/settings/store.ts`: `theme` section, migration, remove `paintDarkTheme` hardcoding.
- `lib/settings/themes.ts`: either deleted or reduced to a re-export of the loader.
- `features/settings/ui/shared/nav.ts`: Appearance entry.
- `features/terminal/ui/terminal.tsx`: read the generated ANSI set.
- `DESIGN.md`, `engineering/design-system-baseline.md`: token provenance, the lint rule, the dark-only statement.
- `package.json`: `lint` includes the literal check.

## 7. Port plan

### T0 - engine and oracle (5d)

- `color.ts` ported from `packages/ui/src/theme/color.ts` (OKLCH conversions, `generateScale`, `generateNeutralScale`, `blend`, `withAlpha`, `shift`, `readableOn`).
- `resolve.ts` mapping table from 5.3, with every token covered.
- `bettershape.json` seeds tuned until the generated CSS matches today's palette within the documented delta. Snapshot test locks it.
- No UI yet. The app still reads `globals.css` literals.

### T1 - wiring and preload (3d)

- `globals.css` color declarations switch to injected tokens.
- Provider, cache, inline preload, `data-theme`.
- Verify no flash in a cold start and in a theme change.
- This is the risky stage: every color on screen changes source at once. Ship behind a settings flag (`theme.engine: true`) for one release if the diff is noisy.

### T2 - built-in themes and settings (3d)

- Three ported themes, Appearance page, settings persistence, migration from `colorTheme`.
- Swatches computed from the theme, not hardcoded.

### T3 - custom themes (3d)

- Loader directories, validation errors, import from file and URL, watcher, reload, open folder.
- Schema publication.

### T4 - terminal, editor, markdown, lint (2d)

- ANSI derivation and repaint test.
- Confirm editor and markdown are fully tokenized.
- Literal lint with the shrinking allowlist.

Total 16 days.

## 8. Acceptance criteria

- With `bettershape` selected, the rendered palette matches today's within the documented delta, locked by a snapshot test.
- Selecting any built-in theme repaints the entire app, including editor, markdown code blocks, terminal ANSI colors, diffs, git status colors, and the preview chrome, with no reload.
- A custom theme in the user theme directory appears in the list after a reload, and an invalid one shows its error without affecting the active theme.
- A theme file written for OpenCode desktop (palette plus overrides) loads with no edits beyond its `id`.
- First paint never shows the wrong palette: the preload test covers cold start, cached theme, missing cache, and corrupt cache.
- Every color token in `globals.css` is either generated or declared as a static override; no color token is left as a literal in the `:root` block.
- `npm run lint` fails on a new hex literal in `features/`, `components/`, or `lib/` outside `lib/theme/`.
- Settings migration turns `colorTheme: "dark"` into `theme: { id: "bettershape", mode: "dark" }` and survives a downgrade.
- The Appearance page shows the dark-only statement and lists every loaded theme with a computed swatch.
- No component reads a palette seed; components only read semantic tokens. A grep test enforces it.

## 9. Traps

- **Do not port the mode switcher.** The engine takes `isDark` because the math needs it. Shipping `light` without auditing shadows, scrims, screenshots, and 19 component files produces a broken second mode.
- **Do not theme by CSS class per theme.** 37 classes of overrides is how themes rot. One generated `:root` block per theme.
- **Do not let generated tokens be overridden silently at the component level.** A component that sets `background: #181818` breaks every theme. The lint rule exists for this.
- **Do not skip the oracle.** Without a `bettershape` theme that reproduces today, every visual regression after T1 is unattributable.
- **Do not store the theme in `localStorage` as the source of truth.** It desynchronizes between windows and survives settings resets.
- **Do not inject CSS on every render.** Generate on theme change, cache the string, memoize.
- **Do not port the TUI theme format into the GUI.** Two formats already exist upstream; BetterShape gets one.
- **Do not forget the terminal.** A themed app with an unthemed terminal looks broken, and the observer is already there.
- **Do not make contrast a vibe.** `readableOn` is a luminance computation; use it for every "on color" token, and add a contrast assertion (4.5:1 for body text, 3:1 for large text and UI borders) to the resolver tests for each built-in theme.

## 10. Effort

| Stage | Days |
| --- | ---: |
| T0 engine and oracle | 5 |
| T1 wiring and preload | 3 |
| T2 built-in themes and settings | 3 |
| T3 custom themes | 3 |
| T4 terminal, editor, markdown, lint | 2 |
| **Total** | **16** |

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
The plan lives on `milestone/v26-11-17`, not on the base branch. If `engineering/dossiers/` is not in your checkout, run `git fetch origin milestone/v26-11-17` and read the dossier from that ref.

Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/18-theme-system.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D18: Theme system. Scope: a seed-palette to OKLCH-scale to semantic-token engine, the bettershape theme that reproduces the current palette, three ported built-in themes, custom theme loading with validation, an Appearance settings page, first-paint caching with no flash, terminal ANSI derivation, and the hex-literal lint rule. BetterShape ships dark only in this dossier; the engine takes an isDark parameter but no light mode, no mode switcher, and no system theme. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/18-theme-system` from the current `draft/mega-absorb-all` only after dossier 17 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
