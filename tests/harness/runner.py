"""Run a parsed SpecCase to completion."""

from __future__ import annotations

from pathlib import Path

from .parser import SpecCase
from .steps import Context


def execute(test: SpecCase, workdir: Path, repo_root: Path) -> None:
    """Run a test's steps in `workdir`; raise on any assertion failure."""
    context = Context(workdir, repo_root)
    for step in test.steps:
        step.apply(context)
    context.check_default_exit()
