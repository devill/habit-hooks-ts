# Open questions

Parked decisions and gaps for the `simplified` rewrite. Written so it can be
picked up cold. Nothing here blocks the docs/specs already committed; it blocks
*implementation*.

## Design gaps (resolve before/while building)

1. **Sensor `command` bin resolution.** A spec's `command = "eslint ..."` relies
   on `PATH`. Decide how `habit-sensors` resolves a tool — project-local bin
   prepended to `PATH`, an absolute path, or as-is — which affects version
   fidelity for project-local tools (eslint, knip) vs global ones (ruff). _(from
   #15.1)_

2. **Conditional adapter mapping.** ESLint fatals (`ruleId: null`, `fatal: true`)
   must route to `parse-error` — a flat `map` can't branch on a *different* field.
   The `jq` variant ([adapter-jq-based.spec.md](adapter-jq-based.spec.md)) handles
   this naturally (`if .fatal then …`); the declarative DSL would need a
   conditional/fallback rule. Also decide an exit-code/notice policy for
   tool-level config errors (exit ∉ {0,1} with unparseable stdout). _(from
   #15.2/#15.3)_

3. **Config validation.** TOML parses but is not validated. The (now small) config
   surface still needs runtime validation; the tool depends on the rebuild
   language. _(#56)_

## Deferred decisions

- **Plugins as separately-installable packages.** Agreed direction: plugins
  eventually ship independently (`@habit-hooks/typescript`, etc.) for independent
  release + community contribution (#53/#54). For now the filesystem
  `plugins/<lang>` dir model stands; the package split is a **later, additive**
  step (its form depends on the rebuild language).

- **`init`'s new shape.** The ~1.3k-line scaffolder is slated for deletion in
  favour of copying override templates into `.habit-hooks/`. Revisit once its new
  (much smaller) shape is decided.
