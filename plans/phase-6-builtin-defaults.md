# Phase 6 — Built-in default rules and prompts

## Depends on
Phase 5 complete.

## Goal
Replace stub prompts with high-quality, purpose-conveying guidance for the v1 default rule set. Lock the default rule selection. Verify behaviour on a sample project.

Defaults are aligned with the refakts quality system at `../refakts` — which has been used in anger and shaped by real friction. Prompt text for the tier-1 rules is adapted from `src/dev/quality/checks/linter-groups.ts` in that repo.

## V1 default rule set (locked)

### Tier 1 — architectural smells (rich prompts)
| id                                        | ESLint rule                                   | severity   | changedFilesOnly | options |
|-------------------------------------------|-----------------------------------------------|------------|------------------|---------|
| `eslint:max-lines`                        | `max-lines`                                   | enforced   | true             | `[{ max: 200, skipBlankLines: false, skipComments: false }]` |
| `eslint:max-lines-per-function`           | `max-lines-per-function`                      | enforced   | true             | `[{ max: 12, skipBlankLines: false, skipComments: false, IIFEs: true }]` |
| `eslint:complexity`                       | `complexity`                                  | enforced   | true             | `[{ max: 10 }]` |
| `eslint:max-params`                       | `max-params`                                  | enforced   | false            | `[{ max: 3 }]` |

### Tier 2 — code hygiene (short prompts)
| id                                        | ESLint rule                                   | severity   | changedFilesOnly | options |
|-------------------------------------------|-----------------------------------------------|------------|------------------|---------|
| `eslint:no-unused-vars`                   | `no-unused-vars` or TS variant (probe)        | enforced   | false            | `[{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]` |
| `eslint:eqeqeq`                           | `eqeqeq`                                      | enforced   | false            | `['always']` |
| `eslint:no-var`                           | `no-var`                                      | enforced   | false            | default |
| `eslint:prefer-const`                     | `prefer-const`                                | enforced   | false            | default |
| `eslint:no-duplicate-imports`             | `no-duplicate-imports`                        | enforced   | false            | default |
| `eslint:no-warning-comments`              | `no-warning-comments`                         | suggested  | false            | `[{ terms: ['todo','fixme','xxx','hack'], location: 'anywhere' }]` |

### Tier 3 — TS-specific advisories (suggestions only)
Loaded only if `@typescript-eslint/eslint-plugin` is resolvable from cwd.

| id                                                  | ESLint rule                                   | severity   | changedFilesOnly |
|-----------------------------------------------------|-----------------------------------------------|------------|------------------|
| `eslint:@typescript-eslint/no-explicit-any`         | `@typescript-eslint/no-explicit-any`          | suggested  | true             |
| `eslint:@typescript-eslint/no-non-null-assertion`   | `@typescript-eslint/no-non-null-assertion`    | suggested  | true             |
| `eslint:@typescript-eslint/no-inferrable-types`     | `@typescript-eslint/no-inferrable-types`      | enforced   | false            |

### Custom AST checks (non-ESLint)
| id                                        | source     | severity   | changedFilesOnly | implementation |
|-------------------------------------------|------------|------------|------------------|----------------|
| `comment:non-essential`                   | `custom`   | suggested  | true             | ts-morph; flag every comment except: `eslint-disable*`, executable annotations (configurable list, default empty), shebangs. Min length 10 chars for `//`, 15 for block/JSDoc. |

**TS probe for `no-unused-vars`**: at config-build time, `require.resolve('@typescript-eslint/eslint-plugin', { paths: [cwd] })`; if it resolves, register `@typescript-eslint/no-unused-vars` instead of the core rule and load the plugin. If it doesn't, use the core rule. Fail open — no error if the probe fails.

## Prompt quality bar (unchanged from earlier draft)
Each prompt must:
- Open by stating the **purpose** of the rule (the smell it catches, why it matters).
- Guide **analysis before action** ("First identify…").
- Warn against **mechanical fixes** that satisfy the threshold without addressing the smell.
- Offer **non-obvious approaches** for the hard cases.
- ≤ ~150 words.

Tier 2 rules can use shorter prompts (~30–60 words). Tier 3 even shorter.

## Tasks
1. Update `src/config/defaults.ts` to declare all rules above.
2. Write `src/prompts/<slug>.md` for each. Slug = id with `:`/`/` → `-`.
   - Tier 1: **port verbatim (or near-verbatim) from `../refakts/src/dev/quality/checks/linter-groups.ts`** — see "Source prompts to adapt" below. Adjust wording where refakts says "refakts" or refers to its own conventions.
   - Tier 2 and 3: write fresh, short.
   - `comment:non-essential`: adapt refakts' COMMENTS DETECTED prompt.
3. Implement TS probe in `src/checks/eslint-check.ts` (described above).
4. `src/checks/comment-check.ts` — custom AST implementation using ts-morph (add dep `ts-morph`).
5. Sample fixture project at `tests/fixtures/sample-project/` — one file per tier-1 rule + a representative tier-2/3 file + a file with comments.
6. Acceptance test (`tests/acceptance/defaults.test.ts`) — run CLI against fixture, assert every default rule fires the expected count.
7. `src/prompts/REVIEW.md` (not shipped, listed in `.npmignore` or `files` exclusion): review checklist with the four criteria above plus word-count target per tier.

## Source prompts to adapt (refakts)
Read `/Users/ivett/Documents/git/refakts/src/dev/quality/checks/linter-groups.ts` for the canonical text. Map:
- `functionSize` → `eslint:max-lines-per-function`
- `fileSize` → `eslint:max-lines`
- `cyclomaticComplexity` → `eslint:complexity`
- `manyParameters` → `eslint:max-params`
- `comment` → `comment:non-essential`

Drop the all-caps `CRITICAL:` prefix from titles — our reporter already prefixes the rule output visually. Keep the body prose.

## Tests
- `config/defaults.test.ts` — defaults parse and produce expected `Rule[]` after merge with empty config.
- `acceptance/defaults.test.ts` — fixture run prints every default rule group, exit 1 (driven by tier-1 + tier-2 enforced rules).
- `prompts/coverage.test.ts` — every default rule id has a corresponding markdown file under `src/prompts/`; no orphan markdown files.
- `checks/eslint-check.test.ts` — TS probe path: with `@typescript-eslint` resolvable, uses the TS variant; without, falls back to core (use a mock or temp dir to control resolution).
- `checks/comment-check.test.ts` — fixture covering single-line, block, JSDoc, eslint-disable (ignored), short comments (ignored).

## Acceptance criteria
- All prompts written; tier-1 ones pass a side-by-side comparison against the refakts originals (intent preserved).
- Fixture project exercises every rule including the custom comment check.
- Tests pass; lint/typecheck/build clean.
- Manual: each prompt reads as something you'd want an agent to internalise as a habit — not a restatement of the threshold.

## Out of scope (deferred to v2 or later)
- **Feature envy detection** (refakts has it via ts-morph). Substantial custom code, prompt is more opinionated than the tier-1 set. Revisit after v1 lands.
- **Git diff size check** (refakts' `diffSize`). Not really a code-quality smell — it's a workflow nudge. Out of scope for habit-hooks defaults.
- **Per-glob thresholds** (refakts has different duplication thresholds for `src` vs `tests`). Worth supporting eventually; not v1.
- jscpd duplication + knip unused-members: phase 7.

## Notes for the executor
- The refakts prompts are good. Resist the urge to rewrite them in your own voice — they've been iterated against real agent runs. Adapt for our naming and our marker-less reporter format; preserve the analytical structure.
- The custom comment check is small but tricky. Test the eslint-disable exclusion thoroughly — false positives there will annoy users immediately.
- For the TS probe, don't import `@typescript-eslint/eslint-plugin` statically anywhere — that pulls it into our dep tree. Use `require.resolve` + dynamic `import()`.
