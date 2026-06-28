# Smell vocabulary

The canonical, tool-independent catalogue of code smells. Sensors translate
raw tool output *into* these keys; the mapper routes *from* them to guidance.

## Naming rules

- **kebab-case**, lowercase, no namespace prefix (`too-many-parameters`,
  not `size/too-many-parameters` or `eslint:max-params`).
- Name the **smell**, never the tool or the tool's rule ID.
- A key may be language-specific (`explicit-any`) but must not be
  tool-specific.
- The default guide for a smell is `guides/<smell>.md` (the key, verbatim).

A smell may define the shape of the smell-level `details` and of each issue's
`details` (per-occurrence) that its sensors must provide and its prompt template
consumes — e.g. `duplicated-code` carries the duplicated block and its
occurrences, not just a single `file`/`line`. See the finding contract in
[sensor-interface.spec.md](sensor-interface.spec.md).

## Catalogue

Default severity: `enforced` fails the run (exit 1); `suggested` coaches but
exits 0. The mapper config can override it per project.

| Smell key                   | Title                                 | Default severity |
|-----------------------------|---------------------------------------|------------------|
| `oversized-function`        | Oversized function                    | enforced         |
| `too-many-parameters`       | Too many parameters                   | enforced         |
| `high-complexity`           | High cyclomatic complexity            | enforced         |
| `deep-nesting`              | Deep nesting                          | enforced         |
| `oversized-file`            | Oversized file                        | enforced         |
| `unused-variable`           | Unused variable                       | enforced         |
| `loose-equality`            | Loose equality                        | enforced         |
| `var-declaration`           | `var` declaration                     | enforced         |
| `non-const-binding`         | Reassignable binding never reassigned | enforced         |
| `duplicate-import`          | Duplicate import                      | enforced         |
| `warning-comment`           | Warning comment (TODO/FIXME/…)        | suggested        |
| `explicit-any`              | Explicit `any`                        | suggested        |
| `non-null-assertion`        | Non-null assertion                    | suggested        |
| `redundant-type-annotation` | Redundant type annotation             | enforced         |
| `non-essential-comment`     | Non-essential comment                 | suggested        |
| `duplicated-code`           | Duplicated code                       | suggested        |
| `unused-class-member`       | Unused class member                   | enforced         |
| `unused-file`               | Unused file                           | enforced         |
| `unused-export`             | Unused export                         | enforced         |
| `unused-dependency`         | Unused dependency                     | enforced         |
| `unused-import`             | Unused import                         | enforced         |
| `swallowed-exception`       | Swallowed exception                   | suggested        |
| `parse-error`               | Parse / config error                  | enforced         |

`unused-import` was added as a general smell (agent decision) so ruff `F401`
has a canonical home; see `DECISIONS.md`.

`swallowed-exception` is the first smell sourced only from ruff (`BLE001`), with
no TypeScript twin; it carries `source: 'ruff'`. See `DECISIONS.md`.

## TypeScript/JavaScript plugin translation

The raw rule IDs the TS/JS plugin's sensors translate into the smell keys (no
map-block), and the smell key each maps to.

| Raw key (tool:rule)                               | Smell key                   |
|---------------------------------------------------|-----------------------------|
| `eslint:max-lines-per-function`                   | `oversized-function`        |
| `eslint:max-params`                               | `too-many-parameters`       |
| `eslint:complexity`                               | `high-complexity`           |
| `eslint:max-depth`                                | `deep-nesting`              |
| `eslint:max-lines`                                | `oversized-file`            |
| `eslint:no-unused-vars`                           | `unused-variable`           |
| `eslint:eqeqeq`                                   | `loose-equality`            |
| `eslint:no-var`                                   | `var-declaration`           |
| `eslint:prefer-const`                             | `non-const-binding`         |
| `eslint:no-duplicate-imports`                     | `duplicate-import`          |
| `eslint:no-warning-comments`                      | `warning-comment`           |
| `eslint:@typescript-eslint/no-explicit-any`       | `explicit-any`              |
| `eslint:@typescript-eslint/no-non-null-assertion` | `non-null-assertion`        |
| `eslint:@typescript-eslint/no-inferrable-types`   | `redundant-type-annotation` |
| `comment:non-essential`                           | `non-essential-comment`     |
| `jscpd:duplication`                               | `duplicated-code`           |
| `knip:classMembers`                               | `unused-class-member`       |
| `knip:files`                                      | `unused-file`               |
| `knip:exports`                                    | `unused-export`             |
| `knip:dependencies`                               | `unused-dependency`         |
| `eslint:fatal`                                    | `parse-error`               |

## Python plugin translation

The raw rule IDs the Python plugin's sensors translate into the smell keys (no
map-block), and the smell key each maps to (the rest of the catalogue is shared —
only the plugin's sensors differ).

| Raw key (tool:rule) | Smell key             |
|---------------------|-----------------------|
| `ruff:C901`         | `high-complexity`     |
| `ruff:PLR0913`      | `too-many-parameters` |
| `ruff:PLR0915`      | `oversized-function`  |
| `ruff:F841`         | `unused-variable`     |
| `ruff:F401`         | `unused-import`       |
| `ruff:BLE001`       | `swallowed-exception` |
| `jscpd:duplication` | `duplicated-code`     |
| `deptry:DEP002`     | `unused-dependency`   |
| `line-count:max-module-lines` | `oversized-file` |

TS-only smells (`explicit-any`, `var-declaration`, …) simply do not appear in
the Python plugin. `oversized-file` has no clean ruff rule, so the Python plugin
reuses the generic line-count sensor (its `--max` threshold, default 200).
`deep-nesting` ships for TypeScript only (ESLint `max-depth`); the Python
equivalent (ruff `PLR1702`) is preview/unstable, so it is deferred rather than
opting into ruff `--preview`.

## Uncoached smells

A smell with no configured guidance falls through to an **uncoached** bucket
rather than being dropped, so unknown sensor output is always surfaced.
