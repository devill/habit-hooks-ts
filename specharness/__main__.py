"""CLI: discover and run ``docs/**/*.spec.md`` and report pass/skip/fail."""

from __future__ import annotations

import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .harness import SpecError, SpecFailure, SpecCase, execute, parse_spec


@dataclass
class Result:
    file: Path
    name: str
    status: str  # "pass" | "skip" | "fail"
    message: str = ""


def discover(root: Path) -> list[Path]:
    return sorted(root.glob("docs/**/*.spec.md"))


def run_file(path: Path, repo_root: Path) -> list[Result]:
    results: list[Result] = []
    for test in parse_spec(path.read_text()):
        results.append(run_test(test, path, repo_root))
    return results


def run_test(test: SpecCase, path: Path, repo_root: Path) -> Result:
    if test.skip:
        return Result(path, test.name, "skip")
    with tempfile.TemporaryDirectory() as tmp:
        try:
            execute(test, Path(tmp), repo_root)
        except (SpecFailure, SpecError) as exc:
            return Result(path, test.name, "fail", str(exc))
    return Result(path, test.name, "pass")


_GLYPH = {"pass": "✅", "skip": "🟡", "fail": "❌"}


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    root = Path.cwd()
    if argv:
        files = sorted(Path(a) for a in argv)
    else:
        files = discover(root)
    if not files:
        print(f"no docs/**/*.spec.md under {root}")
        return 1

    counts = {"pass": 0, "skip": 0, "fail": 0}
    for path in files:
        rel = path.relative_to(root) if path.is_relative_to(root) else path
        print(f"\n{rel}")
        for r in run_file(path, root):
            counts[r.status] += 1
            print(f"  {_GLYPH[r.status]} {r.name}")
            if r.status == "fail":
                for line in r.message.splitlines():
                    print(f"      {line}")

    print(f"\n{counts['pass']} passed, {counts['skip']} skipped, {counts['fail']} failed")
    return 1 if counts["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
