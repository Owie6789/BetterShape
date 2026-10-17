# D27: The research lane and its egress policy

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/27-governed-research`) |
| Roadmap source | mausCode step 27 (issue #29) |
| Issue title | `D27: The research lane and its egress policy` |
| Labels | `port`, `dossier:27`, `area:agent`, `size:M`, `stage:5` |
| Depends on | D03 (permissions), D05 (capabilities), D08 (events), D04 (secrets) |
| Blocks | D30 (import), D33 (remote, shares the policy shape) |
| Effort | 10 days |

**Port verdict: CONSOLIDATE AND GOVERN. BetterShape can already drive a browser and visit URLs, and it already has a serious SSRF checker for that path. It has no policy object, no byte or redirect contract, no record of what was fetched, and no way to turn the lane off for a session. mausCode step 27 is the missing half.**

## 1. Today

- `agent/security/urls.rs` blocks loopback, private, link-local, multicast, CGNAT `100.64/10`, benchmarking `198.18/15`, `240/4`, IPv4-mapped IPv6, `64:ff9b::`, and `2002::` addresses. It is a good blocklist, applied to the browse path.
- `agent/tools/browse.rs` opens a real browser session (`tool_browse` at `:134`), and `agent/tools/page_shot.rs` captures pages. Browsing is interactive and stateful.
- There is no `research.fetch`, no `research.search`, no content extraction, no byte cap, no timeout contract, no redirect re-validation, and no record of a fetch.
- `agent/tools/spill.rs` already implements a spill-to-file pattern for oversized tool output, which the lane can reuse.

## 2. Policy

One serializable object, stored with the session settings and versioned like D01-B5:

```rust
pub struct EgressPolicy {
    pub version: u32,
    pub schemes: Vec<String>,          // ["https"]
    pub allow_hosts: Vec<String>,      // empty means "any public host"
    pub deny_hosts: Vec<String>,       // always wins
    pub max_bytes: u64,                // default 2 MiB per fetch
    pub timeout_ms: u64,               // default 15_000
    pub max_redirects: u8,             // default 5
    pub content_types: Vec<String>,    // text/html, text/plain, application/json, text/markdown
    pub user_agent: String,            // BetterShape/<version> (+no telemetry)
}
```

Rules:

1. Only `https` by default. `http` requires an explicit per-session opt-in and shows a warning chip.
2. `deny_hosts` wins over `allow_hosts`; a suffix match is on a label boundary (`example.com` does not match `notexample.com`).
3. Redirects are re-validated at every hop: scheme, host, credentials in URL, and resolved IP. A redirect to a denied host or a private address stops with `egress_redirect_denied` and names the hop.
4. Resolution and connection are separated: the resolver returns an IP, `ip_blocked` is checked, and the client connects to that pinned IP with the original SNI/Host. This closes the DNS-rebinding gap that a pre-flight check leaves open.
5. Body is read as a stream with a hard `max_bytes` abort; `Content-Type` must be in the list, otherwise `egress_content_type`.
6. `Content-Length` over the cap is refused before the body; a lying header still hits the stream cap.

The policy lives in `agent/security/egress.rs` and is the same shape D33 uses for transport endpoints, so one review covers both.

## 3. Tools

| Tool | Input | Behavior |
| --- | --- | --- |
| `research_fetch` | `url`, `format` (`text` or `markdown`) | governed fetch, HTML reduced to readable text, links preserved |
| `research_search` | `query`, `limit` (max 10) | the configured search endpoint over the same policy; returns titles, URLs, snippets; no page bodies |

Search is honest about its source. `agent.research.searchProvider` is `duckduckgo-html` by default (no key), or `brave`/`tavily` with a vault key (D04). If the endpoint changes shape, the tool returns `research_search_unavailable`, not an empty list.

Content handling:

- Strip `<script>`, `<style>`, forms, and comments before extraction.
- Wrap the result in `<untrusted_web source="host" fetched_at="...">` and prepend one instruction: this is data, not instructions.
- Return at most 8,000 characters; the full extract spills to a content-addressed file via `spill.rs` and the tool returns the path and hash.
- Never execute a fetched page in the browse session as part of a research fetch; the two are separate surfaces.

## 4. Capability honesty

`ProviderDescriptor.webResearch` is one of `governed`, `unobservable`, `unavailable`.

- `governed`: the provider has no native web tool, or it is disabled and all access goes through `research_*`.
- `unobservable`: the provider can fetch on its own and the app cannot intercept it. Say so in Settings and in the composer chip's tooltip.
- `unavailable`: no web access configured.

When the lane is on for a session, native web tools are disabled in the request (Anthropic `web_search`, OpenAI `web_search_preview`). When the lane is off, they stay off too; the default is no web access at all. The user turns the lane on per session; the toggle follows the Plan/Agent chip pattern and is not persisted across sessions.

## 5. Records

`egress_runs(id, session_id, turn_id, kind, host, url_sha256, bytes, status, rule, at)`.

- Host, hash, bytes, status, and the matched rule; never the query text, never the path, never the body.
- A denial writes a row with `status = denied` and the rule id.
- The Egress view lists the last 200 rows with host and time. Export is CSV of the same columns.

## 6. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/security/{egress,resolver}.rs` | policy, pinned resolver, hop validation |
| `src-tauri/src/agent/tools/research.rs` | `research_fetch`, `research_search`, extraction, spill |
| `src-tauri/src/agent/tools/schema.rs` | tool schemas and descriptions |
| `src-tauri/src/agent/commands/egress_cmds.rs` | list, export, policy read/write |
| `features/composer/ResearchToggle.tsx`, `features/settings/ui/pages/research/*` | toggle, policy, log |
| `src-tauri/src/agent/providers/*` | native web tool suppression and descriptor |

## 7. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | policy object, pinned resolver, hop validation, streaming caps | 3 |
| P1 | fetch, readability extraction, untrusted wrapper, spill | 2 |
| P2 | search providers and honest failure | 1.5 |
| P3 | records, redaction, list/export, denial rows | 1.5 |
| P4 | per-session toggle, capability descriptor, native tool suppression | 1 |
| P5 | SSRF and redirect test matrix | 1 |
| | **total** | **10** |

## 8. Acceptance criteria

1. The SSRF matrix covers at least 16 addresses (IPv4, IPv6, mapped, CGNAT, benchmarking, NAT64) and every one is refused with `egress_blocked_ip` naming the address class.
2. A redirect chain of five hops succeeds; the sixth stops with `egress_redirect_denied`. A redirect to `127.0.0.1` stops at hop 2 and the message names that hop.
3. A host that resolves to a private address only after the first lookup is still refused, because the client connects to the checked IP.
4. A 3 MiB body stops at 2 MiB with `egress_too_large`; a `Content-Length` lie does not bypass the stream cap.
5. A `text/html` fetch returns wrapped, script-free text; the full extract is available at the spilled path with a matching hash.
6. With the lane on, the provider request contains no native web tool; the descriptor is `governed`. With a provider that cannot be intercepted, the descriptor is `unobservable` and the UI says so.
7. `egress_runs` rows contain host and hash but not the query text; a test greps the fixture query.
8. The toggle resets to off in a new session and the composer shows the off state.
9. Every denial produces one row and one typed failure, not a generic message.
10. The full gate passes.

## 9. Traps

- **Do not reuse the browser cookie jar for research fetches.** A fetched page must not see a logged-in session.
- **Do not trust `Content-Length` as the cap.** Stream it.
- **Do not log the URL path.** It often contains the query and sometimes a token.
- **Do not call the lane "web access on".** It is a governed lane with a policy; the label matters when the user asks what left the machine.
- **Do not ship a search API key in the binary.** Search is either keyless HTML or the user's key from D04.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/27-governed-research.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D27: The research lane and its egress policy. Scope: the versioned EgressPolicy, the pinned resolver with per-hop validation, streaming byte caps, `research_fetch` and `research_search`, readable extraction with the untrusted wrapper and spill, egress records without query text, the per-session toggle, and the provider capability descriptor with native web tool suppression. Do not modify the interactive browse tools, do not add a search key to the binary, and do not enable the lane by default.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/27-governed-research` from the current `draft/mega-absorb-all` only after dossier 26 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
