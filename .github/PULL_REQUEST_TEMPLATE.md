## Summary

Describe what this change does, why it is needed, and which part of the repository it touches. Keep this opening paragraph clear to someone who has not seen the code before.

## Changes

<details>
<summary>Files and behavior</summary>

- Files changed:
- Behavior or policy changed:

</details>

## Verification Gate

Head SHA: `PASTE_40_CHAR_HEAD_SHA_HERE`

- `npm ci`: <passed, failed, or not run with reason>
- `npm run lint`: <passed, failed, or not run with reason>
- `npx tsc --noEmit`: <passed, failed, or not run with reason>
- `npm run build:runtime`: <passed, failed, or not run with reason>
- `npm run test:all`: <passed, failed, or not run with reason>
- `npm run test:rust`: <passed, failed, or not applicable>
- `npm run skills:verify`: <passed, failed, or not run with reason>
- Rust formatting and clippy, when Rust changed: <results or not applicable>

Use the head SHA from the run. A result from an earlier edit does not verify this head.

## Code Research Gate

<details>
<summary>Research notes</summary>

- Queries searched:
- Sources:
- Edge cases considered:
- Failed attempts:

</details>

## Design confirmations

- Product UI touched: <yes or no>
- Design files read for UI changes: `DESIGN.md`, `engineering/design-system-baseline.md`, and any owning surface design file, or <not applicable>

## Review classification

Substantially critical: No

Reason if yes: <explain the applicable criterion>

<!-- Set Yes for a breaking change, security fix, major architecture or protocol change, a new platform support claim, or a repo policy or workflow change that materially affects future work. -->

## Review requests

- CodeAnt body tag: `@codeant-ai review`
- CodeAnt comment link and head SHA: <link and SHA>
- CodeRabbit comment link and head SHA, for substantially critical PRs only: <link and SHA, or not requested>

Post each required tag as a separate PR comment containing only the tag. After each push or fix round, request review again and record the new comment link and head SHA here. For a substantially critical PR, add the CodeRabbit tag to this section and post it as a separate comment. Do not request CodeRabbit for other PRs.

## Checklist

- [ ] I confirmed the target base branch.
- [ ] I ran the applicable Verification Gate commands on the head SHA above.
- [ ] I recorded the Code Research Gate notes.
- [ ] I posted the required standalone bot comment or comments.
- [ ] I checked that CodeRabbit is requested only for a substantially critical PR.

## Footer

BetterShape-Agent | Filed by <model slug or platform name>, with @<verified GitHub username>, on <YYYY-MM-DD>
