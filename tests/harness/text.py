"""Output-stream normalisation, applied to both sides of an assertion."""

import re

_ANSI = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def normalize(text: str) -> str:
    """Strip ANSI, trim trailing whitespace per line, drop trailing blanks."""
    lines = [line.rstrip() for line in _ANSI.sub("", text).split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)
