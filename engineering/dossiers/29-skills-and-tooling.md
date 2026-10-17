# D29: Skills, install, disclosure, and distillation

| Field | Value |
| --- | --- |
| Base | `draft/mega-absorb-all` (branch `dossier/29-skills-and-tooling`) |
| Roadmap source | mausCode steps 38, 43 (issues #40, #45) |
| Issue title | `D29: Skills, install, disclosure, and distillation` |
| Labels | `port`, `dossier:29`, `area:agent`, `size:M`, `stage:5` |
| Depends on | D12 (context budget), D05 (plugin contributions), D03 (permissions), D08 (run events) |
| Blocks | nothing hard; D28 search can index accepted skills |
| Effort | 12 days |

**Port verdict: BUILD ON THE VERIFIER. BetterShape already vendors skills under `.agents/skills` with a `skills-lock.json` and a folder-hash checker (`scripts/ci/verify-skills.mjs`, run by `npm run skills:verify`). It cannot install one, cannot show one to the model by disclosure, and cannot propose one from finished work. mausCode steps 38 and 43 are the missing lifecycle around a format that is already enforced.**

## 1. Today

| Piece | Where | Behavior |
| --- | --- | --- |
| Skill bodies | `.agents/skills/<name>/` | vendored by `npx skills add`; project-owned exceptions (`unslop`, `find-skills`) |
| Lock | `skills-lock.json` | folder hash over sorted relative paths and bytes |
| Verifier | `scripts/ci/verify-skills.mjs` | fails on drift; `--strict` fails on unrecorded skills |
| Settings | `features/settings/ui/shared/nav.ts` `ai-skills` | lists what is in the folder |
| Agent access | none | the model is never told a skill exists unless the user pastes it |

The verifier is the strongest part and is worth reusing verbatim as the install contract. Everything else is missing: no source precedence, no enable/disable, no disclosure, no distillation, and no way for a project to pin a skill version.

## 2. Format

`SKILL.md` with YAML frontmatter, plus optional `references/` and `scripts/`:

```markdown
---
name: review-diff
description: Review a diff for regressions and missing tests.
version: 1.2.0
license: MIT
when: the user asks for a review, or a turn produced a diff over 200 lines
allowed-tools: [read_file, grep, run_terminal]
---

# Review a diff
...body...
```

Rules:

1. `name` matches `^[a-z0-9][a-z0-9-]{1,63}$` and is unique per source.
2. `description` is one sentence, at most 160 characters. It is the only text loaded by default.
3. `when` is a trigger phrase for the registry, not executable logic.
4. `scripts/` never run at load or install. Running one is a tool call under D03, with the script path shown.
5. Unknown frontmatter keys are preserved and ignored with a warning.

## 3. Sources and precedence

| Source | Path | Writable by app |
| --- | --- | --- |
| project | `<root>/.bettershape/skills` | yes, with a confirmation |
| user | `$APP_DATA/skills` | yes |
| plugin | contributed by D05 under `plugin:<id>` | no; read-only projection |
| vendored | `<repo>/.agents/skills` | no; the lock owns it |

Precedence for a name collision: project, then user, then plugin, then vendored. The losing entry is still listed with a "shadowed by" note; nothing is deleted. A project that pins a version does so in `.bettershape/skills.json` (`{ "review-diff": { "source": "user", "version": "1.2.0" } }`), and a mismatch is a visible warning, not a silent fallback.

## 4. Install

- From a folder: validate frontmatter, compute the folder hash, show the file list and size, then copy into the chosen source root.
- From a repository: `git clone --depth 1` into a temp directory, locate `SKILL.md` at the root or under `skills/<name>/`, show the same preview, then copy. The commit hash is recorded in the lock as `resolved`.
- Lock entry: `{ source, version, computedHash, resolved, installedAt }` in `skills-lock.json`, in exactly the shape the existing verifier reads.
- Update compares hashes and refuses to overwrite a locally modified skill without an explicit "replace my edits" confirmation.
- Uninstall removes the directory and the lock entry; a skill referenced by a running turn is refused with `skill_in_use`.

No registry, no auto-update, no code execution during install. A skill is text plus files.

## 5. Disclosure

The registry section in the stable prompt is capped at 1,200 tokens and contains, per enabled skill, only:

```
<skill name="review-diff" when="...">Review a diff for regressions and missing tests.</skill>
```

The body is loaded on demand:

- The model calls `skill_read(name)` (a host tool, not a shell command).
- The host returns the body, capped at 12,000 characters; a longer body is chunked by heading with an index.
- `skill_read` is recorded as a `tool.finished` event with the skill name and byte count, so the usage panel can show which skills cost context.
- If the registry exceeds 1,200 tokens, skills are sorted by `version` recency then name, and the cut list is reported (D12's cut notice).

The `when` text is advisory. The app does not auto-invoke a skill; the model chooses, and the choice is visible in the transcript.

## 6. Distillation

Default off (`agent.skills.distill`, `propose` | `off`). When on, after a completed run that meets all of: at least 8 tool calls, at least one file written, and no failure, a background pass asks the model for a skill proposal:

```json
{ "name": "...", "description": "...", "when": "...", "body": "...", "evidence": ["run_id", "message_ids"] }
```

- One proposal per session per day, and at most three pending proposals at a time.
- The proposal is diffed against an existing skill with the same name; the UI shows a side-by-side diff.
- Accept writes with `source: agent` in frontmatter and a provenance row (session, run, message range). Reject records a reason and is never re-proposed from the same evidence.
- A proposal may not contain a command that the run did not execute, and may not include secrets (D04 redaction runs before the diff).
- Distillation never edits a vendored skill; it proposes a project or user skill and says which.

## 7. Tooling inventory

A read-only Settings > Agent > Tooling page: detected binaries (`git`, `node`, `npm`, `python`, `cargo`, `gh`, `ssh`, `docker`) with version and path; MCP servers from D25 with connection state; skills with source and version. No install button, no package manager, no PATH mutation. It exists so a failure that says "git not found" has a place to be diagnosed.

## 8. Where it goes

| File | Work |
| --- | --- |
| `src-tauri/src/agent/skills/{mod,frontmatter,source,install,lock,registry,read,distill}.rs` | lifecycle |
| `scripts/ci/verify-skills.mjs` | share the hash function with Rust via a fixture test |
| `src-tauri/src/agent/tools/skills.rs` | `skill_read`, `skill_list` |
| `src-tauri/src/agent/commands/skills_cmds.rs` | install, update, uninstall, enable, propose, accept |
| `features/settings/ui/pages/skills/*` | list, install, diff, proposals |
| `features/agent/tooling/*` | inventory |

## 9. Plan

| Phase | Work | Days |
| --- | --- | ---: |
| P0 | frontmatter, source precedence, enable/disable, registry | 3 |
| P1 | install from folder and repo, lock, update, uninstall | 3 |
| P2 | disclosure and `skill_read` under the token cap | 2 |
| P3 | distillation proposals, diff, provenance | 3 |
| P4 | inventory page and tests | 1 |
| | **total** | **12** |

## 10. Acceptance criteria

1. A skill with a missing `name`, a bad pattern, or a 200-character description is rejected at install with the field named.
2. The Rust folder hash equals the Node verifier's hash for the same fixture, asserted by one shared fixture.
3. Installing from a repo records the commit hash, and reinstalling the same commit is idempotent.
4. Updating a locally modified skill refuses without the explicit replace confirmation, and keeps the local file until then.
5. A name collision across all four sources resolves by the documented precedence and lists the shadowed entry.
6. The default registry contains only name, `when`, and description; a test asserts the body is absent until `skill_read`.
7. `skill_read` returns at most 12,000 characters; a longer body is chunked by heading with an index.
8. A `scripts/` file is never executed by install, load, or update; a test instruments process spawns and asserts zero.
9. A distillation proposal carries run and message provenance, is diffed against an existing skill, and acceptance writes `source: agent`.
10. The full gate passes, including `npm run skills:verify`.

## 11. Traps

- **Do not invent a second lock format.** The verifier is the contract; a Rust-only format breaks `skills:verify`.
- **Do not load skill bodies by default.** The whole point of disclosure is that twenty skills cost twenty descriptions.
- **Do not auto-run skill scripts.** A skill is instructions plus assets; execution is a tool call with a permission decision.
- **Do not let distillation overwrite a vendored skill.** It proposes, the user accepts, and the target is a writable source.
- **Do not treat `when` as a router.** It is a hint for the model and a label for the user; a regex router makes behavior unpredictable.

## Prompt for a fresh agent

This block is self-contained. Paste it as the first message in a new chat, with the repository open.

```text
Read AGENTS.md in full first, then DESIGN.md, then engineering/dossiers/29-skills-and-tooling.md in full. The dossier is the spec. AGENTS.md and DESIGN.md win on any conflict, and you should report the conflict instead of silently choosing one.

Implement only D29: Skills, install, disclosure, and distillation. Scope: the `SKILL.md` contract, the four sources with precedence, install from a folder and a git repository with the existing lock shape, update and uninstall, the capped registry and `skill_read` disclosure, the distillation proposal flow with provenance, and the read-only tooling inventory. Do not execute skill scripts automatically, do not add a skills registry service, and do not change the vendored tree.

Use the repository's existing primitives before adding new ones. Keep the app dark only. No telemetry, no analytics, no remote logging. Create `dossier/29-skills-and-tooling` from the current `draft/mega-absorb-all` only after dossier 28 has merged, because the numbering is the merge order. One concern per branch. Never push main.

Work through the dossier's plan in order, including its tests. When it is done, run the full gate: npm ci, npm run lint, npx tsc --noEmit, npm run build:runtime, npm run test:all, npm run skills:verify, cargo fmt --check, cargo clippy. Report the files you changed, the gate output, and anything in the dossier that turned out to be wrong.
```
