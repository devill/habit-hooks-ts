# DECISIONS

Design calls for the `simplified` rewrite — a ground-up re-org to cut cruft (the
old single-package, TS-baked design was ~5.6k non-test LOC for behaviour that is
a few small pipes). Calls are _human requested_ (Ivett) unless noted.

- **The pipeline is composed commands** — `habit-sensors | habit-mapper` —
  carrying a JSON array of `{smell, language?, details}` findings. `habit-mapper`
  absorbs the old mapper **and** guide stages (route + render + exit). Snoozing
  and adapting are **sensors**, not separate stages.

- **Everything language/tool-specific lives in `plugins/<language>` and
  `plugins/generic`** — each a dir of `sensors/*.toml` specs and `guides/` files,
  contract-only. Generic owns the language-independent sensors (line-count →
  oversized-file, jscpd → duplicated-code). TS keeps eslint/knip/comment; Python
  keeps ruff/deptry.

- **A sensor is a single `.toml`** carrying `command` + `produces` (+ optional
  `language`/`dependsOn`/`files`). It just has to print the findings array; an
  adapter sensor maps a JSON-emitting tool with a `jq` transform in the command
  ([authoring-plugins.spec.md](authoring-plugins.spec.md)). One descriptor source,
  read statically — no `--describe` subprocess. _(Ivett's call over the agent's
  two-source proposal.)_

- **`.habit-hooks/` in a consumer holds overrides only** (Q1b) — project
  `config.toml` plus any sensor/guide it replaces. Defaults resolve from the
  package, so updating habit-hooks never clobbers tuning. Resolution is
  first-match across `.habit-hooks/<lang>` → `.habit-hooks/generic` →
  `plugins/<lang>` → `plugins/generic`.

- **`oversized-file` defaults to the generic line-count sensor; languages may
  override.** TS uses eslint's `max-lines` instead (disables `line-count` in its
  config, maps `max-lines`); Python keeps the generic sensor. The pattern for any
  generic-vs-language-native smell: generic default, language override.

- **No composite ships by default.** The composite mechanism (`dependsOn` +
  stdin) stays first-class in the contract, but `needs-extraction` was only ever a
  demonstrator — it moves to a demo project. Docs still cite it for the mechanism.

- **Config is TOML** (Q5).

- **The rebuild targets Python** — chosen over a TypeScript build (Python is more
  often present in polyglot dev tooling and avoids shipping binaries) and over a
  Go binary (zero-runtime + Windows, but adds release machinery).

- **Snooze keying: git by default, mtime fallback** — content-accurate without
  hashing every file; pluggable for free since snooze is a filter sensor.
  _(SUPERSEDED by issue-key snooze below — mtime/git keying is dropped.)_

- **Fixes run via configured runners, not direct execution** — only `.md` is
  rendered by default; `[runners]` maps a guide extension to a command, so no
  arbitrary execution ships out of the box.

## Pipeline redesign (2026-06, all Ivett's calls)

The sensor runner is a recursive **ETL pipeline**. These supersede the
earlier `dependsOn` / composite / augment-replace / snooze-keying notes above.
Pinned in [habit-sensors.spec.md](habit-sensors.spec.md).

- **Two roles, one interface (`findings → findings`).** A **sensor** senses (no
  finding input) over scoped files. A **transformer** takes the whole findings
  array on stdin and returns a new one, with one invariant: **it must pass
  through everything it does not handle.** That single rule replaces `dependsOn`,
  augment/replace modes, shadow-on-re-emit, the `output` sink, topological
  ordering, and the `["*"]` wildcard — all deleted.

- **Recursive concat-then-transform.** A node = `transformers ∘ concat(child
  sensors)`, evaluated in listed order; it composes recursively, so the root
  (`habit-sensors`) and each plugin are the same shape. Transformer order is just
  list order; `snooze` is a root transformer because that is where it sees every
  finding.

- **A plugin is a bundle, not a language** — `sensors/` + `transformers/` +
  `guides/` + `config.toml`. `plugins` (renamed from `languages`) lists the
  active ones, `generic` explicit so it can be dropped. A plugin **declares** its
  `language` in config (generic declares none); the runner stamps it. Because
  language is declared, not the plugin name, **multiple plugins can share a
  language** (e.g. `eslint` and `biome`, both `typescript`).

- **The `plugins` list is ordered = lookup priority.** It is the concat order
  here and the guide-resolution order in the mapper: walk plugins in order, stop
  at the first that handles `(smell, language)`, then fall back to `generic`.
  (Reverses the earlier "derive language from the plugin dir name" Phase 0
  resolution — language is now a declared plugin attribute.)

- **Finding contract gains a top-level `issues`.** `{smell, language?, details,
  issues}` where `details` is the smell-level bag and `issues` is a list of
  `{key, details}` — each issue carrying its own `details` bag, symmetric with
  the finding's. (Was `details.issues` of flat bags.)

- **Snooze is issue-key based, not mtime.** `snooze` drops issues whose `key` is
  in the checked-in index (keyed on `key` alone; `key` defaults to the filename,
  so the common case snoozes a whole file). The sensor chooses the key, so
  lapse-on-change becomes a key-design choice (embed content to auto-lapse), not
  a core feature. `--prune` drops keys absent from the latest run.

- **`produces` dropped from sensor specs** — it only fed ordering/activation;
  ordering is gone, so sensors always run.

- **One `config.toml` for both stages** — the runner reads
  `plugins`/`transformers`/`sensors`/`files`/`scope`; the mapper reads
  `smells`/`runners`. They ignore each other's sections; no physical split.

- **Guide fixers are part of the plugin bundle.** The bare core renders only
  `.md` guide templates; nothing executes otherwise. A plugin ships its own
  `[runners]` in its `config.toml` (resolved through the override chain), mapping
  a guide extension to a command, so a plugin can run its **own
  language-specific fixers** out of the box — e.g. the python plugin maps
  `py = "python"` and its `guides/<smell>.py` scripts run. A project can add or
  override a runner the same way. No arbitrary execution ships unless a plugin or
  the project opts in.

- **Scope surface = main's, restored, plus `--file`** — `--all`, `--branch
  [base]`, `--last <n>`, `--since <ref>`, `--file <path>`, `--config <path>`;
  default from `[scope]` (`changedOnly` → uncommitted; else `autoBranchOffMain`
  → vs base unless on `mainBranch`; else all).

- **Specs build fixture plugins in temp** via the `.habit-hooks/<plugin>`
  override chain (no plugins ship in this repo long-term); the harness `📄 @<src>`
  copy gains recursive-directory support for larger fixtures.

## Deferred (migrated from the now-deleted open_questions.md)

- **Plugins as separately-installable packages.** Agreed direction: plugins
  eventually ship independently (`@habit-hooks/typescript`, etc.) for independent
  release + community contribution. For now the in-repo `plugins/<plugin>` model
  stands; the package split is a later, additive step.
- **`init`'s new shape.** The old ~1.3k-line scaffolder is slated for deletion in
  favour of copying override templates into `.habit-hooks/`. Revisit once its
  much smaller shape is decided.

The three earlier design gaps (sensor-command bin resolution, conditional adapter
mapping, config validation) are resolved and recorded above / in
[checklist.md](checklist.md).
