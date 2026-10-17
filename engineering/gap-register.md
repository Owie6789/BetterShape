# Gap register

This is the closing artifact for "close the gaps". Every defect found while reading BetterShape against the three upstreams and the mausCode roadmap is listed here with evidence, severity, and an owner. A gap is closed when it either has a dossier that will fix it, or a written decision that accepts it.

Nothing is allowed to be listed as "later" without a reason.

Severity:

- **S1**: data loss, security, or silent wrong execution.
- **S2**: wrong behavior a user will hit in normal work.
- **S3**: rough edge or missing capability with a workaround.

Verified against BetterShape at `289b134`. Owners use the revision 6 dossier numbers.

## 1. Defects with an owner

| id | gap | evidence | sev | owner |
| --- | --- | --- | --- | --- |
| G-01 | One global composer draft (`bettershape-chat-input`), so switching chats carries the text across | `features/chat/lib/use-chat-session.ts:166,799,841` | S2 | D07 |
| G-02 | Follow-up queue is React state only; a reload drops queued prompts | `features/chat/lib/use-chat-session.ts:171`, `features/chat/lib/message-queue.ts` | S2 | D09 |
| G-03 | Checkpoint restore truncates the message array and rewrites files with no workspace identity check | `src-tauri/src/agent/commands/conversation.rs:198` | S1 | D15 |
| G-04 | Worktree creation failure continues in the shared checkout | `src-tauri/src/agent/checkout.rs:37-57` | S1 | D14 |
| G-05 | No MCP server, so no external agent can drive the app | `lib/mcp/` has a client only | S3 | D25 |
| G-06 | Subagent concurrency is a global cap of 4 with no queue, fairness, or setting | `src-tauri/src/agent/subagents.rs:22,133` | S3 | D25 |
| G-07 | `page_shot` rejects non-loopback URLs, so it cannot see a remote preview | `src-tauri/src/agent/tools/page_shot.rs:16,44` | S2 | D33 |
| G-08 | Updater always reports up to date; install is a stub that tells the user to download manually | `lib/window/updater.ts:74-92` | S2 | D01-A1, D32 |
| G-09 | Editor menu items dispatch events that only two components handle; navigation actions do nothing | `features/agent/workbench/titlebar/menu-actions.ts:150-171`, listeners at `features/editor/ui/codemirror/editor.tsx:613`, `features/editor/ui/main/editor.tsx:333` | S3 | D01-A2 |
| G-10 | No offline cache for favicons or MCP registry results | `components/ui/favicon.tsx:28`, `src-tauri/src/mcp/registry.rs:256` | S3 | D01-A3 |
| G-11 | Composio base URL is hardcoded | `lib/plugins/api.ts:11` | S3 | D01-A4 |
| G-12 | `agent-design-pick-pending` is emitted and never consumed, so a design pick can stall | `src-tauri/src/agent/tools/dispatch/meta.rs:1347` (no TS listener) | S2 | D01-A5 |
| G-13 | Errors are strings; `AppError::Message` is used at 461 sites and serializes as text | `src-tauri/src/core/error.rs:7,26` | S2 | D02 |
| G-14 | Tool status is partly inferred by substring matching on text | `features/chat/ui/blocks/turn.tsx:154` | S3 | D02 |
| G-15 | 131 hex literals in 19 files outside the palette, with no lint to stop new ones; `globals.css` still carries a stale "light theme overrides" comment | `DESIGN.md:93`, `app/globals.css:58` | S3 | D18 |
| G-16 | Theme registry accepts exactly one id and discards anything else | `lib/settings/themes.ts:10-44` | S3 | D18 |
| G-17 | Terminal ANSI colors are partly hardcoded and drift from CSS tokens | `features/terminal/ui/terminal.tsx:213-236` | S3 | D18 |
| G-18 | Settings are one unversioned JSON blob, so a downgrade can destroy newer keys | `lib/settings/store.ts` | S2 | D01-B5 |
| G-19 | No event-name audit; 37 statically named events, some unconsumed | D01 section B4 | S3 | D01-B4 |
| G-20 | Transcripts are JSON files merged on save with no index or query path | `src-tauri/src/agent/commands/history.rs` | S2 at scale | D01-B1, D28 |
| G-21 | No command idempotency; a retried mutating command can run twice | D01 section B2 | S2 | D01-B2 |
| G-22 | Turn lifecycle is spread across `run_turn`, `streaming`, `send_chat`, `approvals`, and a 1,927-line hook | D01 section B3 | S2 | D01-B3, D08 |
| G-23 | No remote execution, and no error type that could describe a remote failure | every tool reads local paths | S3 | D33, D02 |
| G-24 | Worktree slugs truncate at 24 characters, so similar long names collide | `src-tauri/src/agent/checkout.rs:59-72` | S3 | D14 |
| G-25 | No target concept; a project is a local path | `lib/settings/store.ts` project shape | S3 | D33 |
| G-26 | Reasoning effort is a hardcoded per-family table, with no verbosity and no per-model override | `src-tauri/src/agent/commands/streaming.rs:1301-1355` | S3 | D20 |
| G-27 | Agents and workflows cannot pin a model variant | `send_chat.rs`, subagent model allowlist | S3 | D20 |
| G-28 | Revision 4 counts were stale after four dossiers were added | `engineering/upstream-port-plan.md` | S3 | closed in revision 5 |
| G-29 | "Plugin" means a Composio connector; there is no manifest, capability, grant, event bus, or extension runtime | `lib/plugins/api.ts`, `src-tauri/src/agent/tools/plugins.rs`, `features/settings/ui/shared/nav.ts:64` | S3 | D05 |
| G-30 | No session export, import, or move; conversations are merge-on-save JSON with no integrity check | `src-tauri/src/agent/commands/history.rs:72-120` | S2 | D06 |
| G-31 | No permission rule table; a 21-name trust list plus in-memory approvals, lost on restart | `src-tauri/src/agent/tools/dispatch/mod.rs:26`, `src-tauri/src/agent/models/mod.rs:275,280` | S1 | D03 |
| G-32 | Two keyring namespaces plus plaintext `apiKey` fields remain in settings; no redaction at serialization | `src-tauri/src/commands/ai_byok.rs:26`, `src-tauri/src/mcp/credentials.rs:3`, `lib/settings/store.ts:441-456` | S1 | D04 |
| G-33 | No durable run or event record; restart loses pending approvals and in-flight turns | `src-tauri/src/agent/models/mod.rs:258-280`, `src-tauri/src/agent/commands/send_chat.rs:291` | S2 | D08 |
| G-34 | No instruction loader; `<user_rules>` is appended unbounded and only the repo map has a token budget | `src-tauri/src/agent/commands/send_chat.rs:471-478`, `src-tauri/src/agent/context/mod.rs` | S2 | D12 |
| G-35 | No research egress policy or record; the browser is the only web path and it is not governed per session | `src-tauri/src/agent/security/urls.rs`, `src-tauri/src/agent/tools/browse.rs:134` | S3 | D27 |
| G-36 | No memory and no cross-session search; a decision from an old chat is unfindable | `src-tauri/src/agent/commands/history.rs`, no search command | S3 | D28 |
| G-37 | Skills can be vendored but not installed, enabled, or shown to the model by disclosure | `.agents/skills/`, `scripts/ci/verify-skills.mjs`, no Rust skills module | S3 | D29 |
| G-38 | No import from Claude Code, Codex, Cursor, or VS Code; setup is retyped by hand | no import command in `src-tauri/src/commands/` | S3 | D30 |
| G-39 | No CI failure loop; one narrow `check_runs` read inside a git helper | `src-tauri/src/agent/commands/git_ai.rs:206` | S3 | D31 |
| G-40 | The critic fires on a markup heuristic, returns free text, and records nothing; `CRITIC_MODEL` is `auto` | `src-tauri/src/agent/commands/adversarial_review.rs:9-11,70-92` | S3 | D26 |
| G-41 | Release pipeline has no checksums or manifest verification, and a truncated artifact can publish | `scripts/release/*.mjs`, `.github/workflows/release.yml` | S2 | D32 |

## 2. Accepted gaps

These are deliberate. Each has a reason and, where relevant, an ADR.

| gap | decision | reason |
| --- | --- | --- |
| Light mode | Not shipped, engine supports it | ADR-18. Chrome, shadows, scrims, and screenshots are tuned for dark; a half-audited second mode is worse than none. Revisit as its own project. |
| LSP client | Not built; the dead menu items are deleted or made honest | A real LSP client is 2,000+ lines (lifecycle, JSON-RPC, document sync, diagnostics). D01-A2 removes the lie rather than half-building it. |
| Remote LSP and remote extensions | Out of scope for D33 | D33 covers session execution, file access, terminals, and previews. Remote language servers are a second project with their own latency and caching problems. |
| Repo sync to a remote target | Never | D33 clones or bundles on the remote side. A sync engine fights git and produces conflicts nobody can explain. |
| A daemon beyond the headless session host | Deferred | One binary per session host, supervised by the transport. A daemon with its own lifecycle is a second product. t3code's archive, checksum, lock, and 900 s launch are recorded in the ledger. |
| Telemetry and analytics | Never | User constraint. Failure logs stay local. |
| i18n | Not ported | No user request, and opencode's 40+ locale files would be a maintenance liability with no owner. mausCode step 41's i18n half is deferred for the same reason. |
| Windows and macOS sandboxes | Not offered | Daytona supports them; BetterShape's build, test, and preview assumptions are Linux-shaped. |
| Mobile, marketing, relay, Tailscale, ACP, Codex bridges | Not ported | Out of the product surface, recorded in plan section 11. |
| opencode `packages/containers` | Not ported | Five Dockerfiles for publishing artifacts. Not a runtime abstraction. |
| mausCode's tRPC router structure | Not ported | Electron and tRPC do not map onto Tauri commands; only the feature behavior is ported. |
| Multi-user collaboration | Not planned | No request, and it changes the storage model completely. |
| Two concurrent chats per project | Final stage of D22 only, per the two-pane decision | ADR-16 caps the split tree at two panes; one live chat until the last stage. |
| A plugin marketplace | Not planned | Install is local and explicit; hosting a registry is a service. D05 has no network install. |
| An auto-installing app updater | Not planned | D32 opens the release page. Silent install needs signing, a rollback story, and a threat model of its own. |

## 3. Research debt

Recorded so the next session does not repeat work or overstate what was read.

| item | state | impact |
| --- | --- | --- |
| mausCode repository | Read in full in an earlier pass; not re-cloned this session | Line numbers cited in D21 come from that pass. Re-clone at `9f1bc76` before editing D21. |
| t3code `packages/ssh/src/tunnel.ts` | Read in slices, 1,799 lines total | D33 uses the host key and launch patterns, not a line-by-line port. |
| opencode `packages/server/src/handlers/**` | Skimmed, not read line by line | No dossier depends on handler internals; the client/server shape is what matters. |
| Daytona exec route | Documented as the toolbox `process` module; the exact HTTP path is still to confirm from the API tab | Implementation detail inside D33 T2. SDK method names and the preview rules are verified. |
| boat API secondary pages | Overview read; pagination, limits, webhooks not read | D33 uses create, commands, files, host, stop, resume, ssh-keys only. |
| opencode plugin runtime internals | Documentation read; `packages/plugin/src` listing only | D05 ports the manifest, lifecycle, transforms, and events, not the module loader. |
| Dia motion and interaction | Only four vetted static images | D22 designs motion from the system's own tokens, not from Dia video. |
| Windows Snap internals | Public documentation only | D22 ports the behavior, not the implementation. |

## 4. How a gap closes

1. A dossier exists, and its acceptance criteria name the gap by id.
2. Or an accepted decision exists in this file and in the plan's decisions log.
3. The plan's dossier index lists the owner.
4. A test or a lint rule prevents the gap from returning where that is possible.

Current state: 41 defects, 40 with a dossier and 1 closed. 15 accepted gaps with a reason. 8 research items with a stated impact. No orphaned item.

## 5. Follow-ups this register creates

- Add `G-06` (subagent queueing) to D25's acceptance criteria, not just its inventory.
- Add `G-24` (slug collision) to D14's acceptance criteria.
- Add `G-19` (event audit) as a required test in D01-B4, not an optional one.
- D33 must cite `G-07` and `G-25` in its acceptance criteria.
- D18 must delete the stale light-theme comment in `globals.css` and document the literal lint in `DESIGN.md`, tracked as `G-15`.
- D03 and D04 must cite `G-31` and `G-32` respectively; both are S1 and both are mausCode critical gates.
- D05 must cite `G-29`; D06 must cite `G-30`; D08 must cite `G-33`; D12 must cite `G-34`.
