# Open questions

Parked decisions and gaps for the `simplified` rewrite. Written so it can be
picked up cold. Nothing here blocks the docs/templates already committed; it
blocks *implementation*.

## Design gaps the rewrite creates (must resolve before/while building)

These surfaced from folding issue #15 into the new sensor contract — the current
`sensors.md`/`typescript-based-implementation-plan.md` gloss over them.

1. **Sensor `command` bin resolution.** A spec's `command = "eslint ..."` relies
   on PATH. Today's wrapper resolves the *consumer's* local tool
   (`node_modules/.bin`) with a bundled fallback (`detectTool` / `resolveEslintBin`).
   Decide how `habit-sensors` runs a command: project `.bin` prepended to PATH?
   `npx`? a resolved absolute path? Affects version fidelity for project-local
   tools (eslint, knip) vs global ones (ruff, deptry). _(from #15.1)_

2. **`habit-adapter` conditional mapping.** ESLint fatals (`ruleId: null`,
   `fatal: true`) must route to `parse-error` — a flat `map` keyed on the raw
   smell value can't branch on a *different* field. The adapter needs a
   conditional/fallback rule (e.g. "if `fatal` then `parse-error`"). Also decide
   an exit-code/notice policy for tool-level config errors (exit ∉ {0,1} with
   unparseable stdout). _(from #15.2, #15.3)_

3. **Config validation.** `smol-toml` parses but does not validate. The new TOML
   surface still needs runtime validation — pick zod or valibot (#56) and apply
   it to the (now much smaller) schema.

## Deferred decisions

- **Plugins as separate npm packages.** Agreed direction: plugins eventually
  become separately-installable packages (`@habit-hooks/typescript`, etc.) for
  independent release + community contribution (#53/#54). For now the filesystem
  `plugins/<lang>` dir model stands; the npm-package split is a **later step**
  layered on top. The contract (`.toml` specs + guides, override-only
  `.habit-hooks/`) is designed to make that move additive.

- **init's new shape.** The ~1.3k-line `src/cli/init/*` scaffolder is slated for
  deletion in favour of copying override templates into `.habit-hooks/`. Once its
  new (much smaller) shape is decided, revisit #22 (apply ruff thresholds in
  place) — it may be obsolete, since thresholds now live on sensor specs / the
  consumer's own tool config.

## Issue fold-in summary

How the open issues map onto the simplified architecture (full analysis in the
session that produced this branch).

| Issue | Disposition |
|-------|-------------|
| #54 move sensors to plugins | **Subsumed** by the plugin-dir design (npm-package axis deferred above). |
| #50 sensor params in entries | **Subsumed** — params live on the `.toml` spec; no special built-ins. |
| #15 eslint → declarative adapter | **Subsumed** (eslint.toml is the spec); its edge cases → design gaps §1–2. |
| #53 plugin infrastructure | **Subsumed** (dirs now; packages later). |
| #52 consolidate oversized-file | **Closed** — diverged: generic line-count default, TS overrides with eslint `max-lines` (language standard). |
| #59 knip production mode | **Reshaped** — fix lives in `plugins/typescript/sensors/knip.js`. |
| #56 zod/valibot validation | **Reshaped** — still wanted, smaller TOML schema (gap §3). |
| #22 init applies ruff thresholds | **Reshaped/maybe-obsolete** — pending init's new shape. |
| #58 / #57 slow + stochastic tests | **New sensors** — duplicates; close one. Native AST (stochastic) + vitest-json timing (slow). |
| #4 array-join:fixed-shape | **New sensor** — native ts-morph. |
| #3 coverage signal | **New sensor** — reads a coverage report path. |
| #55 `--file` ignoring snoozes | **Trivial** — `habit-sensors --file x`, skip the snoozer in the composition. |
| #6 review subcommand | **Orthogonal** — sibling package / LLM; unaffected by the re-org. |

## Housekeeping

- #57 and #58 are duplicates — close one when convenient.
