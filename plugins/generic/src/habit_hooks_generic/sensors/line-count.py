"""Emit an ``oversized-file`` finding for every file longer than ``--max`` lines."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max", type=int, default=200)
    parser.add_argument("files", nargs="*")
    return parser.parse_args(argv)


def line_count(path: str) -> int:
    return len(Path(path).read_text(encoding="utf-8", errors="replace").splitlines())


def oversized_issues(files: list[str], maximum: int) -> list[dict]:
    issues = []
    for file in files:
        lines = line_count(file)
        if lines > maximum:
            issues.append(
                {
                    "key": file,
                    "details": {"file": file, "lines": lines, "source": "line-count"},
                }
            )
    return issues


def findings(files: list[str], maximum: int) -> list[dict]:
    issues = oversized_issues(files, maximum)
    if not issues:
        return []
    return [{"smell": "oversized-file", "details": {"maxAllowed": maximum}, "issues": issues}]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    print(json.dumps(findings(args.files, args.max)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
