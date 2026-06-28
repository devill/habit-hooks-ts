"""Runs executable specs (``docs/**/*.spec.md``).

The grammar is defined by ``docs/executable_spec.md`` — that file is the
contract. Markers are matched by base codepoint; any U+FE0F variation selector
is ignored.
"""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

# Marker base codepoints (U+FE0F stripped before matching).
_FILE = "\U0001F4C4"  # 📄
_ENV = "✏"  # ✏️
_STDIN = "⌨"  # ⌨️
_SCREEN = "\U0001F5A5"  # 🖥️
_STDERR = "\U0001F6A8"  # 🚨
_SKIP = "\U0001F7E1"  # 🟡
_PASS = "✅"  # ✅
_FAIL = "❌"  # ❌

_MARKERS = {_FILE: "file", _ENV: "env", _STDIN: "stdin", _SCREEN: "screen", _STDERR: "stderr"}

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


class SpecError(Exception):
    """A spec is malformed (a parse-time problem)."""


class SpecFailure(Exception):
    """A test assertion failed or a step errored at run time."""


def normalize(text: str) -> str:
    """Strip ANSI, trim trailing whitespace per line, drop trailing blanks."""
    lines = [line.rstrip() for line in _ANSI.sub("", text).split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


# --- Steps -----------------------------------------------------------------


@dataclass
class WriteFile:
    path: str
    content: str | None = None  # filled when its block is consumed


@dataclass
class CopyFile:
    dst: str
    src: str


@dataclass
class SetEnv:
    var: str
    content: str | None = None


@dataclass
class Stdin:
    content: str | None = None


@dataclass
class Command:
    script: str


@dataclass
class Screen:
    exit_code: int
    expected: str | None = None  # expected stdout


@dataclass
class Stderr:
    exit_code: int | None = None
    expected: str | None = None  # expected stderr


@dataclass
class SpecCase:
    name: str
    skip: bool
    steps: list[object]


# --- Parsing ---------------------------------------------------------------


@dataclass
class _Token:
    kind: str  # "heading" | "marker" | "block"
    # heading: level, text, skip
    level: int = 0
    text: str = ""
    skip: bool = False
    # marker: marker, arg
    marker: str = ""
    arg: str = ""
    # block: info, content
    info: str = ""
    content: str = ""


def _tokenize(text: str) -> list[_Token]:
    tokens: list[_Token] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.lstrip()
        if stripped.startswith("```"):
            info = stripped[3:].strip()
            body: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].lstrip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1  # closing fence
            tokens.append(_Token("block", info=info, content="\n".join(body)))
            continue
        m = _HEADING.match(line)
        if m:
            heading = m.group(2).rstrip()
            skip = heading.replace("️", "").rstrip().endswith(_SKIP)
            tokens.append(_Token("heading", level=len(m.group(1)), text=heading, skip=skip))
        elif stripped and stripped[0] in _MARKERS:
            tokens.append(_Token("marker", marker=_MARKERS[stripped[0]], arg=stripped[1:].replace("️", "")))
        i += 1
    return tokens


@dataclass
class _Node:
    level: int
    skip: bool
    parent: "_Node | None"
    tokens: list[_Token] = field(default_factory=list)
    has_child: bool = False
    name: str = ""


def _exit_code(arg: str) -> int | None:
    m = re.search(_FAIL + r"\s*(\d+)", arg)
    if m:
        return int(m.group(1))
    return 0 if _PASS in arg else None


def _build_steps(tokens: list[_Token]) -> list[object]:
    """Pair markers with their payload blocks for one node's direct tokens."""
    steps: list[object] = []
    awaiting: object | None = None  # a marker step awaiting an optional/required block

    def finalize() -> None:
        nonlocal awaiting
        if awaiting is None:
            return
        if isinstance(awaiting, (WriteFile, SetEnv, Stdin)) and awaiting.content is None:
            raise SpecError(f"marker {awaiting!r} has no code block")
        steps.append(awaiting)
        awaiting = None

    for tok in tokens:
        if tok.kind == "marker":
            finalize()
            if tok.marker == "file":
                arg = tok.arg.strip()
                if "@" in arg:
                    dst, src = (p.strip() for p in arg.split("@", 1))
                    steps.append(CopyFile(dst or src, src))
                else:
                    awaiting = WriteFile(arg)
            elif tok.marker == "env":
                awaiting = SetEnv(tok.arg.strip())
            elif tok.marker == "stdin":
                awaiting = Stdin()
            elif tok.marker == "screen":
                awaiting = Screen(_exit_code(tok.arg) or 0)
            elif tok.marker == "stderr":
                awaiting = Stderr(_exit_code(tok.arg))
        elif tok.kind == "block":
            if tok.info.split() and tok.info.split()[0] == "bash":
                finalize()
                steps.append(Command(tok.content))
            elif awaiting is not None:
                if isinstance(awaiting, (WriteFile, SetEnv, Stdin)):
                    awaiting.content = tok.content
                else:  # Screen / Stderr
                    awaiting.expected = tok.content
                steps.append(awaiting)
                awaiting = None
            # else: a bare block with no owning marker is cosmetic — ignore.
    finalize()
    return steps


def parse_spec(text: str) -> list[SpecCase]:
    """Return the leaf test cases, each with its full inherited step list."""
    tokens = _tokenize(text)
    nodes: list[_Node] = []
    stack: list[_Node] = []  # current ancestry, by increasing heading level

    for tok in tokens:
        if tok.kind == "heading":
            while stack and stack[-1].level >= tok.level:
                stack.pop()
            parent = stack[-1] if stack else None
            node = _Node(level=tok.level, skip=tok.skip, parent=parent, name=tok.text)
            if parent is not None:
                parent.has_child = True
            nodes.append(node)
            stack.append(node)
        elif stack:
            stack[-1].tokens.append(tok)

    tests: list[SpecCase] = []
    for node in nodes:
        if node.has_child:
            continue  # only leaves are tests
        ancestry: list[_Node] = []
        cur: _Node | None = node
        skip = False
        while cur is not None:
            ancestry.append(cur)
            skip = skip or cur.skip
            cur = cur.parent
        ancestry.reverse()
        steps: list[object] = []
        for anc in ancestry:
            steps.extend(_build_steps(anc.tokens))
        tests.append(SpecCase(name=node.name, skip=skip, steps=steps))
    return tests


# --- Execution -------------------------------------------------------------


def execute(test: SpecCase, workdir: Path, repo_root: Path) -> None:
    """Run a test's steps in ``workdir``. Raise SpecFailure on any failure."""
    env = dict(os.environ)
    stdin: str | None = None
    last: subprocess.CompletedProcess[str] | None = None
    exit_checked = False

    def check_default_exit() -> None:
        if last is not None and not exit_checked and last.returncode != 0:
            raise SpecFailure(
                f"command exited {last.returncode}, expected 0\n{last.stderr}"
            )

    for step in test.steps:
        if isinstance(step, WriteFile):
            dest = workdir / step.path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(step.content + "\n")
        elif isinstance(step, CopyFile):
            dest = workdir / step.dst
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((repo_root / step.src).read_bytes())
        elif isinstance(step, SetEnv):
            env[step.var] = step.content
        elif isinstance(step, Stdin):
            stdin = step.content + "\n"
        elif isinstance(step, Command):
            check_default_exit()
            last = subprocess.run(
                ["bash", "-c", step.script],
                cwd=workdir,
                env=env,
                input=stdin,
                capture_output=True,
                text=True,
            )
            stdin = None
            exit_checked = False
        elif isinstance(step, Screen):
            if last is None:
                raise SpecError("🖥️ assertion with no preceding command")
            exit_checked = True
            if last.returncode != step.exit_code:
                raise SpecFailure(
                    f"exit {last.returncode}, expected {step.exit_code}\n{last.stderr}"
                )
            if step.expected is not None and normalize(last.stdout) != normalize(step.expected):
                raise SpecFailure(
                    f"stdout mismatch\n--- expected ---\n{normalize(step.expected)}\n"
                    f"--- actual ---\n{normalize(last.stdout)}"
                )
        elif isinstance(step, Stderr):
            if last is None:
                raise SpecError("🚨 assertion with no preceding command")
            if step.exit_code is not None:
                exit_checked = True
                if last.returncode != step.exit_code:
                    raise SpecFailure(f"exit {last.returncode}, expected {step.exit_code}")
            if step.expected is not None and normalize(last.stderr) != normalize(step.expected):
                raise SpecFailure(
                    f"stderr mismatch\n--- expected ---\n{normalize(step.expected)}\n"
                    f"--- actual ---\n{normalize(last.stderr)}"
                )
    check_default_exit()
