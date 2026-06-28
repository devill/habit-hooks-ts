"""Sensor: flag Python functions/methods whose body exceeds a line limit.

Closes the gap where habit-hooks' Python preset has no per-function length rule
(ruff has none; the 12-line `oversized-function` smell is ESLint-only, so it
never fires on Python). Emits the habit-hooks finding contract — a JSON array of
``{smell, details}`` — so it works as a sensor command, and is enforced here via
``tests/test_function_length.py``.

    python tests/tools/oversized_function.py <file.py> ...
"""

from __future__ import annotations

import ast
import json
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_BODY_LINES = 12
SMELL = "oversized-function"

_Func = ast.FunctionDef | ast.AsyncFunctionDef


@dataclass
class Finding:
    file: str
    line: int
    name: str
    length: int

    def as_finding(self) -> dict:
        details = {"file": self.file, "line": self.line, "function": self.name,
                   "actual": self.length, "maxAllowed": MAX_BODY_LINES}
        return {"smell": SMELL, "details": details}


class FunctionLengthSensor:
    """Reports any function whose body spans more than `max_body_lines` lines."""

    def __init__(self, max_body_lines: int = MAX_BODY_LINES):
        self.max_body_lines = max_body_lines

    def scan(self, paths: list[Path]) -> list[Finding]:
        findings: list[Finding] = []
        for path in paths:
            findings.extend(self._scan_file(path))
        return findings

    def _scan_file(self, path: Path) -> list[Finding]:
        functions = (n for n in ast.walk(ast.parse(path.read_text())) if isinstance(n, _Func))
        oversized = ((fn, self._body_lines(fn)) for fn in functions)
        return [Finding(str(path), fn.lineno, fn.name, n) for fn, n in oversized if n > self.max_body_lines]

    @staticmethod
    def _body_lines(node: _Func) -> int:
        return (node.body[-1].end_lineno or node.body[-1].lineno) - node.body[0].lineno + 1


def main(argv: list[str]) -> int:
    findings = FunctionLengthSensor().scan([Path(a) for a in argv])
    print(json.dumps([f.as_finding() for f in findings], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
