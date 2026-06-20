# Implementation

How each CLI decomposes. The rule: **every piece is either owned by an existing
package or small enough to read on one screen** (`[~N lines]`). If a piece grows
past that, it is wrong — split it or find a package.

## Dependencies

| Package      | Owns                                              |
|--------------|---------------------------------------------------|
| `commander`  | CLI arg parsing                                   |
| `smol-toml`  | TOML parsing (config + sensor specs)              |
| `fast-glob`  | file discovery                                    |
| `execa`      | running subprocesses (stdin/stdout/timeout)       |
| `p-map`      | parallel execution with a concurrency cap         |
| `toposort`   | ordering sensors by dependency                    |
| `dot-prop`   | dot-path field extraction in the adapter          |
| `nunjucks`   | guide template rendering                          |

JSONL is split-on-newline + `JSON.parse` per line — no package.

## habit-sensors

The only non-trivial CLI. Six pieces:

| Piece        | Responsibility                                                        | How |
|--------------|----------------------------------------------------------------------|-----|
| **cli**      | parse `--config` + scope flags (`--last/--branch/--since/--all`)      | `commander` |
| **config**   | read project + plugin `config.toml`s, merge (override order)          | `smol-toml` + `[~15 lines]` merge |
| **registry** | scan `sensors/` dirs across the override chain, resolve name → spec   | `[~20 lines]` first-match lookup |
| **scope**    | glob the tree, optionally intersect with git-changed files           | `fast-glob` + `[~30 lines]` (resolve ref → `git diff --name-only`) |
| **schedule** | topo-order sensors by smell-dependency (producers before composites) | `toposort` + `[~10 lines]` smell→producer map |
| **run**      | run leaves in parallel; feed composites their deps on stdin; pipe adapter sensors through `habit-adapter`; merge to JSONL | `p-map` + `execa` + `[~30 lines]` glue |

The descriptor (`produces`/`dependsOn`/`files`) is read statically from each
sensor's `.toml`, so scheduling needs no subprocess. Bundled sensor scripts are
referenced via `${dir}` (the spec's directory); a sensor's `command` is run as-is
otherwise.

## habit-adapter

| Piece | How |
|-------|-----|
| read tool JSON on stdin, extract via `group`/`items` paths, remap `fields`, translate raw→smell via `map`, emit JSONL | `dot-prop` + `[~40 lines]` |

Replaces the hand-rolled `src/sensors/adapter.ts`.

## habit-snoozer

| Piece | How |
|-------|-----|
| filter: drop JSONL lines whose `{file-hash, smell}` is in the index | `[~30 lines]` (reuses the file-hash baseline logic) |
| `snooze` / `prune` / `list` lifecycle commands                       | `commander` + `[~30 lines]` |

## habit-mapper

| Piece | How |
|-------|-----|
| group JSONL by smell                                  | `[~10 lines]` |
| resolve guide (`<smell>.md` / `<smell>` script) across override chain | `[~20 lines]` first-match |
| render template / run script                          | `nunjucks` + `execa` |
| compute exit code from severities                     | `[~10 lines]` |

## What this deletes

The rebuild removes, among others: `src/wrap/*` (→ `execa`),
`src/sensors/adapter.ts` (→ `habit-adapter`), the TS-baked sensor
factories/registry (→ `.toml` specs), and the ~1.3k-line `src/cli/init/*`
scaffolder (→ copying override templates).
