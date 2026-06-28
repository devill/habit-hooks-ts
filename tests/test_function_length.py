"""Enforce the oversized-function sensor on our own Python code.

This closes the gap that habit-hooks' Python preset cannot see (ruff has no
per-function line rule), so it runs as part of ``uv run pytest``.
"""

from pathlib import Path

from tools.oversized_function import FunctionLengthSensor

_ROOT = Path(__file__).parent.parent


def _our_python() -> list[Path]:
    return [*(_ROOT / "tests").rglob("*.py"), _ROOT / "conftest.py"]


def test_no_oversized_functions():
    findings = FunctionLengthSensor().scan(_our_python())
    report = "\n".join(f"{f.file}:{f.line} {f.name} is {f.length} lines" for f in findings)
    assert not findings, f"functions over {FunctionLengthSensor().max_body_lines} lines:\n{report}"
