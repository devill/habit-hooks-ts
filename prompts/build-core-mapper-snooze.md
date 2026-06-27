# Build the core: habit-mapper + habit-snooze

## Goal
Build the two core CLIs whose behaviour is already fully pinned by executable
specs: `habit-mapper` (`docs/mapper.spec.md`) and `habit-snooze`
(`docs/snoozer.spec.md`). These are the well-defined parts of the `simplified`
rebuild; `habit-sensors` and the language plugins are deliberately **out of scope**
here because their specs/decisions aren't settled yet (see `docs/open_questions.md`).

**Depends on the spec test harness existing** (see
`prompts/build-spec-harness.md`). If it isn't built and green, stop and say so —
do not build it here.

## Acceptance gate (run these; all must pass; show the output)
- The spec harness runs `docs/mapper.spec.md` **fully green** with every `🟡`
  skip marker removed from that file.
- The spec harness runs `docs/snoozer.spec.md` **fully green** with every `🟡`
  removed from that file.
- The harness's own unit tests still pass, and `docs/adapter.spec.md` is still green.
- `uv run pytest` (or `python -m pytest`) is green overall.

## In scope
- `habit-mapper`: read `{smell, language?, details}` findings as JSON on stdin,
  group by smell, render each smell's guide, set the exit code from severity.
  - **Jinja2** templating for `.md` guides (the specs' template syntax is
    Jinja2-compatible; `smell`, `language`, and the `details` fields in scope).
  - Guide resolution across the override chain
    `.habit-hooks/<lang>` → `.habit-hooks/generic` → `plugins/<lang>` →
    `plugins/generic`; a finding's `language` selects the language guide first.
  - Config (`config.toml`): per-smell `severity` / `guide` overrides, `[runners]`
    for non-`.md` guides (run `<runner> <guide>` with the finding on stdin, use
    its exit code, show stdout/stderr). `enforced` → exit 1, `suggested` → exit 0.
  - Unknown smell → `enforced` + the generic `uncoached.md`. No findings → the
    `clean.md` pass reminder.
  - A built-in default-severity **catalogue** (from `docs/smell-vocabulary.md`).
    Consult `main` for the exact default severities and recreate them.
- `habit-snooze`: filter sensor — pass findings through, dropping snoozed ones;
  `--snooze` / `--prune` / `--list` maintain the checked-in index; a snooze lapses
  when the file changes (git-default, mtime fallback).
- Ship the generic guides referenced by the product: `clean.md` and
  `warning-comment.md` in `plugins/generic/guides/`.
- Editing `docs/mapper.spec.md` and `docs/snoozer.spec.md` **only to remove `🟡`
  markers** as each case passes.

## Out of scope — do NOT touch
- `habit-sensors`, `habit-hooks` (the composition), any plugin **sensor** specs
  or scripts, the TS/Python/csharp plugins.
- The other docs' content (Phase 0 doc reconciliation is separate). You may READ
  any doc; only edit the two spec files above, and only to drop `🟡`.
- `README.md`, `CHANGELOG.md`, `skills/**`.

## Steps
1. Confirm the harness is present and green; if not, stop and report.
2. `habit-mapper`, TDD: un-skip one `mapper.spec.md` case at a time, make it pass,
   move to the next. Build only what each case demands.
3. `habit-snooze`, TDD the same way against `snoozer.spec.md`.
4. Add `clean.md` and `warning-comment.md`.
5. Verify: run the full gate, fix failures, repeat until green.

## Self-verification loop
After every change run the gate, read failures, fix, re-run. Do not claim success
until the full gate passes clean **and** you have shown the passing output.

## Minimal implementation (HARD RULE)
Write the least code that makes the specs pass. Before committing, spawn a reviewer
sub-agent whose explicit brief is: (1) correctness against the two specs and the
override/severity rules; (2) **push back on any code that is not necessary, or
that could be simplified to reduce overall code size without losing
functionality.** Loop back on its findings. No speculative generality, no options
no spec exercises, no abstraction a single caller doesn't need.

## On blockers / ambiguity
- A spec is ambiguous and the referenced docs don't settle it → **stop and
  report**; do not guess at observable behaviour.
- A case needs `habit-sensors` or plugin work to pass → it's out of scope; leave
  its `🟡` in place and note it.
- Internal/cosmetic choices (module layout, helper names) → pick the simplest and
  note it.
- Stuck after a real attempt → stop, summarise what you tried and what blocks you.

## Guardrails
- Do not push. Never force-push. No destructive git/db ops.
- Do not weaken tests or skip cases to go green; only remove a `🟡` when its case
  genuinely passes.
- Stay in scope; log unrelated issues, don't fix them.

## End state
Commit on the working branch after the reviewer is satisfied — either one commit
or one per CLI:
`build(mapper): render+route findings to guides` and
`build(snooze): filter sensor + snooze index`. **Do not push.**
