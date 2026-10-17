# D23: SnapShot, preview browser, HTML renders, and MCP apps

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/23-snapshot-preview-and-html`) |
| Issue title | `D23: SnapShot, preview browser, HTML renders, and MCP apps` |
| Labels | `port`, `dossier:23`, `area:preview`, `size:M`, `stage:4` |
| Depends on | D13 |
| Blocks | none |
| Effort | 13 days |

**Port verdict: TAKE the screenshot-to-context flow and the preview device controls. TAKE the inline HTML render placement rule. DEFER MCP app views.**

These four surfaces look unrelated but share a property: they turn the app from a text window into something that can see and show. BetterShape has more of this than expected (design preview sandbox, HTML capture, page screenshots, embedded browser automation), so the dossier is mostly about the missing **glue**, not missing engines.

## 1. SnapShot

### What it is

A desktop-only capture flow in `apps/desktop/src/snapShot/`:

| file | role |
|---|---|
| `DesktopSnapShot.ts` | state machine, shortcuts, capture requests, config preview and apply |
| `snapShot.ts` | shared types, accessibility node caps (10,000 nodes), Windows virtual keys |
| `MacSnapShot.ts` | macOS window capture |
| `LinuxSnapShot.ts` | Linux capture with portal and Gnome session detection |
| `HyprlandSnapShot.ts`, `KdeSnapShot.ts`, `NiriSnapShot.ts` | compositor-specific backends |
| `RegionSnapShot.ts` + worker | interactive region selection |
| `SnapShotAccessibility.ts` + process/worker | accessibility tree extraction |
| `SnapShotTransition.ts` | overlay animation |
| `apps/desktop/src/ipc/methods/snapShot.ts` | IPC surface |

### Mechanism

1. A global shortcut (or a modifier-pair shortcut for systems where a chord is unavailable) starts a capture.
2. The desktop captures the active window, the full screen, or a region.
3. It reads the accessibility tree of the focused window, capped at 10,000 nodes and a maximum serialized size.
4. The resulting `DesktopSnapShot` becomes composer context: an image plus a structured description of the focused element and its window.
5. Pending captures are held in a `DesktopPendingSnapShot` so the renderer can attach them after a window transition.

The accessibility tree is the interesting part: it converts "screenshot of a dialog" into "dialog named X with buttons Y and Z", which a model can act on. It is also the part that is platform-specific and expensive.

### BetterShape today

- `src-tauri/src/agent/tools/page_shot.rs` captures the **in-app preview page** and places the image inline in the assistant message, after the first prose paragraph (a deliberate placement rule).
- `src-tauri/src/commands/preview/preview_render.rs` renders HTML to PNG with a timeout (15 s), max 1920x1080, emitting `CapturedPreview`.
- `browse.rs` automates the embedded browser and can screenshot pages.
- No OS-level screen capture and no accessibility tree.

### Port plan (6 days for v1)

1. **Region and window capture.** Use the `xcap` crate (cross-platform screen and window capture; Linux, macOS, Windows). This replaces five compositor-specific backends with one dependency, at the cost of some Wayland edge cases. Accept that trade and document it.
2. **Global shortcut.** Tauri's global-shortcut plugin, with a configurable chord and a conflict check against the keybinding registry (D13). If registration fails, show the same honest message t3 uses: "This shortcut is already used by the system or another app."
3. **Picker overlay.** A small always-on-top window for region selection, or a full-screen transparent overlay on the main window. Reuse the motion primitives.
4. **Context payload.** Attach to the composer as an image plus a text block: `{ app, window_title, bounds, captured_at }`. Skip the accessibility tree in v1. Add it later, platform by platform, behind a capability flag, starting with macOS (AXUIElement) and Windows (UIAutomation).
5. **Retention.** Screenshots go to the existing `media_stash` with a TTL. Do not persist them in the conversation JSON.

### Why not port the accessibility tree now

It is 40 percent of the SnapShot code and 100 percent of its platform risk. The screenshot alone already delivers the user-visible feature ("show the agent what I see"). Add the tree when there is evidence that screenshots alone are insufficient.

## 2. Preview browser

### Upstream inventory

| area | files | lines |
|---|---:|---:|
| `apps/server/src/preview/**` | 20 | 12,875 |
| `apps/web/src/browser/**` | 8 | - |
| `apps/web/src/previewStateStore.ts`, `previewMiniPlayerStore.ts` | 2 | - |
| `apps/server/src/preview/SessionControl.ts` | 1 | 148 |

Server components: `Manager`, `PortScanner`, `PreviewBrowser`, `PreviewBrowserHost`, `ServerBrowser`, `ServerBrowserContexts`, `ServerBrowserPage`, `ServerBrowserStream`, `DesktopBrowserChannel`, `SessionControl`. Web components: `ElectronBrowserHost`, `HostedBrowserWebview`, `BrowserDeviceToolbar`, `BrowserViewportResizeHandles`, `ScreenRotationIcon`, `BrowserProfileReporter`, `BrowserSurfaceSlot`, `BrowserFaviconStore`, `BrowserHistoryStore`.

### What the architecture buys

The browser runs on the **server** and streams to any client. That is what lets a phone attach to the same live preview, and it is why the device toolbar, rotation, viewport resize, profile reporting, and session control exist. It is also 12,875 lines of streaming, contexts, and page lifecycle.

BetterShape's preview is local: a webview plus a Tauri command bridge (`design_bridge`, `design_sandbox`, `design_proxy`, `design_source`, `preview_render`, 3,500 lines). That is the right architecture for a single-user desktop app.

### Port plan (4 days)

1. **Device toolbar.** Preset viewports (iPhone, iPad, Android variants), a custom size, rotation, and a zoom control. Implement as a wrapper around the existing webview, not a new browser.
2. **Viewport resize handles.** Drag edges to resize; persist per project.
3. **History and favicon.** BetterShape has no preview history. Add a small local store: URL, title, favicon, visited_at, capped at 200. This makes the preview panel feel like a browser instead of a tab.
4. **Session control actions.** Reload, hard reload, clear cache, open devtools (already available in Tauri), zoom reset.
5. **Skip server-side streaming.** It only pays off for multi-client and remote access, which are out of scope.

## 3. HTML renders

### Mechanism

`HtmlRender.ts` (460) plus `headlessChrome.ts` (696):

- Render agent-provided HTML to an image so it can appear inline in the chat.
- Bootstrap the document with theme tokens (`htmlRenderTheme`, `injectHtmlRenderBootstrap`) so a render matches the app's appearance.
- Measure the page at configured widths and font sets (`HTML_RENDER_MEASURE_WIDTHS`, `HTML_RENDER_MEASURE_FONTS`), clamp height, cap title length.
- Limits: image 10 MiB, page 25 MiB. Local images resolved through `attachmentPaths` and `attachmentStore`; missing images produce a typed error listing every missing path.
- `publicProxy.ts` serves allowlisted public assets so a render cannot fetch arbitrary local files.

### BetterShape today

`capture_html_preview` already renders HTML to PNG with a 15 second timeout and 1920x1080 cap. `page_shot.rs` handles preview pages. What is missing:

1. **Inline placement.** BetterShape places a page shot after the first prose paragraph. t3 does the same, and the rule is worth making universal for every generated image, not just page shots.
2. **Theme bootstrap.** Generated HTML should inherit BetterShape's dark tokens by default, otherwise every render looks like a different product.
3. **Local asset resolution with an explicit allowlist.** A render that references `file:///etc/passwd` must fail, not embed.
4. **Size and count limits with typed errors.** "3 images missing: a.png, b.png, c.png" beats a blank render.

### Port plan (3 days)

1. Extract a `capture_html` module from the existing command, with an options struct: width, height, theme tokens, full document flag, timeout.
2. Inject a bootstrap style block with the current theme variables (BetterShape is dark-only; this is simpler than upstream).
3. Enforce: max 25 MiB page, max 10 MiB image, max 5 local images, allowlisted roots only.
4. Reuse the existing inline placement helper for all generated images.
5. Tests: missing image, oversized page, timeout, theme injection.

## 4. MCP app views

### Mechanism

`mcpApps/McpAppRequests.ts`, `McpAppModelContext.ts`, `McpAppSnapshot.ts`. When an MCP tool returns an app view, the chat renders it as an interactive surface. The view can call tools back (`callTool`), read resources, and update the model context. A stopped session is reported, never started, because "an app view must not spend a provider turn".

That last rule is the design principle: UI from a tool is free to render, but it cannot silently trigger model work.

### BetterShape today

MCP client only. Tool results render as text or JSON. No app views.

### Port plan (deferred, 10+ days)

1. Requires D25's MCP server or at least a stable tool-result envelope.
2. Requires a sandboxed iframe with a message-passing protocol to the host.
3. Requires a permission model: which tools may an app view call, and with what arguments.
4. Security is the dominant cost. Defer until the rest of the plan is stable; a half-built app surface is an injection vector.

## 5. Tests worth porting

| upstream test | assertion |
|---|---|
| `snapShot.test.ts`, `DesktopSnapShot.test.ts` | shortcut availability, capture state transitions |
| `RegionSnapShot.test.ts` | region normalization and DPI |
| `HtmlRender.test.ts` (396) | theme injection, size caps, missing images |
| `publicProxy.test.ts` | allowlist enforcement |
| `PreviewBrowserHost.test.ts`, `SessionControl.test.ts` | lifecycle, reload, teardown |
| `BrowserDeviceToolbar.test.ts` | presets and rotation math |

## 6. Traps

- **Screenshots are sensitive.** A screenshot can contain passwords, private messages, or another person's data. Capture only the active window or a user-selected region, never the whole screen by default. Show a preview before attaching. Delete on discard.
- **Privacy of the accessibility tree.** It can contain the text of every field in the window. That is why it should be opt-in and scoped to the focused element, not the whole tree.
- **Wayland.** Region capture is inconsistent across compositors. Test on at least Gnome and KDE, and degrade to window capture with a clear message.
- **HTML renders can exfiltrate.** A generated page that fetches a remote URL leaks the fact that the user viewed it. Block network access in the render sandbox except for a documented allowlist.
- **Do not build a remote browser.** Local webview plus device toolbar covers the user need at 5 percent of the cost.

## 7. Effort

| area | days |
|---|---:|
| SnapShot v1 (region, window, shortcut, context) | 6 |
| preview device toolbar, history, session control | 4 |
| HTML render hardening and theme bootstrap | 3 |
| accessibility tree (deferred) | 8 |
| MCP app views (deferred) | 10+ |
| **total now** | **13** |

## 8. Acceptance criteria

1. A global shortcut captures a selected region and attaches it to the composer as an image with app and window metadata.
2. Capture is refused or degrades gracefully when the platform or compositor does not support it, with an actionable message.
3. A screenshot is never written into the conversation JSON and can be deleted from the media stash.
4. The preview device toolbar changes viewport size and rotation without reloading the page, and the choice persists per project.
5. Generated HTML renders with the app theme, refuses to embed files outside allowlisted roots, and reports every missing image by name.
6. A render that times out returns a typed error, not a blank image.

---

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/23-snapshot-preview-and-html.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D23: SnapShot, preview browser, HTML renders, and MCP apps. Scope: xcap-based region and window capture, the preview device toolbar and history, and typed HTML render errors with size caps. Do not implement other dossiers, do not refactor unrelated code, and do not add a dependency without a named reason recorded in the pull request.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/23-snapshot-preview-and-html` from the current `draft/mega-absorb-all` only after dossier 22 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify. If you touched Rust, also run cargo fmt --check and cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
