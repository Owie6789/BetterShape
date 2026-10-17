# Composition research

Images and source notes for D22 (tabs, panes, placement, detached composer) and D17 (tool calls and thinking).

Product pages could not be scraped for their images from this environment: text fetches strip them, direct image fetches return 500, and direct TLS to non-allowlisted hosts fails. The images here were collected through image search, inspected one by one, and are kept only as visual references, not as distributed assets.

Several candidate images were rejected: AI-generated "Dia vs Arc" comparison graphics, Arc screenshots mislabeled as Dia, and unrelated tab-manager art. What remains is either a photograph of the real product or a crop of it. Where the evidence is text rather than a picture, the claim in the dossier is written as behavior from a release note.

## dia/

| file | what it shows |
|---|---|
| `dia-browser-tab-groups-sidebar-ui-screen-1.png` | Authentic Dia sidebar with six expanded groups (Work, Support, DEV, QA, UAT, PROD). Emoji or favicon per group, tinted header rows, chevrons, member rows with favicons, a flat "New Tab" row at the bottom, and the centered "Ask anything..." composer with `+ Add tabs or files`, Skills, and Learn Skills. This is the source for group anatomy and for the composer's neutral, borderless surface. |
| `dia-browser-tab-groups-sidebar-ui-screen-3.png` | Authentic Dia split view: two panes side by side under one titlebar strip, tabs for both panes in the same row, the nav row showing both URLs (`emirhan.co` then `ja.mt`), a thin divider with a drag affordance, and a Chat toggle at the right edge. The precedent for per-pane surfaces and for a single strip that addresses the focused pane. |
| `dia-chat-panel-sources-and-composer.png` | Authentic Dia right-hand chat panel: a context chip for the active tab, preset question cards stacked above the conversation, an answer with a "Read reddit.com, apple.stackexchange.com, and 4 more" source disclosure row, and an "Ask another question..." composer. This is the source for the disclosure pattern and for the chat panel's narrow measure. |
| `dia-top-bar-pinned-tabs.jpg` | Authentic crop of the Dia top bar: five app-icon pills in one rounded container, the active pill filled with the site brand color (Spotify green) and the rest neutral, window controls at the left, the address bar directly beneath. This is the only pixel source for the top-bar pill shape used in D22 section 5. |

## Text sources

- `https://www.diabrowser.com/release-notes/1-9-0-tab-groups` (group behavior, storage shelf, color and emoji, hover preview)
- `https://www.diabrowser.com/release-notes/1-19-0-tab-groups-and-proactive-suggestions` (evolving automatic names, proactive morning suggestions)
- `https://www.diabrowser.com/release-notes/1-50-sunglow` (brand refresh, stop and resume, chat history search)
- `https://www.diabrowser.com/changelog/mac/1-53-0` (splitview and sidebar transition smoothing, deliberation depth)
- `https://www.diabrowser.com/updates` (1.53.0 and 1.52.0 strip polish)
- `https://browsercompany.substack.com/p/the-strategy-behind-dias-design` (design doctrine: familiarity, single obvious path, novelty budget)
- `https://herdr.dev/docs/concepts` (workspace, tab, pane, mouse-first)
- `https://github.com/devswha/herdr-web-ui/pull/602` (drag to split, drop zones, persistence, active half)
- Windows Snap Layouts and FancyZones behavior summaries from four how-to sources; conclusions are recorded in D22 section 8, no images relied on.

## Landing page copy

The marketing page confirms the product framing that D22 and D17 design against: "More than a browser. A better workday.", Morning Brief ("calendar, inbox, key links"), cross-tool synthesis into a shareable report, cross-tool answers, Profiles, Live Work, Better Meetings, Splits with remembered layouts, Decks, and auto-named Organized Tabs. The three `dia-reads` illustrations are paintings and report mockups, not browser chrome, so they are summarized here and not relied on for layout.
