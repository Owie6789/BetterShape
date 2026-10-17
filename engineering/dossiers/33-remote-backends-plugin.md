# D33: Remote backends as plugins that move sessions

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/33-remote-backends-plugin`) |
| Roadmap source | mausCode step 34 (issue #36), rewritten as a session-moving plugin |
| Issue title | `D33: Remote backends as plugins that move sessions` |
| Labels | `port`, `dossier:33`, `area:runtime`, `size:XL`, `stage:6` |
| Depends on | D05 (plugin host), D06 (session bundles and the move contract), D04 (secrets), D08 (run records), D14 (worktrees) |
| Blocks | nothing |
| Effort | 34 days |

**Port verdict: BUILD, do not port. No upstream ships this. t3code has an SSH tunnel plus a remote runner launched from a versioned archive; opencode has a self-hostable HTTP server. Neither moves a whole session between machines. The correction that shapes this dossier is that a remote backend is a plugin that moves a session, not a `Runner` compiled into the tool layer.**

Consequences of that correction, stated once:

1. The agent loop and the tools run **where the session is**. Moving a session moves execution, not just file I/O.
2. A transport is a plugin capability (`remote.transport`), and the first-party transports are `builtin` plugins that register through the same host (D05).
3. The session's state moves as a D06 bundle, and the desktop reattaches to the session host with a cursor. There is no "local loop, remote tools" mode; that is a different product with a different failure model.

Two vendor facts to keep straight: **Box is boat** (`box.ascii.dev` redirects to `boat.dev`, legacy `box_` keys still work), and **Daytona's core closed in June 2026** (the hosted API works; the repository is frozen, so a dependency is a vendor dependency).

## 1. What the upstreams actually have

| Repo | Remote execution | What exists |
| --- | --- | --- |
| mausCode | none | Electron, local only |
| t3code | SSH | `packages/ssh/src/tunnel.ts` 1,799 lines: upload a ~70 MB release archive, verify a checksum, take a lock, launch a remote runner on port 3773 with a 900 s timeout. `packages/tailscale` exposes a tailnet address. |
| opencode | self-hosted server | `packages/server` serves fs, pty, message, permission, and event over HTTP. `packages/containers` is five Dockerfiles, 36 KB, not a runtime abstraction. |

t3code's shape is the closest prior art to this dossier: versioned payload, checksum, lock, remote process, client reconnect. What it lacks is session portability: its remote side is a runner for a project, not a session that can move back.

## 2. The session host model

```
desktop (UI + event consumption)
   |  D06 loopback protocol (HTTP + SSE), per-session token
   v
session host  -- local: in-process thread pool
              -- remote: bettershape-runner on the target
   |
   v
workspace (git checkout, PTY, previews)
```

### 2.1 Host contract

A session host implements the D06 routes plus four host-only routes:

| Route | Purpose |
| --- | --- |
| `POST /host/attach` | `{sessionId, cursor}`; returns the host's capability list and the current cursor |
| `POST /host/detach` | flush, stop accepting writes, keep the process for a grace period |
| `GET /host/health` | runner version, workspace HEAD, disk free, active turns |
| `POST /host/drain` | finish the current turn, then exit; used before a move away |

The desktop talks to a local host over the same in-process API, not HTTP; the trait boundary is `SessionHost`, with `LocalHost` and `RemoteHost` implementations. The protocol is pinned to `apiVersion: 1`, and a host with a different major version refuses to attach with `host_version_mismatch`.

### 2.2 The transport capability

A `remote.transport` plugin implements five methods through D05's `capability.invoke`:

```json
{ "capability": "remote.transport", "method": "plan",     "params": { "sessionId": "...", "sizeHintBytes": 42000000 } }
{ "capability": "remote.transport", "method": "prepare",  "params": { "sessionId": "...", "options": { "class": "linux", "region": "eu" } } }
{ "capability": "remote.transport", "method": "upload",   "params": { "handle": "...", "chunk": 7, "bytes": "base64..." } }
{ "capability": "remote.transport", "method": "activate", "params": { "handle": "...", "runnerVersion": "0.9.4", "bundleHash": "sha256:..." } }
{ "capability": "remote.transport", "method": "dispose",  "params": { "handle": "...", "keepDisk": true } }
```

`plan` returns `MovePlan` data: target label, provision cost estimate, expected latency class, bytes to transfer, and the files that will not move. `prepare` returns a handle and a root path. `upload` is chunked and resumable (the host retries chunk N on failure). `activate` starts the runner, verifies the bundle hash, and returns `{attachUrl, token, ports}`. `dispose` stops or destroys.

A third-party transport is a D05 sidecar that implements the same methods for a company's internal API. A first-party transport is `builtin: true`, `tier: declarative`, `entry: { "transport": "ssh" | "daytona" | "boat" }`; the host maps the id to Rust code. Same manifest, same permission sheet, same failure types.

### 2.3 Workspace transfer

The bundle is the session (D06). The workspace is transferred separately because it can be large and is often already reachable:

1. If the target has network access to the origin, `git clone --no-checkout <origin>` then `git checkout <head>`, then apply a patch of uncommitted changes (tracked and untracked, minus ignored files).
2. If the origin is private and the target has no credentials, create a `git bundle` of the required refs locally and upload it; `git clone <bundle>` on the target.
3. Verify `git rev-parse HEAD` on both sides and the patch's `git apply --check`. A mismatch aborts the move before `activate`.
4. Large files in `.git` are accepted; large working-tree binaries are not transferred unless tracked. `git lfs` is not supported in v1 and is named in the plan when detected.

The reverse direction uses the same code with the sides swapped. Unpushed commits made on the remote are bundled back and applied to the local checkout; a conflict aborts with `move_back_conflict` and leaves the remote authoritative until the user resolves it.

### 2.4 Runner packaging

`bettershape-runner` is the same binary with `--headless --session <id>`, built for `x86_64-unknown-linux-gnu` and `aarch64-unknown-linux-gnu` in `release.yml` (D32). It is served from the same release as the app, so version skew is visible. Upload is one file plus a manifest; the checksum and version are verified before execution. t3code's 70 MB archive is the cautionary number: ship a stripped binary, not the app bundle.

Remote requirements, checked in `prepare` before any upload: Linux, `git`, `sh`, writable root, `sha256sum`, and at least 2 GiB free. The runner writes to `<root>/.bettershape/runner/<version>/` and takes a per-session lock file.

### 2.5 Lifecycle and cost

- States: `absent`, `preparing`, `uploading`, `activating`, `active`, `draining`, `stopped`, `error`, `unknown`.
- Auto-stop: on app quit (default on), after 30 idle minutes (default on), never during a turn; a stopped sandbox keeps its disk.
- Cost: elapsed machine time times the provider's published rate, labeled estimate. boat's $20/month floor (555 machine-hours) is shown in the settings copy, not hidden.
- Health polls every 30 s while attached; three consecutive failures mark the session `orphaned` and offer reconnect (D02).

## 3. The three transports, researched

### 3.1 Own VPS over SSH

The baseline and the first implementation. Any Linux box with `sshd`, a user, and a checkout.

- Bootstrap: upload the runner archive to `/tmp`, verify sha256, extract to a versioned directory, run `--headless` under `nohup`/`setsid` with a token.
- Attach: `ssh -N -L 127.0.0.1:<local>:127.0.0.1:<remote>` per session, one tunnel process reused for the session's lifetime; preview ports get their own forwards.
- Exec/PTY/files are the host's business, not the transport's: the desktop speaks HTTP to the attached host.
- Auth: key file or `ssh-agent`; host key trust on first connect, pinned `SHA256:` fingerprint per target; a changed key is a hard error with an explicit replace action.
- No `ControlMaster`: Windows OpenSSH does not support it, and the tunnel is long-lived anyway.
- Temp-and-rename for every file the transport writes on the target.

### 3.2 Daytona

Verified at `daytona.io/docs` on 2026-10-17.

- REST: `POST https://app.daytona.io/api/sandbox`, bearer key. Sizes `daytona-small` 1 vCPU / 1 GiB / 3 GiB, medium 2/4/8, large 4/8/10.
- Exec: `sandbox.process.exec(command, cwd, env, timeout)`; default timeout 10 s, so every call passes one. The runner's bootstrap is one long call, then the host owns its own execution.
- PTY and files: toolbox routes under `/toolbox/{id}/process/pty` and `/toolbox/{id}/files`.
- Preview: standard `https://{port}-{sandboxId}.{proxyDomain}` requires an `x-daytona-preview-token` header that cannot be revoked; signed `https://{port}-{token}.{proxyDomain}` embeds a revocable token, default 60 s and max 86,400 s. Public sandboxes need no token. A first-visit warning page appears unless `X-Daytona-Skip-Preview-Warning: true` is sent. Stop/start rotates the preview token; paused resume keeps it.
- SSH access: `create_ssh_access(expires_in_minutes)`, default 60, revocable, then `ssh <token>@ssh.app.daytona.io`. This is how the runner is uploaded when the REST file route is not enough.
- No Rust SDK: REST plus WebSocket PTY only.

### 3.3 boat (formerly Box)

- REST base `https://boat.dev/api/v1`, bearer `boat_` or legacy `box_`; every response is `{ok, type, ...}` and errors are `{code, message, status, details, requestId}`.
- Create `POST /sandboxes` with `ttlSeconds` (default 1 h), poll until `ready` / `idle` / `running`; `POST /sandboxes/{id}/commands` waits up to 60 s while starting and supports `stream` and `detached`; `/files`, `/host`, `/events`, `/desktop`.
- Stop saves the disk and stops billing; resume restores; fork duplicates. Sizes `small` 2/4, default 4/8, `large` 8/16.
- EU-only regions (Germany, Finland, France). Latency and residency are user-visible facts.
- SSH keys are managed per sandbox, so the runner bootstrap uses the SSH transport after `POST /sandboxes/{id}/ssh-keys`.
- No documented PTY endpoint; SSH covers interactive terminals.

## 4. What BetterShape has today

- Every tool executes locally. `execute_tool` (`agent/tools/dispatch/mod.rs:103`) takes `ToolCtx` with local handles; about twenty families read the filesystem directly.
- `run_terminal` uses `portable_pty` in `commands/pty`.
- `security/paths.rs` confines paths to the project root; `page_shot` refuses non-loopback URLs.
- `agent/checkout.rs` creates local worktrees and falls back to the shared checkout with a note.
- A project is a local path; there is no target concept.
- No transport exists; D05 and D06 are prerequisites and do not exist yet either.

## 5. Design

### 5.1 What moves and what does not

| Moves | Stays |
| --- | --- |
| conversation, messages, drafts, usage rows | secrets (re-entered or granted on the target) |
| run records and pending approvals | local logs and caches |
| project binding, worktree identity | absolute local paths outside the workspace |
| workspace HEAD and uncommitted patch | editor UI state, preview history |
| skills and instruction files already in the bundle | plugin binaries other than the runner |

The plan shown before a move lists both columns. A user who expects their API key to move is told, before the move, that it will not.

### 5.2 Move orchestration

D06 owns the state machine. D33 supplies the transport steps and one extra guard: a move cannot start while another move for the same project is in `Uploading` or later, because two workspaces diverging on two hosts is the split-brain case the state machine exists to prevent. The guard is a project-level row with a fencing token.

Mid-turn: wait up to 30 s for `run.completed`; then offer wait, cancel move, or move now. `move now` cancels the turn, records `moved_mid_turn`, and the target's host resumes from the last checkpoint with a banner. The source session stays fenced and read-only until the target reaches `Active` or the move aborts.

Moving back: `plan` names the remote unpushed commits; the reverse patch is computed on the target by the host, uploaded as a bundle section, and applied locally. A conflict stops with `move_back_conflict` and a file list.

### 5.3 Ports and previews

The transport maps remote ports to local ones:

- SSH: `-L 127.0.0.1:<local>:127.0.0.1:<port>`, one forward per preview, reaped on close.
- Daytona: signed preview URLs with a 3,600 s expiry, refreshed on 401; never place a standard preview token in a URL shown to the user.
- boat: `POST /sandboxes/{id}/host`, falling back to an SSH forward.
- Local port allocation is deterministic from `(sessionId, port)` in the 41000-41999 range, checked for availability, never silently reassigned; a conflict surfaces in the UI.

`page_shot` and the preview panel accept mapped URLs, not only loopback. The allowlist is the set of URLs the transport returned for this session; a pasted URL is not automatically allowed.

### 5.4 Security

- Approvals happen on the desktop, always. The remote host cannot approve itself, and the host's `permission.asked` event carries the same fields D03 records.
- The runner token is 32 bytes, generated per session, passed over stdin or an env file with mode 0600, never in argv (argv is visible in `ps`).
- The runner binds `127.0.0.1` on the target; the only way in is the transport's tunnel. A test asserts it never binds `0.0.0.0`.
- The remote deny list and root confinement are the same code as local (`security/paths.rs`); a test tries `.ssh/id_ed25519`, `../`, and an escaping symlink on a remote fixture.
- Redaction covers API keys, runner tokens, SSH tokens, and signed preview URLs in logs, transcripts, and crash reports (D04).
- Host key mismatch is a hard stop. No auto-accept, ever.

### 5.5 Failures

| Case | Behavior |
| --- | --- |
| Connection lost mid-turn | turn fails with `remote_disconnected`, partial output kept, "Reconnect and continue" offered; the run stays `orphaned` until reconnect |
| Sandbox stopped | offer resume, then retry the failed step only |
| Disk full | `ENOSPC` surfaced with the path and free bytes |
| Runner version mismatch | refuse to attach, name both versions, offer re-upload |
| Bundle hash mismatch | abort before `activate`, leave source writable |
| Workspace HEAD mismatch | abort, show both hashes |

Never fall back to local. A remote project that cannot connect must not quietly run commands on the user's machine; the test asserts an error and zero local spawns.

### 5.6 UI

Settings > Targets: list, add, test, edit, remove; per target kind, label, host or API key ref, root, image/size (Daytona), TTL policy (boat). The session header shows a target chip and the move state. A first-move dialog explains what moves. A "Move to..." action lives in the session menu, not in a new global nav.

## 6. Files

New:

- `src-tauri/src/agent/host/{mod,local,remote,protocol,attach}.rs`  -  the `SessionHost` boundary
- `src-tauri/src/runner/main.rs`  -  the headless entry point (same crate, `[[bin]]`)
- `src-tauri/src/agent/transport/{mod,ssh,daytona,boat,transfer,ports,health}.rs`
- `src-tauri/src/commands/targets.rs`  -  CRUD, test, move
- `plugins/builtin/{ssh,daytona,boat}/plugin.json`  -  first-party manifests
- `features/settings/ui/targets/*`, `features/targets/MoveDialog.tsx`, `features/targets/StatusChip.tsx`
- `docs/remote-targets.md`

Modified:

- `src-tauri/src/agent/tools/dispatch/mod.rs`  -  `ToolCtx` gains `host: &SessionHost`
- `src-tauri/src/commands/pty/mod.rs`  -  PTY through the host
- `src-tauri/src/agent/checkout.rs`  -  worktree operations go through the host
- `src-tauri/src/agent/tools/page_shot.rs`  -  mapped preview URLs
- `src-tauri/src/lib.rs`  -  register the runner binary and target commands
- `lib/settings/store.ts`  -  targets and project binding
- `DESIGN.md`  -  target chip and first-move copy

## 7. Stages

| Stage | Work | Days |
| --- | --- | ---: |
| T0 | `SessionHost` boundary, local adapter, protocol types, attach/detach, no user-visible change | 4 |
| T1 | runner binary, versioned packaging, lock, token, health, drain | 4 |
| T2 | SSH transport: trust, bootstrap, tunnel, ports, atomic writes | 7 |
| T3 | workspace transfer: clone/bundle, patch, HEAD verification, reverse move | 3 |
| T4 | move orchestration integration, fencing, mid-turn choices, resume | 3 |
| T5 | Daytona: REST lifecycle, upload, attach, signed previews, auto-stop | 6 |
| T6 | boat: lifecycle, SSH key injection, TTL extension, host URL, EU notice | 4 |
| T7 | targets UI, cost and health, docs, conformance suite | 3 |
| | **total** | **34** |

T0 and T1 must land before any transport. T2 and T4 make the VPS path usable end to end; T5 and T6 are separate PRs against the same contract.

## 8. Acceptance criteria

1. A session moved to a VPS runs chat, tools, terminals, git, tests, and previews on that host; a test asserts zero local process spawns for the session.
2. The source session is fenced from `Uploading` until `Active`; a write during that window returns `session_fenced`.
3. A bundle hash mismatch aborts before `activate` and the source becomes writable again.
4. Moving back with an unpushed remote commit applies it locally; a conflicting patch stops with `move_back_conflict` and a file list.
5. Mid-turn move shows the three choices; "move now" records `moved_mid_turn` and resumes from the checkpoint.
6. The runner binds `127.0.0.1` only, its token never appears in argv or logs, and a test greps both.
7. A Daytona preview URL is the signed form, expires as configured, and refreshes on 401; a standard preview token never appears in a URL.
8. A boat sandbox extends its TTL while a turn runs and shows the remaining time; its EU region is named in the target form.
9. A changed SSH host key stops the connection with `ssh_host_key_changed` and no auto-accept path.
10. A third-party sidecar transport passing the D05 conformance suite can move a session without any core change.
11. A failed connection never executes locally; the test asserts an error and zero spawns.
12. The full gate passes.

## 9. Traps

- **Do not build a second runner protocol.** It is D06's protocol plus four host routes; a private protocol doubles the client and the tests.
- **Do not sync a directory tree.** Clone or bundle and apply a patch; a sync engine will fight git and lose data.
- **Do not put the runner token in argv.** It shows up in `ps` and in shell history.
- **Do not treat a sandbox as trusted.** The deny list and confinement still apply, or the sandbox becomes a credential exfiltration path.
- **Do not bundle the app.** Ship a stripped runner binary; t3code's 70 MB archive is a slow upload and a large attack surface.
- **Do not hardcode the 10 s Daytona default.** `npm install` will fail on the first attempt.
- **Do not promise Windows or macOS sandboxes.** Daytona offers those classes, but the build, test, and preview assumptions are Linux-shaped. Ship Linux and say so.
- **Do not estimate boat as cheap at low usage.** $20/month is 555 machine-hours; ten hours a month is $2 an hour.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/33-remote-backends-plugin.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D33: Remote backends as plugins that move sessions. Scope: the `SessionHost` boundary with a local adapter, the headless runner binary and its versioned packaging, the SSH, Daytona, and boat transports as builtin plugins, workspace transfer by clone or bundle plus patch, move orchestration on D06's state machine, port mapping, target settings, and the failure taxonomy. Implement in the T0 to T7 order. Do not build a remote runner daemon beyond the single headless binary, do not sync the local repository, do not add a vendor SDK, do not add a local fallback, and do not change D05 or D06.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging beyond the network calls the dossier names. Create `dossier/33-remote-backends-plugin` from the current `draft/mega-absorb-all` only after dossier 32 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's stages in order, including their tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
