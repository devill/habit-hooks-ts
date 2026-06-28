"""Marker codepoints. Any U+FE0F variation selector is ignored when matching."""

FILE = "\U0001F4C4"  # 📄
ENV = "✏"  # ✏️
STDIN = "⌨"  # ⌨️
SCREEN = "\U0001F5A5"  # 🖥️
STDERR = "\U0001F6A8"  # 🚨
SKIP = "\U0001F7E1"  # 🟡
PASS = "✅"  # ✅
FAIL = "❌"  # ❌

MARKERS = {FILE: "file", ENV: "env", STDIN: "stdin", SCREEN: "screen", STDERR: "stderr"}
