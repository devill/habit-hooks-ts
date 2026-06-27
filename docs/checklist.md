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

## Phase 0 — Doc reconciliation (no product code)

The finding contract is **`mapper.spec.md`**: a sensor emits **one entry per
smell** — `{smell, language?, details}` — and the `details` bag carries the
`issues: [...]` list. Make every other doc match.

- [ ] `architecture.md` "The bag": show the per-smell aggregated shape, not a
      single-occurrence `details`.
- [ ] `sensors.md`: a sensor emits one `{smell, details}` per smell with an
      `issues` array; native and adapter sensors both aggregate.
- [ ] `adapter.spec.md`: rewrite the jq transforms to `group_by(.smell)` and
      build `details.issues[]` (keep them runnable — pure jq, no skip marker).
- [ ] `building-a-plugin.spec.md`: same aggregated shape in the worked example.
- [ ] Remove stale `map`-block references (`smell-vocabulary.md`,
      `open_questions.md`) — the DSL is gone, jq does mapping.
- [ ] Standardize on plural `languages` for the project config key everywhere.
- [ ] Replace "Nunjucks" with "Jinja2" in prose (`guide.md`, `architecture.md`,
      `mapper.spec.md`) — the core is Python; the template syntax in the specs is
      already Jinja2-compatible, only the named library changes.
- [ ] Record the resolutions below in `DECISIONS.md` once confirmed.

### Resolutions to confirm and apply

- **line-count threshold** — move the default out of the baked command into
  `plugins/generic/config.toml` `[sensors.line-count] args = ["--max", "200"]`;
  define sensor `args` as **replace-on-override** so a project's `["--max","300"]`
  wins cleanly (no double `--max`). Update `config.md`.
- **plugin `language` key** — redundant with the plugin directory name. Derive
  the per-finding language stamp from the plugin dir; drop the config key; keep an
  explicit per-sensor `language` only as an override. Document in `config.md`.
- **bin resolution (open_q #1)** — `habit-sensors` prepends project-local bins
  (`node_modules/.bin`, `.venv/bin`) to `PATH` so project tools beat globals.
- **tool-error policy (open_q #2)** — jq's `if .fatal then "parse-error"` covers
  conditional mapping; a tool error (exit ∉ {0,1} or unparseable stdout) → stderr
  notice + exit 1 ("failure is not false-clean").
- **composite config** — add `mode = "augment" | "replace"` (default `augment`)
  to the sensor spec alongside `dependsOn`; the composite reads its `dependsOn`
  findings on stdin. Demonstrated only in the demo project.

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

- [ ] `habit-mapper` — group findings by smell, render guides (Nunjucks-equivalent
      templating in Python), resolve guides across the override chain, run fix
      runners for non-`.md` guides, set the exit code from severity. Drive with
      `mapper.spec.md`.
- [ ] `habit-sensors` — resolve the sensor set, order producers/composites, run
      commands, stamp language, merge findings, apply the tool-error policy and
      bin resolution.
- [ ] `habit-snooze` — filter sensor + `--snooze`/`--prune`/`--list`, git-default
      / mtime-fallback keying. Drive with `snoozer.spec.md`.
- [ ] `habit-hooks` — the `habit-sensors | habit-mapper` composition.
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
