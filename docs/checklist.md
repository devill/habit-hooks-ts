# Rebuild checklist

The `simplified` rewrite, phase by phase. Source of truth for *what to build* is
the executable specs in `docs/**/*.spec.md`; this file tracks *order* and the
decisions taken while reconciling the docs. See [DECISIONS.md](DECISIONS.md) and
[open_questions.md](open_questions.md) for rationale.

## Guiding rules (apply to every phase)

- **Minimal implementation.** Write the least code that makes the specs pass.
  The reviewer pushes back on anything not strictly necessary, or anything that
  could be simplified to cut overall code size without losing functionality.
- **Language-agnostic core.** The tool is Python. Everything language-specific
  lives in a plugin; the core knows nothing about TypeScript, Python-as-a-target,
  or any tool. Plugins move out of this repo eventually.
- **Specs are the gate.** Each behaviour ships only when its `*.spec.md` case
  passes with the `🟡` skip marker removed.
- **TDD + reviewer per phase.** Implement → run the gate green → reviewer
  sub-agent (correctness + the minimal-implementation rule) → commit. Never
  bundle phases.
- **Consult `main` only for default settings** — recreate the exact thresholds,
  rule sets, and severities the old implementation shipped (eslint config, knip,
  jscpd, ruff/deptry defaults, smell severities). Do not copy its code.

## Core dependencies (decided 2026-06)

The core stays close to "a few small pipes": stdlib does most of it, with three
vetted runtime deps (all checked for active maintenance + ecosystem reach).

| Need | Choice | Notes |
|------|--------|-------|
| Template rendering (mapper) | **Jinja2** | Pallets-backed, BSD-3. Spec templates are already Jinja2 syntax. |
| File glob / path matching (sensor scope) | **pathspec** (gitwildmatch) | Most-depended-upon globber in the ecosystem (Black uses it); MPL-2.0. **No brace expansion** — author globs as a list (Phase 0 task). Walk a tree via `match_tree_files(root)`. |
| Config validation (open q #3) | **pydantic v2** | MIT, Rust core ships as prebuilt wheels (~few MB, no toolchain). Validates the merged TOML config. |
| Read TOML (config + sensor specs) | `tomllib` (stdlib) | 3.11+, read-only — all the core ever does is read. |
| CLI arg parsing | `argparse` (stdlib) | the CLIs are tiny; no framework dep. |
| Parallel leaf-sensor runs | `concurrent.futures` (stdlib) | sensors are subprocess-bound, threads suffice. |
| Subprocess / git / fix runners | `subprocess` (stdlib) | git for `--branch`/`--last`/`--since` scope — not GitPython. |
| Snooze index storage | JSON (stdlib) | machine-managed file; `tomllib` can't write TOML and the index isn't hand-edited. |

License note: pathspec is MPL-2.0 (weak, file-level copyleft) — fine to depend
on; Jinja2 is BSD-3, pydantic MIT.

**Packaging shift (Phase 2 prep).** Today's `pyproject.toml` sets
`package = false` with deps only in the `dev` group — it wires up the spec
harness, nothing more. Building the core CLIs turns habit-hooks into a real
Python package: drop `package = false`, add `[project.scripts]` entry points
(`habit-mapper`, `habit-sensors`, `habit-snooze`, `habit-hooks`) and the runtime
deps above (`jinja2`, `pathspec`, `pydantic`).

## Phase 0 — Doc reconciliation (no product code)

The pipeline + finding contract is now pinned in **`habit-sensors.spec.md`** and
**`mapper.spec.md`**: the runner is a recursive ETL of sensors + pass-through
transformers (see [DECISIONS.md](DECISIONS.md) "Pipeline redesign"), and a
finding is `{smell, language?, details, issues}` where `issues` is a list of
`{key, details}`. Every other doc still describes the **superseded** model
(`dependsOn`, composites, augment/replace, `details.issues`, `languages`) and
must be brought into line.

- [ ] `architecture.md`: replace "The bag" + "Transforming sensors" + the
      language-based resolution with the new contract (`issues` sibling of
      `details`, each `{key, details}`), the ETL model (sensor vs transformer +
      pass-through invariant + recursive concat-then-transform), and **ordered
      `plugins` = lookup priority**. Drop `dependsOn`/composite/augment-replace.
- [ ] `sensors.md`: rewrite around **sensor** (senses, no input) vs
      **transformer** (stdin→stdout, passes through what it doesn't handle). Drop
      `produces`, `dependsOn`, composites, filter sensors, activation.
- [ ] `guide.md`: more than the Jinja2 rename — its template prose still treats
      `issues` as living inside `details` (→ top-level sibling, `{% for v in
      issues %}{{ v.details.file }}`), and its guide-selection still says "a
      finding's `language` selects a language-specific guide" (→ ordered-`plugins`
      lookup priority, first plugin handling `(smell, language)`, then generic).
      Also note `[runners]` is plugin-shippable, so a plugin runs its own
      language-specific fixers by default (core renders only `.md`).
- [ ] `mapper.spec.md`: promote `issues` to a top-level sibling of `details`;
      switch templates to `details.maxAllowed` and `{% for v in issues %}{{
      v.details.file }}`; add the **plugin-order guide-resolution** case (walk
      `plugins` in order, first that handles `(smell, language)` wins, then
      `generic`).
- [ ] `adapter.spec.md`: rewrite the jq transforms to emit one finding per smell
      with `issues: [{key, details}]` (keep runnable — pure jq, no skip marker).
- [ ] `building-a-plugin.spec.md`: new contract shape, sensor + transformer, a
      plugin **declaring** its `language`, and `plugins`/`sensors`/`transformers`
      config.
- [ ] `snoozer.spec.md`: rewrite for **issue-key** snooze — drop the mtime
      lapse case; snooze is a transformer keyed on `issue.key` (filename default
      = file-level); `--prune` drops keys absent from the latest run.
- [ ] `smell-vocabulary.md`: drop the composite / `needs-extraction` rows and the
      stale `map`-block references.
- [ ] `config.md` + `config.example.toml`: `plugins` (ordered, each declaring its
      `language`) replacing `languages`; add `transformers`; drop
      `produces`/`dependsOn`/`mode`; document the one-file runner+mapper split;
      state that `[runners]` may be shipped by a **plugin** (resolved through the
      override chain), not just the project.
- [ ] Write `docs/habit-hooks.spec.md` — the trivial composition `habit-sensors
      $ARGS | habit-mapper`, proving args forward and the mapper's exit code
      propagates.
- [ ] Remove the `languages` open-question / `map`-block leftovers in
      `open_questions.md`.
- [ ] Replace brace globs (`**/*.{ts,tsx,js,mjs,cjs}`) with a list of
      single-extension globs (`["**/*.ts", "**/*.tsx", …]`) everywhere they
      appear (`config.md`, `config.example.toml`, `architecture.md`, examples) —
      pathspec's gitwildmatch has no brace expansion.
- [ ] Replace "Nunjucks" with "Jinja2" in prose (`guide.md`, `architecture.md`,
      `mapper.spec.md`).

### Resolutions to confirm and apply

- **line-count threshold** — move the default out of the baked command into
  `plugins/generic/config.toml` `[sensors.line-count] args = ["--max", "200"]`;
  define sensor `args` as **replace-on-override** so a project's `["--max","300"]`
  wins cleanly (no double `--max`). Update `config.md`.
- **plugin `language` is declared, not derived** — a plugin sets `language` in its
  `config.toml`; the runner stamps it (generic declares none). Plugin name ≠
  language, so multiple plugins can share a language; a per-sensor `language`
  overrides. (Reverses the earlier derive-from-dir resolution.)
- **bin resolution (open_q #1)** — `habit-sensors` prepends project-local bins
  (`node_modules/.bin`, `.venv/bin`) to `PATH` so project tools beat globals.
- **tool-error policy (open_q #2)** — jq's `if .fatal then "parse-error"` covers
  conditional mapping; a tool error (exit ∉ {0,1} or unparseable stdout) → stderr
  notice + exit 1 ("failure is not false-clean").

### Cleanup

- [ ] Delete `plugins/generic/guides/oversized-function.issues.njk` (cruft).
- [ ] Delete `plugins/generic/guides/needs-extraction.md` and the
      `needs-extraction` catalogue row (composite ships only in the demo project).
- [ ] Remove the untracked `node_modules/` (no `package.json` exists).

## Phase 1 — Spec test harness (build first)

A Python harness that runs `docs/**/*.spec.md` per [executable_spec.md](executable_spec.md):
execution contexts, preamble inheritance, the marker grammar, skip (`🟡`), exit
and stderr assertions, output normalisation. It is a dev/test tool, not a shipped
command.

- [ ] Implement the harness with its **own unit tests** (every marker, context
      isolation, ancestor preamble accumulation, skip reporting, normalisation).
- [ ] Discover and run `docs/**/*.spec.md`; report pass / skip / fail.
- [ ] Green on `adapter.spec.md` (pure jq) and reports `mapper.spec.md`'s `🟡`
      cases as skipped without erroring.

## Phase 2 — Core CLIs (TDD against the harness)

- [ ] `habit-mapper` — group findings by smell, render guides (Jinja2), resolve
      guides across the override chain, run fix runners for non-`.md` guides, set
      the exit code from severity. Drive with `mapper.spec.md`.
- [ ] Config loader — merge TOML across the resolution chain (`tomllib`) and
      validate the merged result (pydantic v2); closes open question #3.
- [ ] `habit-sensors` — the recursive ETL: resolve active `plugins` (ordered),
      concat each plugin's child sensors, run its transformer chain, stamp the
      plugin's declared language, apply the scope flags + bin resolution +
      tool-error policy. Drive with `habit-sensors.spec.md`.
- [ ] `habit-snooze` — the snooze transformer (drops issues by `key`) +
      `--snooze`/`--prune`/`--list` maintaining the key index. Drive with
      `snoozer.spec.md`.
- [ ] `habit-hooks` — the `habit-sensors $ARGS | habit-mapper` composition.
      Drive with `habit-hooks.spec.md`.
- [ ] Generic guides: add `clean.md` (no-findings output) and `warning-comment.md`.

## Phase 3 — Generic plugin sensors (Python)

- [ ] `line-count` sensor in Python (replaces `line-count.js`).
- [ ] `jscpd` sensor: Python wrapper around the jscpd CLI (replaces `jscpd.js`).

## Phase 4 — TypeScript plugin

- [ ] `eslint` adapter (jq, aggregated) with `parse-error` fatal branch.
- [ ] `knip` sensor (Node helper) and `comment` sensor (ts-morph Node helper).
- [ ] Match `main`'s default eslint/knip thresholds and rule set exactly.

## Phase 5 — Python plugin

- [ ] `ruff` adapter (jq, aggregated) and `deptry` sensor (Python helper).
- [ ] Match `main`'s default ruff/deptry config exactly.

## Phase 6 — README + housekeeping (last for docs)

- [ ] Rewrite `README.md` — it still describes the deleted npm/TS design
      (`npm install`, `init`, "wraps", `habit-hooks.config.js`, baseline). Replace
      with the Python pipeline, `.habit-hooks/` overrides, and TOML config.

## Phase 7 — csharp plugin (build last)

- [ ] Replace the broken `plugins/csharp/sensors/linter.sh` stub with a working
      sensor, `config.toml`, and guides — only after core + TS + Python plugins
      pass their specs.
