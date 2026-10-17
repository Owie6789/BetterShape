# Creating the dossier issues

The 33 dossiers in `engineering/dossiers/` are written to be issues. Each one carries an `Issue title`, a `Labels` row, and a body that starts after the field table and ends with a prompt for a fresh agent. Doing that by hand 33 times invites transcription errors, so this folder holds a script that does it from the files.

## What the script does

1. Reads every `engineering/dossiers/NN-*.md`.
2. Takes the `Issue title` field, strips the backticks, and uses it as the issue title.
3. Takes the `Labels` field and adds `Backlog` to the front, so every issue lands in the backlog column of the project view.
4. Copies the body from the line after the field table to the end of the file. The body is the dossier minus its metadata table, prompt included.
5. Calls `gh issue create` once per dossier.
6. Skips any title that already exists, so a run that stops halfway can be repeated.

It does not read the repository, resolve dependencies, or reorder anything. The numbering is the merge order and it is already in the file names.

## Before running

- `gh auth status` must show an account with permission to create issues in the target repository.
- The labels must exist. The full set is in `engineering/dossiers/README.md`; the repository already carries `Backlog` (`#0c4867`), `port`, `dossier:01` to `dossier:33`, `area:*`, `size:S` to `size:XL`, and `stage:1` to `stage:6`.
- Do not create a lowercase `backlog`. The repository label is `Backlog` with a capital B. GitHub labels are case-insensitive for matching but the display name is what people read.

## Commands

```bash
python3 engineering/issues/create_issues.py --dry-run      # print all 33, create nothing
python3 engineering/issues/create_issues.py                # create all 33
python3 engineering/issues/create_issues.py --only 01 02   # create a subset
python3 engineering/issues/create_issues.py --json-out /tmp/issues.json
```

`--dry-run` still calls `gh issue list` unless it is the only flag, because it needs the existing titles to report skips. Add `--repo <owner/name>` to target a fork.

## After creating

- The issue body already tells the reader to fetch the base branch, read `AGENTS.md` and `DESIGN.md`, read the dossier, and implement only that dossier.
- Paste the block under "Prompt for a fresh agent" at the bottom of each body into a new chat when the work starts. The issue itself is the record; the prompt is the handoff.
- If a dossier changes, edit the dossier file and the issue body together. The script is not a sync tool; re-running it skips existing titles rather than updating them.
