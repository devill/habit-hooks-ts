# Build the spec test harness

## Goal
Build the Python harness that runs the executable specs (`docs/**/*.spec.md`).
It is the test gate every later phase of the `simplified` rebuild depends on, so
it ships first. It is a dev/test tool, not a shipped `habit-*` command.

The grammar it must implement is fully specified in `docs/executable_spec.md` —
**that file is the contract**. Read it first. Do not invent behaviour beyond it.

## Acceptance gate (run these; all must pass; show the output)
- `uv run pytest` (or `python -m pytest`) — the harness's **own** unit tests pass.
- The harness runs `docs/adapter.spec.md` fully green (those examples are pure
  `jq`, no product code — they must pass today).
- The harness runs `docs/mapper.spec.md` and `docs/snoozer.spec.md` and reports
  their `🟡` cases as **skipped** (the product code doesn't exist yet) — it must
  not error or fail on them.
- Show a final run summary: counts of pass / skip / fail across `docs/**/*.spec.md`.

## In scope
- A new Python project: `pyproject.toml` (managed with `uv`), the harness module,
  and its unit tests.
- The harness only. No `habit-mapper` / `habit-sensors` / `habit-snooze` yet.

## Out of scope — do NOT touch
- `docs/*.md` content (you may READ them; do not edit any spec or doc — the
  reconciliation pass is a separate phase).
- `plugins/**`, `skills/**`, `README.md`, `CHANGELOG.md`.
- Do not implement any product behaviour to make a `🟡` case pass — those stay
  skipped.

## What the harness must do (from `docs/executable_spec.md` — read it, don't trust this summary alone)
- **Execution contexts**: every Markdown heading opens a context running until the
  next heading of the same or higher level. Sibling contexts are isolated (fresh
  temp working dir + env each). A context inherits ancestors' *preambles* (steps
  between an ancestor heading and its first child heading), accumulated down the
  whole ancestry. Only **leaf** contexts (no child heading) are test cases.
- **Markers** (matched by base codepoint; ignore any U+FE0F): `📄<path>` (+block,
  or `@<src>` copy form), `✏️<VAR>` (+block → env var), `⌨️` (+block → stdin for
  next command), ` ```bash ` (run command in temp dir with pending stdin + env),
  `🖥️ ✅` / `🖥️ ❌ <N>` (assert last exit code), `🚨` (assert stderr).
- ` ```bash ` blocks are reserved for commands; never consume them as a marker
  payload. A block's info string is cosmetic — only the marker decides its role.
- **Output assertion**: when an expected block follows `🖥️`/`🚨`, the stream must
  equal it after normalising — strip ANSI, trim trailing whitespace per line, drop
  trailing blank lines. No block → that stream is unchecked.
- **Exit defaults to 0**: a command with no following `🖥️`/`🚨` must still succeed.
- **Skip**: a trailing `🟡` on a heading marks that test skipped (report, don't run).

## Steps
1. Scaffold the `uv` project + pytest. Keep dependencies minimal.
2. TDD the harness: write its unit tests first (one per marker, plus context
   isolation, ancestor-preamble accumulation, skip reporting, output
   normalisation), then implement until green.
3. Wire discovery of `docs/**/*.spec.md` and a runner that reports pass/skip/fail.
4. Verify: run the full acceptance gate, fix failures, repeat until green.

## Self-verification loop
After every change run the gate, read failures, fix, re-run. Do not claim success
until the gate passes clean **and** you have shown the passing output.

## Minimal implementation (HARD RULE)
Write the least code that satisfies the spec. Before finishing, spawn a reviewer
sub-agent whose explicit brief is: (1) correctness against `docs/executable_spec.md`;
(2) **push back on any code that is not necessary, or that could be simplified to
reduce overall code size without losing functionality.** Loop back on its findings
before committing. No speculative generality, no unused options, no abstraction a
single caller doesn't need.

## On blockers / ambiguity
- The grammar is ambiguous and `docs/executable_spec.md` does not settle it →
  **stop and report**; do not guess at observable behaviour.
- Purely internal/cosmetic choices (module layout, helper names) → pick the
  simplest option and note it.
- Stuck after a real attempt → stop, summarise what you tried and what blocks you.
  Do not invent workarounds or silence checks.

## Guardrails
- Do not push. Never force-push. No destructive git/db ops.
- Do not weaken tests or skip cases to go green.
- Stay in scope; log unrelated issues, don't fix them.

## End state
One commit on `v1.0` after the reviewer is satisfied:
`build(spec-harness): runnable executable-spec test harness`. **Do not push.**
