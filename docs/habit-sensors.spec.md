# habit-sensors

`habit-sensors` is the **extract-and-transform runner**: it assembles the
configured sensors and transformers into a pipeline, runs it over the files in
scope, and prints a `{smell, language?, details, issues}` findings array on
stdout — the input to `habit-mapper`. `habit-hooks` is just `habit-sensors $ARGS
| habit-mapper`.

This document specifies the runner's **behaviour** only: how sibling sensors
combine, how a plugin stamps its language, how the transformer chain runs, how
plugins compose, how a broken sensor is handled, and how scope flags pick the
files. The ETL model, plugins, and override resolution it rests on are described
in [architecture.md](architecture.md); the finding shape every step speaks is
the contract in [sensor-interface.spec.md](sensor-interface.spec.md); the TOML
config that wires it up is in [config.md](config.md).

```bash
habit-sensors() { ../../habit-sensors "$@"; }
```

## Sensors combine

### Sibling sensors concatenate in listed order 🟡

The runner runs each sensor in a plugin and concatenates their findings in the
order the plugin's `sensors` list names them.

📄.habit-hooks/config.toml
```toml
plugins = ["generic"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["alpha", "beta"]
```

📄.habit-hooks/generic/sensors/alpha.toml
```toml
command = "cat ${dir}/alpha.json"
```

📄.habit-hooks/generic/sensors/alpha.json
```json
[{"smell":"warning-comment","details":{},"issues":[]}]
```

📄.habit-hooks/generic/sensors/beta.toml
```toml
command = "cat ${dir}/beta.json"
```

📄.habit-hooks/generic/sensors/beta.json
```json
[{"smell":"oversized-file","details":{},"issues":[]}]
```

```bash
habit-sensors --all | jq -c '[.[].smell]'
```

🖥️ ✅
```json
["warning-comment","oversized-file"]
```

### A plugin stamps its declared language; the name need not match 🟡

A plugin *declares* the language it speaks in its `config.toml`, and the runner
stamps that onto the plugin's findings — even when the plugin's name is the tool
(`ruff`) rather than the language (`python`).

📄.habit-hooks/config.toml
```toml
plugins = ["ruff"]
```

📄.habit-hooks/ruff/config.toml
```toml
language = "python"
sensors  = ["check"]
```

📄.habit-hooks/ruff/sensors/check.toml
```toml
command = "cat ${dir}/out.json"
```

📄.habit-hooks/ruff/sensors/out.json
```json
[{"smell":"too-many-parameters","details":{},"issues":[]}]
```

```bash
habit-sensors --all | jq -c '[.[].language]'
```

🖥️ ✅
```json
["python"]
```

## Transformers reshape

### A transformer rewrites what it handles and passes the rest through 🟡

A transformer receives the whole findings array on stdin and returns a new one.
Here it tags every `warning-comment` finding and leaves the `oversized-file`
finding untouched — the pass-through rule that lets transformers compose freely.

📄.habit-hooks/config.toml
```toml
plugins      = ["generic"]
transformers = ["tag"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["alpha", "beta"]
```

📄.habit-hooks/generic/sensors/alpha.toml
```toml
command = "cat ${dir}/alpha.json"
```

📄.habit-hooks/generic/sensors/alpha.json
```json
[{"smell":"warning-comment","details":{},"issues":[]}]
```

📄.habit-hooks/generic/sensors/beta.toml
```toml
command = "cat ${dir}/beta.json"
```

📄.habit-hooks/generic/sensors/beta.json
```json
[{"smell":"oversized-file","details":{},"issues":[]}]
```

📄.habit-hooks/generic/transformers/tag.toml
```toml
command = "jq 'map(if .smell == \"warning-comment\" then .details.tagged = true else . end)'"
```

```bash
habit-sensors --all | jq -c 'map({smell, details})'
```

🖥️ ✅
```json
[{"smell":"warning-comment","details":{"tagged":true}},{"smell":"oversized-file","details":{}}]
```

### The transformer chain runs left to right 🟡

When a node lists several transformers, the runner pipes the findings through
them in listed order, so each sees the previous one's output.

📄.habit-hooks/config.toml
```toml
plugins      = ["generic"]
transformers = ["first", "second"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["alpha"]
```

📄.habit-hooks/generic/sensors/alpha.toml
```toml
command = "cat ${dir}/alpha.json"
```

📄.habit-hooks/generic/sensors/alpha.json
```json
[{"smell":"warning-comment","details":{"steps":[]},"issues":[]}]
```

📄.habit-hooks/generic/transformers/first.toml
```toml
command = "jq 'map(.details.steps += [\"first\"])'"
```

📄.habit-hooks/generic/transformers/second.toml
```toml
command = "jq 'map(.details.steps += [\"second\"])'"
```

```bash
habit-sensors --all | jq -c '.[0].details.steps'
```

🖥️ ✅
```json
["first","second"]
```

## Plugins compose

### Active plugins concatenate; dropping one drops its findings 🟡

The root `plugins` list decides which plugins run, in order. Here `python` is
listed and `generic` is not, so only `python`'s sensors run and `generic`'s
findings never appear.

📄.habit-hooks/config.toml
```toml
plugins = ["python"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["g"]
```

📄.habit-hooks/generic/sensors/g.toml
```toml
command = "cat ${dir}/g.json"
```

📄.habit-hooks/generic/sensors/g.json
```json
[{"smell":"duplicated-code","details":{},"issues":[]}]
```

📄.habit-hooks/python/config.toml
```toml
language = "python"
sensors  = ["p"]
```

📄.habit-hooks/python/sensors/p.toml
```toml
command = "cat ${dir}/p.json"
```

📄.habit-hooks/python/sensors/p.json
```json
[{"smell":"too-many-parameters","details":{},"issues":[]}]
```

```bash
habit-sensors --all | jq -c '[.[] | [.smell, .language]]'
```

🖥️ ✅
```json
[["too-many-parameters","python"]]
```

## Failure is not false-clean

### A broken sensor fails the run; the rest still report 🟡

A spawn failure or a non-zero exit from a sensor's tool yields zero findings for
that sensor, a stderr notice naming it, and exit 1. The sibling sensors still
report — a broken tool is a failed run, never a clean one.

📄.habit-hooks/config.toml
```toml
plugins = ["generic"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["ok", "broken"]
```

📄.habit-hooks/generic/sensors/ok.toml
```toml
command = "cat ${dir}/ok.json"
```

📄.habit-hooks/generic/sensors/ok.json
```json
[{"smell":"warning-comment","details":{},"issues":[]}]
```

📄.habit-hooks/generic/sensors/broken.toml
```toml
command = "this-tool-does-not-exist"
```

```bash
habit-sensors --all | jq -c '[.[].smell]'
```

🖥️ ❌ 1
```json
["warning-comment"]
```

🚨
```text
habit-sensors: sensor 'broken' failed: this-tool-does-not-exist
```

## Scope

`habit-sensors` first picks the files the leaf sensors see, then expands
`${files}` to them. The scope flags are mutually exclusive; with none, the scope
comes from the `[scope]` config.

| Flag | Scope |
|------|-------|
| `--all` | every file |
| `--file <path>` | a single file |
| `--branch [base]` | changed vs `base` (default `scope.branchBase`) |
| `--last <n>` | changed in the last `n` commits |
| `--since <ref>` | changed since a commit |
| `--config <path>` | use an explicit config file |
| (none) | `scope.changedOnly` → uncommitted; else `scope.autoBranchOffMain` → vs base unless on `scope.mainBranch`; else all |

A git-mode flag run outside a git repository errors; the config-derived modes
fall back to scanning every file instead.

### --file scopes `${files}` to one file 🟡

`--file` narrows `${files}` to the one named path, so the sensor only sees
`src/a.txt` even though `src/b.txt` also exists.

📄.habit-hooks/config.toml
```toml
plugins = ["generic"]
```

📄.habit-hooks/generic/config.toml
```toml
sensors = ["echo-files"]
```

📄.habit-hooks/generic/sensors/echo-files.toml
```toml
command = "jq -n --args '[{smell: \"warning-comment\", details: {}, issues: ($ARGS.positional | map({key: ., details: {file: .}}))}]' ${files}"
```

📄src/a.txt
```text
a
```

📄src/b.txt
```text
b
```

```bash
habit-sensors --file src/a.txt | jq -c '[.[].issues[].key]'
```

🖥️ ✅
```json
["src/a.txt"]
```
