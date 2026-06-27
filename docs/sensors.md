# Sensors

A sensor **finds smells**. It runs a tool (or a custom script) and emits one
`{smell, details}` JSON line per finding, translating raw tool output into
canonical [smell keys](smell-vocabulary.md).

Sensors are **additive** (each contributes lines independently) and
**deterministic** (mechanical detection, no judgement).

## A sensor is a `.toml` spec

Every sensor is `sensors/<name>.toml`. The spec is both the descriptor (read
statically, so ordering needs no subprocess) and the recipe for running it.

```toml
command  = "eslint -f json ${files}"     # required
produces = ["too-many-parameters", "high-complexity"]   # required
dependsOn = []                           # optional; smells consumed (composites)
files = ["**/*.{ts,tsx}"]                # optional; overrides discovery globs

# Adapter mapping — OMIT entirely when `command` already prints {smell,details} JSONL.
group  = "[]"                            # outer array: one entry per file (optional)
items  = "messages[]"                    # array of issues within each entry
fields = { smell = "ruleId", file = "group.filePath", line = "line", column = "column", message = "message" }
map    = { max-params = "too-many-parameters", complexity = "high-complexity" }
```

| Field       | Required | Meaning                                                     |
|-------------|----------|-------------------------------------------------------------|
| `command`   | yes      | Shell command to run. `${files}` expands to the scoped file list; `${dir}` to this spec's directory (for bundled scripts). |
| `produces`  | yes      | Smell keys this sensor can emit (used for ordering + activation). |
| `dependsOn` | no       | Smell keys it consumes — makes it a composite (see below).  |
| `files`     | no       | Per-sensor discovery globs, overriding the project/plugin globs. |
| mapping     | no       | `group`/`items`/`fields`/`map` — present only when the tool emits its own JSON shape. |

## Two kinds of sensor

The mapping block is the only difference:

- **Native sensor** — `command` already prints `{smell, details}` JSONL (a
  custom Python AST tool, a one-line script). No mapping block. `habit-sensors`
  runs the command and takes its output verbatim.
- **Adapter sensor** — wraps a tool that speaks its own JSON (ESLint, Ruff).
  The mapping block tells `habit-adapter` how to read it. `habit-sensors` runs
  `command | habit-adapter --spec <name>.toml`.

## habit-adapter

`habit-adapter` maps a tool's native JSON (on stdin) into `{smell, details}`
JSONL, driven by the spec's mapping block:

- `items` — dot-path to the array of issues. With `group`, the outer array is
  iterated first and `group.` in a field path reads the outer entry. Up to two
  levels of nesting, which covers the common toolchains.
- `fields` — each bag field ← a dot-path in the source issue (`location.row`).
- `map` — rewrites the raw `smell` value to a canonical key; the raw value is
  preserved in `details.source`. Omit for identity passthrough.

Flat tools (Ruff: `[]` of issues) set `items = "[]"` and no `group`. Nested
tools (ESLint: one entry per file, `messages[]` inside) set both. Anything the
adapter can't express becomes a native sensor with a small script.

## habit-sensors

`habit-sensors` assembles and runs the enabled sensors:

1. **Resolve** the sensor set: plugin defaults, minus `disabled`, plus project
   overrides ([config.md](config.md)).
2. **Order** by dependency. Leaf sensors (no `dependsOn`) run first, in
   parallel. A composite runs once every producer of its `dependsOn` smells has
   finished. Unsatisfiable dependencies or cycles are a startup error.
3. **Run** each sensor's `command`, piping through `habit-adapter` when the spec
   has a mapping block. A composite receives the issues for its `dependsOn`
   smells on **stdin**.
4. **Merge** every sensor's lines into one JSONL stream on stdout.

### Activation

A sensor only runs when at least one smell it `produces` is active — has a
non-disabled smell entry resolving to a non-empty in-scope file set. Disabling
every smell a sensor produces suppresses the whole sensor.

### Failure is not false-clean

A sensor must never silently swallow a broken tool. A spawn or timeout failure
surfaces as a stderr notice with zero lines for that sensor **and fails the run
(exit 1)** — a broken tool is a failed run, not a clean one. Every other sensor
still contributes its full output.

## Composites

A composite sensor sets `dependsOn` to the smells it consumes. It emits a
derived smell from their co-occurrence — e.g. `oversized-file` +
`duplicated-code` in one file → `needs-extraction`. This keeps combination
logic in the sensor layer and the mapper a pure single-smell function. By
default a composite **augments** (all smells show); a spec may instead
**replace** its inputs for the affected files.

No composite ships by default — `needs-extraction` lives in the demo project as a
worked example. The mechanism is part of the contract regardless.

## Filter sensors

A transforming sensor may **drop** findings instead of adding them. Snoozing is
the shipped example: it reads every finding and passes through all but the
snoozed ones (see [snoozer.spec.md](snoozer.spec.md)).

## Custom sensors

A project adds a sensor by dropping `sensors/<name>.toml` in its `.habit-hooks/`
plugin dir and pairing it with a smell entry ([config.md](config.md)). A native
sensor in any language works — it only has to print `{smell, details}` JSONL:

```toml
# .habit-hooks/python/sensors/instanceof.toml
command  = "python ${dir}/instanceof.py ${files}"
produces = ["instanceof-check"]
```
