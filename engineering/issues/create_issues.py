#!/usr/bin/env python3
"""Create one GitHub issue per dossier in engineering/dossiers/.

Each dossier already carries everything an issue needs: the `Issue title`
field, the `Labels` field, and a body that starts after the field table and
ends with a self-contained prompt. This script reads those files, adds the
`Backlog` label to every issue, and calls `gh issue create` once per dossier.

It is idempotent: an issue whose title already exists in the repository is
skipped, so a partial run can be repeated without creating duplicates.

Examples:

    python3 engineering/issues/create_issues.py --dry-run
    python3 engineering/issues/create_issues.py
    python3 engineering/issues/create_issues.py --only 05
    python3 engineering/issues/create_issues.py --repo better-Shape/app

Requires an authenticated `gh` with permission to create issues in the target
repository. Run `gh auth status` first.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOSSIERS = ROOT / "engineering" / "dossiers"
DEFAULT_REPO = "better-Shape/app"
BASE_LABEL = "Backlog"


def parse_dossier(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").split("\n")
    try:
        start = next(
            i for i, line in enumerate(lines) if line.strip() == "| Field | Value |"
        )
    except StopIteration:
        raise SystemExit(f"{path}: no field table found")

    fields: dict[str, str] = {}
    i = start + 2
    while i < len(lines) and lines[i].startswith("|"):
        cells = [cell.strip() for cell in lines[i].strip("|").split("|")]
        if len(cells) == 2:
            fields[cells[0]] = cells[1]
        i += 1
    while i < len(lines) and not lines[i].strip():
        i += 1
    body = "\n".join(lines[i:]).rstrip() + "\n"

    for required in ("Issue title", "Labels"):
        if required not in fields:
            raise SystemExit(f"{path}: missing `{required}` field")

    labels = [label.strip().strip("`") for label in fields["Labels"].split(",")]
    labels = [label for label in labels if label]
    labels = [BASE_LABEL] + [label for label in labels if label != BASE_LABEL]

    return {
        "file": path.name,
        "number": path.name[:2],
        "title": fields["Issue title"].strip("`").strip(),
        "labels": labels,
        "effort": fields.get("Effort", "").strip(),
        "depends_on": fields.get("Depends on", "").strip(),
        "body": body,
    }


def existing_titles(repo: str) -> set[str]:
    result = subprocess.run(
        [
            "gh",
            "issue",
            "list",
            "--repo",
            repo,
            "--state",
            "all",
            "--limit",
            "1000",
            "--json",
            "title",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(
            "could not list existing issues: "
            + (result.stderr.strip() or "unknown error")
        )
    return {issue["title"] for issue in json.loads(result.stdout or "[]")}


def create(issue: dict, repo: str) -> str:
    with tempfile.NamedTemporaryFile(
        "w", suffix=".md", encoding="utf-8", delete=False
    ) as handle:
        handle.write(issue["body"])
        body_path = handle.name
    command = [
        "gh",
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        issue["title"],
        "--body-file",
        body_path,
    ]
    for label in issue["labels"]:
        command += ["--label", label]
    result = subprocess.run(command, capture_output=True, text=True)
    Path(body_path).unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "gh issue create failed")
    return result.stdout.strip().splitlines()[-1].strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only", nargs="*", default=None, help="dossier numbers, e.g. 01 05")
    parser.add_argument("--json-out", default=None, help="write created issue URLs here")
    args = parser.parse_args()

    paths = sorted(DOSSIERS.glob("[0-9][0-9]-*.md"))
    if not paths:
        raise SystemExit(f"no dossiers found in {DOSSIERS}")
    issues = [parse_dossier(path) for path in paths]
    if args.only:
        wanted = {number.zfill(2) for number in args.only}
        issues = [issue for issue in issues if issue["number"] in wanted]
        if not issues:
            raise SystemExit("no dossier matched --only")

    known = set() if args.dry_run else existing_titles(args.repo)
    created: list[dict] = []
    failed: list[dict] = []

    for issue in issues:
        prefix = f"D{issue['number']}"
        if issue["title"] in known:
            print(f"{prefix} skip (exists)  {issue['title']}")
            continue
        if args.dry_run:
            print(
                f"{prefix} would create  {issue['effort']:>9}  "
                f"{' '.join(issue['labels'])}  {issue['title']}"
            )
            continue
        try:
            url = create(issue, args.repo)
        except RuntimeError as error:
            failed.append(issue)
            print(f"{prefix} FAILED  {error}")
            continue
        created.append({"number": issue["number"], "title": issue["title"], "url": url})
        print(f"{prefix} created  {url}")

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(created, indent=2) + "\n", encoding="utf-8")

    print(f"\n{len(created)} created, {len(failed)} failed, {len(issues)} selected")
    if failed:
        print("Failed: " + ", ".join(f"D{issue['number']}" for issue in failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
