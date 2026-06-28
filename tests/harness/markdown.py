"""Markdown → the ordered Heading / Marker / Block elements the grammar uses."""

from __future__ import annotations

from dataclasses import dataclass

from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode

from .glyphs import MARKERS, SKIP


@dataclass
class Heading:
    level: int
    text: str
    skip: bool


@dataclass
class Marker:
    kind: str
    arg: str


@dataclass
class Block:
    info: str
    content: str

    @property
    def is_command(self) -> bool:
        # ```bash is reserved for commands and never consumed as a marker payload.
        head = self.info.split()
        return bool(head) and head[0] == "bash"


def _heading(node: SyntaxTreeNode) -> Heading:
    text = node.children[0].content.rstrip()
    skip = text.replace("️", "").rstrip().endswith(SKIP)
    return Heading(int(node.tag[1]), text, skip)


def _markers(text: str) -> list[Marker]:
    """Every marker line in a paragraph (one paragraph may hold several)."""
    lines = (line.lstrip() for line in text.split("\n"))
    return [Marker(MARKERS[h[0]], h[1:].replace("️", "")) for h in lines if h and h[0] in MARKERS]


def read_elements(text: str) -> list[object]:
    """Walk the markdown tree, emitting the elements we care about in order."""
    root = SyntaxTreeNode(MarkdownIt("commonmark").parse(text))
    elements: list[object] = []
    for node in root.children:
        if node.type == "heading":
            elements.append(_heading(node))
        elif node.type == "fence":
            elements.append(Block(node.info.strip(), node.content.rstrip("\n")))
        elif node.type == "paragraph":
            elements.extend(_markers(node.children[0].content))
    return elements
