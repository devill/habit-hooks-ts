# habit-sensors

`habit-sensors` runs the configured pipeline and prints a `{smell, language?,
details, issues}` findings array on stdout — the input to `habit-mapper`
([mapper.spec.md](mapper.spec.md)). `habit-hooks` is just `habit-sensors $ARGS |
habit-mapper`.

```bash
habit-sensors() { ../../habit-sensors "$@"; }
```

## Sensors, transformers, plugins

The pipeline is a recursive ETL. A **sensor** senses — no input, runs over the
scoped files, emits findings. A **transformer** maps `findings → findings` on
stdin/stdout and **must pass through whatever it does not handle** — that one
invariant removes any need for a dependency graph, augment/replace modes, or an
output stage. A node concatenates its child sensors, then pipes them through its
transformer chain in listed order, and composes recursively:

```
root   = transformers([snooze]) ∘ concat(generic, python)
python = transformers([])       ∘ concat(ruff, deptry, line-count)
```

A **plugin** is a bundle — `sensors/`, `transformers/`, `guides/`, `config.toml`
— resolved across `.habit-hooks/<plugin>` → `<package>/plugins/<plugin>`. The
root `plugins` list is **ordered = lookup priority**: the concat order here, and
the mapper's guide-resolution order (first plugin handling `(smell, language)`
wins, then `generic`). A plugin **declares** its `language` (`generic` declares
none), so a plugin's name need not be its language and several plugins can share
one — e.g. `eslint` and `biome`, both `typescript`. `generic` is listed
explicitly so a project can drop it.

## Config

```toml
# .habit-hooks/config.toml — root node
plugins      = ["generic", "python"]
transformers = ["snooze"]
```
```toml
# .habit-hooks/generic/config.toml — a plugin node
sensors      = ["line-count"]
transformers = []
```

A leaf **sensor** is `sensors/<name>.toml` — `command` (required), optional
`language`/`files`. A **transformer** is `transformers/<name>.toml` — a `command`
reading findings on stdin and writing findings on stdout. `${files}` expands to
the scoped files, `${dir}` to the spec's own directory.

## Sensors

### A sensor's command output is the findings array 🟡

📄.habit-hooks/config.toml
```toml
plugins = ["generic"]
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
[{"smell":"warning-comment","details":{},"issues":[{"key":"src/a.txt","details":{"file":"src/a.txt","line":1,"message":"TODO a"}}]}]
```

```bash
habit-sensors --all | jq -c .
```

🖥️ ✅
```json
[{"smell":"warning-comment","details":{},"issues":[{"key":"src/a.txt","details":{"file":"src/a.txt","line":1,"message":"TODO a"}}]}]
```

### Sibling sensors concatenate in listed order 🟡

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

## Transformers

### A transformer rewrites what it handles, passes the rest through 🟡

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

`python` is listed, `generic` is not — so only `python`'s sensors run.

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

A spawn or non-zero tool failure yields zero findings for that sensor, a stderr
notice, and exit 1 — a broken tool is a failed run, not a clean one.

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

`habit-sensors` picks the files the leaf sensors see, then expands `${files}`.
Flags are mutually exclusive; with none, scope comes from `[scope]` config.

| Flag | Scope |
|------|-------|
| `--all` | every file |
| `--file <path>` | a single file |
| `--branch [base]` | changed vs `base` (default `scope.branchBase`) |
| `--last <n>` | changed in the last N commits |
| `--since <ref>` | changed since a commit |
| `--config <path>` | use an explicit config file |
| (none) | `scope.changedOnly` → uncommitted; else `scope.autoBranchOffMain` → vs base unless on `mainBranch`; else all |

A git-mode flag outside a git repo errors; config-derived modes fall back to all.

### --file scopes `${files}` to one file 🟡

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
