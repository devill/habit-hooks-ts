"""Pick the files the leaf sensors see, then expose them as ``scope.files``.

The scope flags are mutually exclusive; with none, the scope is derived from the
``[scope]`` config. Git-backed modes shell out to ``git``; file selection uses
pathspec (gitwildmatch) globbing — no brace expansion.
"""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pathspec

from .config import Config


@dataclass
class Scope:
    files: list[str]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="habit-sensors")
    parser.add_argument("--config", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--all", action="store_true")
    modes.add_argument("--file")
    modes.add_argument("--branch", nargs="?", const="", metavar="base")
    modes.add_argument("--last", type=int)
    modes.add_argument("--since")
    return parser.parse_args(argv)


def _is_git_repo(project_dir: Path) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def _git_diff_names(project_dir: Path, *revisions: str) -> list[str]:
    if not _is_git_repo(project_dir):
        raise SystemExit("habit-sensors: not a git repository")
    result = subprocess.run(
        ["git", "diff", "--name-only", *revisions],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def _all_files(config: Config, project_dir: Path) -> list[str]:
    paths = sorted(
        str(path.relative_to(project_dir))
        for path in project_dir.rglob("*")
        if path.is_file()
    )
    if not config.files:
        return paths
    spec = pathspec.PathSpec.from_lines("gitwildmatch", config.files)
    return [path for path in paths if spec.match_file(path)]


def resolve_scope(
    args: argparse.Namespace, config: Config, project_dir: Path
) -> Scope:
    if args.file is not None:
        return Scope([args.file])
    if args.branch is not None:
        base = args.branch or config.scope.branchBase
        return Scope(_git_diff_names(project_dir, base))
    if args.last is not None:
        return Scope(_git_diff_names(project_dir, f"HEAD~{args.last}", "HEAD"))
    if args.since is not None:
        return Scope(_git_diff_names(project_dir, args.since))
    if args.all:
        return Scope(_all_files(config, project_dir))
    return _default_scope(config, project_dir)


def _default_scope(config: Config, project_dir: Path) -> Scope:
    if not _is_git_repo(project_dir):
        return Scope(_all_files(config, project_dir))
    if config.scope.changedOnly:
        return Scope(_git_diff_names(project_dir))
    on_main = _current_branch(project_dir) == config.scope.mainBranch
    if config.scope.autoBranchOffMain and not on_main:
        return Scope(_git_diff_names(project_dir, config.scope.branchBase))
    return Scope(_all_files(config, project_dir))


def _current_branch(project_dir: Path) -> str:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()
