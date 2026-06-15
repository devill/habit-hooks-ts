# DECISIONS

Reversible design calls made by the autonomous loop while driving GOAL.md.
Each is labelled _agent decision_ per the working agreement.

## Phase 1 — Smell-key decoupling (TS, internal)

- **Routing keys become canonical smell keys.** _(agent decision)_ Each `Rule.id`
  and each `Violation.ruleId` is now a kebab-case smell key (e.g.
  `too-many-parameters`) instead of a tool-prefixed key (`eslint:max-params`).
  Tool-prefixed strings survive **only** as (a) the raw→smell translation tables
  owned by each wrap and (b) provenance written to `Violation.source`.

- **`Violation.source` added for provenance.** _(agent decision)_ Carries the raw
  tool key (`eslint:max-params`, `knip:classMembers`, `jscpd:duplication`,
  `comment:non-essential`). It is shown in the reporter's _Uncoached_ section so
  today's behaviour — surfacing the originating tool/rule for unknown findings —
  is preserved. Maps cleanly onto the future `Issue.details.source` (docs).

- **Unmapped raw keys pass through as their bare key.** _(agent decision)_ An
  eslint rule with no smell mapping (e.g. `no-console`) routes as `no-console`;
  an unknown knip issue type (e.g. `unlistedPeerDependencies`) routes under its
  bare key. No tool prefix leaks into the routing key; the finding still surfaces
  as uncoached with full provenance in `source`.

- **Catalogue content preserved verbatim.** _(agent decision)_ Titles,
  descriptions, and severities are copied unchanged from the old tool-keyed rules
  to guarantee output parity. Aligning titles with `docs/smell-vocabulary.md`
  (e.g. "Non-essential comment") is deferred as a separate content change.

- **`parse-error` stays a supplemental prompt** (no default `Rule`), exactly as
  the old `eslint:fatal` did — it has a tuned template but no catalogue entry.

## Phase 2 — Sensor contract + runner (leaf-only)

- **Phase 2 split into 2a + 2b.** *(agent decision)* 2a introduces the `Sensor` /
  `Issue` / `SensorContext` contract (`src/sensors/types.ts`) and a `SensorRunner`
  (`src/sensors/runner.ts`) that registers sensors, orders them by dependency, and
  merges issues — fully unit-tested in isolation, no pipeline integration yet. 2b
  makes the four wraps registered sensor plugins and wires them into `run()` with
  `Issue` <-> `Violation` conversion, preserving golden parity. The split keeps
  each commit small and reviewable, and de-risks the parity-sensitive integration.

- **`SensorRunner.run` returns `Issue[]`** per docs. *(agent decision)* Dependency
  ordering uses a stable topological sort (registration order preserved among
  ready sensors); unsatisfiable `dependsOn` smells and cycles throw at
  construction (startup error), per docs/sensors.md. Leaf-only is exercised by the
  preset; multi-sensor ordering/`ctx.deps` is implemented and tested with fakes but
  no multi sensor ships (out of scope).

- **2b integration: gated detect over all files, filter per smell afterwards.**
  *(agent decision)* `run()` runs each *active* preset sensor over the full
  discovered file set via `SensorRunner`, then `filterViolations` keeps a
  violation only if its smell's rule allows the file (uncoached smells with no
  rule are never file-filtered). A sensor is **active** iff at least one smell it
  `produces` has a rule resolving to a non-empty file set — reproducing the old
  "a tool runs iff its source has an active in-scope rule" gate, so disabling or
  empty-scoping a sensor's smells suppresses the whole tool (and its uncoached
  sibling smells), not just its coached output. This replaces the old per-source
  dispatch (eslint union + `filterEslintViolations`, group-by-file-set for the
  rest) and lets the sensor stage stay a pure detector — rule-scoped filtering is
  the seam the Phase 3 mapper will own. Verified parity: CLI golden byte-identical,
  full suite green, plus new gating tests. `src/eslint-runner.ts` deleted.

- **Known, accepted divergence: knip's coached findings now respect the baseline.**
  *(agent decision)* The old code never file-filtered knip output (knip runs
  whole-project and its violations bypassed filtering); the new uniform filter
  drops an `unused-class-member` finding for a **baseline-snoozed** file (that
  rule has `changedFilesOnly: false`, so scope can't drop it — only the baseline
  can). Unreachable by any existing test and not promised by the docs; treating a
  snoozed file as snoozed for every sensor is the more consistent behaviour
  (arguably a latent bugfix), so it is accepted.

## Phase 3 — Mapper smells config + fix resolution

- **3a: `smells` is the canonical config field; `rules` kept as a transitional
  alias.** *(agent decision)* The config now reads `smells` (smell-keyed, per
  docs/mapper.md) and still accepts `rules`; both merge with `smells` last so it
  wins on conflict. Default and canonical configs use `smells`. This introduces
  the canonical field without a sweeping rename of every test fixture; removing
  the `rules` alias is a later cleanup. Added the `fix` field to the schema/`Rule`
  and threaded it through merge so the Phase 3b mapper can resolve it.

- **Fixed a latent Phase-1 miss: the repo's own `habit-hooks.config.js`** still
  keyed an override under the old `comment:non-essential`, which now matches no
  rule and would throw (`missing 'source'`) if habit-hooks ran on itself. Migrated
  it to `smells: { 'non-essential-comment': ... }`.

- **3b: the mapper is a standalone, tested module (`src/mapper/mapper.ts`),
  integrated in Phase 4.** *(agent decision)* `mapIssues` groups the bag by smell
  and resolves each group to one `GuideAction` (severity + a `Fix`), with leftover
  smells in an uncoached bucket. `resolveFix` implements the chain — explicit
  `fix` setting, then `<smell>.md` (prompt), then a `<smell>` script (command),
  else uncoached — looking up override dir before packaged, and throwing a config
  error when an explicit `fix` names a missing file. Like the Phase 2a runner, it
  ships tested-but-unwired; Phase 4 builds the Nunjucks guide that consumes
  `GuideAction[]` and retires the reporter. (knip flags the output types as unused
  until then — expected.)

## Phase 4 — Nunjucks guide

- **4a: Nunjucks render + guide module (`src/guide/`), tested then integrated in
  4b.** *(agent decision)* `render.ts` builds a Nunjucks `Environment`
  (autoescape off — output is agent-facing markdown, not HTML; a `FileSystemLoader`
  over the override+packaged dirs lets templates `{% include %}` partials).
  `guide.ts` renders each `GuideAction`'s template against `{ smell, issues }`,
  lists the uncoached bucket, and computes the exit code (an `enforced` smell with
  any issue -> exit 1; uncoached never escalates). Per-smell grouping over
  multiple issues is proven with the `groupby("details.file")` filter (dot-paths
  work). Command fixes render nothing (out of scope). Reviewer's Phase-4 seam — a
  `routingFor` that folds in the supplemental seeds (e.g. `parse-error` at
  `enforced`) — is handled in 4b's runner wiring as `rule ?? lookupPrompt(smell)`.

- **4b: `run()` is now sensor -> mapper -> guide; the reporter is retired.**
  *(agent decision)* `run()` detects via sensors, filters per smell, converts to
  the `Issue` bag, maps to `GuideAction[]` (routing = merged rule ?? `lookupPrompt`
  so `parse-error` keeps `enforced`), and renders with the guide. `src/reporter.ts`
  and its test are deleted. The guide composes each section — `❌ {title}` /
  description / the prompt template / an issue list — so the output stays close to
  the old reporter format (titles, `file:line - message`, banner all preserved),
  keeping the substring-based integration tests green. Two changes are intentional
  new snapshots: section **order** now follows issue arrival (sensor order) rather
  than catalogue order, and the per-rule "(N more …)" cap is gone (templates list
  all issues). `oversized-function` ships a `.issues.njk` that groups by file —
  the real per-smell grouping the DoD asks for. Also fixed a second latent Phase-1
  miss: `packaged-dir.ts` probed the renamed `eslint-max-params.md` (worked only
  via the src fallback); now probes `too-many-parameters.md`. `.njk` partials are
  added to the published `files`.
