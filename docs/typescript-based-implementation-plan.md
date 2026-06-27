# TypeScript-based implementation plan

One possible build, in TypeScript. The contracts are language-agnostic
([architecture.md](architecture.md)); this records how a TS implementation
decomposes — **every piece is either owned by an existing package or small
enough to read on one screen** (`[~N lines]`). If a piece grows past that, it is
wrong — split it or find a package.

## Dependencies

| Package      | Owns                                              |
|--------------|---------------------------------------------------|
| `commander`  | CLI arg parsing                                   |
| `smol-toml`  | TOML parsing (config + sensor specs)              |
| `fast-glob`  | file discovery                                    |
| `execa`      | running subprocesses (stdin/stdout/timeout)       |
| `p-map`      | parallel execution with a concurrency cap         |
| `toposort`   | ordering sensors by dependency                    |
| `dot-prop`   | dot-path field extraction for adapter sensors     |
| `nunjucks`   | guide template rendering                          |

Findings travel as a JSON array — `JSON.parse` / `JSON.stringify`, no package.

## habit-sensors

The only non-trivial command. Six pieces:

| Piece        | Responsibility                                                        | How |
|--------------|----------------------------------------------------------------------|-----|
| **cli**      | parse `--config` + scope flags (`--last/--branch/--since/--all`)      | `commander` |
| **config**   | read project + plugin `config.toml`s, merge (override order)          | `smol-toml` + `[~15 lines]` merge |
| **registry** | scan `sensors/` dirs across the override chain, resolve name → spec   | `[~20 lines]` first-match lookup |
| **scope**    | glob the tree, optionally intersect with git-changed files           | `fast-glob` + `[~30 lines]` (resolve ref → `git diff --name-only`) |
| **schedule** | topo-order sensors by smell-dependency (producers before transformers)| `toposort` + `[~10 lines]` smell→producer map |
| **run**      | run producers in parallel; feed transformers (composites + snooze filter) their inputs; apply adapter-sensor mapping; merge to one JSON array | `p-map` + `execa` + `[~30 lines]` glue |

The descriptor (`produces`/`language`/`dependsOn`/`files`) is read statically
from each sensor's `.toml`, so scheduling needs no subprocess. Bundled sensor
scripts are referenced via `${dir}` (the spec's directory); a sensor's `command`
is run as-is otherwise.

## Adapter mapping

Not a separate command — the mapping `habit-sensors` applies to an adapter
sensor's tool JSON.

| Piece | How |
|-------|-----|
| read tool JSON, extract via `group`/`items` paths, remap `fields`, translate raw→smell via `map`, emit findings | `dot-prop` + `[~40 lines]` |

Replaces the hand-rolled `src/sensors/adapter.ts`.

## Snooze filter

A filter sensor (not a separate command), plus the index lifecycle.

| Piece | How |
|-------|-----|
| filter: drop findings the snooze index covers (keyed by file + smell) | `[~30 lines]` (reuses the baseline keying logic) |
| `snooze` / `prune` / `list` lifecycle commands                        | `commander` + `[~30 lines]` |

## habit-mapper

| Piece | How |
|-------|-----|
| parse the findings array, route each by smell                                | `[~10 lines]` |
| resolve guide across the override chain (finding's `language`, then `generic`); unrouted → `uncoached.md` | `[~20 lines]` first-match |
| render template / run script                                                 | `nunjucks` + `execa` |
| compute exit code from severities (unrouted defaults to enforced)            | `[~10 lines]` |

## What this deletes

The rebuild removes, among others: `src/wrap/*` (→ `execa`),
`src/sensors/adapter.ts` (→ the adapter mapping), the TS-baked sensor
factories/registry (→ `.toml` specs), and the ~1.3k-line `src/cli/init/*`
scaffolder (→ copying override templates).
