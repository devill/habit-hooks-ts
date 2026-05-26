# Phase 2 — Rules + ESLint check + Reporter

## Depends on
Phase 1 complete.

## Goal
A hard-coded rule set runs ESLint against the project's source files and produces grouped, agent-friendly output. Exit 1 if any *enforced* rule fired; exit 0 otherwise. No config file yet — rules live in code.

## Types (`src/types.ts`)
```ts
export type Severity = 'enforced' | 'suggested';
export type RuleSource = 'eslint' | 'jscpd' | 'custom';

export interface Rule {
  id: string;                       // e.g. 'eslint:max-params'
  source: RuleSource;
  sourceRuleId?: string;            // e.g. 'max-params'
  severity: Severity;
  changedFilesOnly: boolean;        // honoured in phase 4
  title: string;
  description: string;
  eslintOptions?: unknown;          // passed to ESLint rule config
}

export interface Violation {
  ruleId: string;                   // matches Rule.id
  file: string;                     // absolute path
  line: number;
  column?: number;
  message: string;
}

export interface Check {
  id: string;
  run(files: string[], rules: Rule[]): Promise<Violation[]>;
}
```

## Tasks
1. `src/types.ts` — as above.
2. `src/rules/registry.ts` — exports `getRules(): Rule[]` returning a small hard-coded set:
   - `eslint:max-params` (enforced, `eslintOptions: [3]`)
   - `eslint:max-lines-per-function` (enforced, `[{ max: 15, skipBlankLines: true, skipComments: true }]`)
   - `eslint:complexity` (suggested, `[10]`)
   Real prompt content lands in phase 6; for this phase put one-line stub markdown in `src/prompts/eslint-max-params.md` etc.
3. `src/prompts/loader.ts` — `loadGuidance(ruleId: string, overrideDir?: string): string`. For now `overrideDir` is always undefined; reads `src/prompts/<slugified-id>.md` where slug replaces `:` with `-`. Throws if missing.
4. `src/checks/eslint-check.ts`:
   - Use `ESLint` programmatic API (`new ESLint({ overrideConfig: ..., overrideConfigFile: true })`).
   - Build overrideConfig from `rules` array: each rule with `source === 'eslint'` contributes `{ [rule.sourceRuleId]: ['error', ...rule.eslintOptions] }`.
   - Run `lintFiles(files)`, flatten messages into `Violation[]`. Tag each violation with our rule id (look up by `sourceRuleId`).
   - Drop messages whose rule id isn't in our registry (defensive).
5. `src/reporter.ts`:
   - `report(violations: Violation[], rules: Rule[]): { stdout: string; exitCode: 0 | 1 }`.
   - Group by `ruleId`. For each group, in registry order:
     ```
     ❌ <TITLE>
     <description>
     <guidance>

     Violations:
     - <absolute-path>:<line> - <message>
     - ...
     (N more <ruleId> violations)
     ```
   - Limit 10 per group; "N more" only when truncated.
   - Header line: `❌ Habit Hooks: <total> violations` if any, else `✅ Habit Hooks: clean`.
   - Exit code 1 iff any violation belongs to an enforced rule; else 0.
6. `src/runner.ts`:
   - `run(cwd: string): Promise<{ stdout: string; exitCode: number }>`.
   - For now: rules = `getRules()`, files = all `**/*.{ts,tsx,js,mjs,cjs}` under `cwd` excluding `node_modules`, `dist`, `coverage`. Use `fast-glob` (add dep) or `fs.readdirSync` recursion — pick whatever the executor prefers; both fine.
   - Pass to `eslint-check`, then `reporter`.
7. `src/cli.ts` — default action calls `runner.run(process.cwd())`, writes stdout, sets exit code.

## Tests (`src/**/*.test.ts`, vitest)
- `prompts/loader.test.ts` — loads stub markdown; throws on unknown id.
- `reporter.test.ts`:
  - Empty violations → exit 0, clean header, no groups.
  - Enforced rule violation → exit 1, group rendered, guidance included.
  - Suggested-only violation → exit 0, group rendered.
  - Truncation: 12 violations → 10 shown + "(2 more …)".
- `checks/eslint-check.test.ts` — fixture file in `tests/fixtures/` with a 5-param function; expect a `eslint:max-params` violation.
- `runner.test.ts` — end-to-end on a fixture project dir; assert stdout shape and exit code.

## Acceptance criteria
- All tests pass; `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Manual: running `node dist/cli.js` against a fixture project with a known violation prints the expected grouped output and exits 1.
- Manual: running against a clean project prints the clean header and exits 0.

## Out of scope
- Config loading.
- Custom prompt directories.
- Git scope / `changedFilesOnly` enforcement (the field exists on `Rule` but isn't read yet).
- Baseline.
- jscpd.

## Notes for the executor
- The `❌` and `✅` in headers are decoration, not the agent cue. The cue is "habit-hooks output exists." Keep wording deterministic — agents will pattern-match on it.
- Do NOT prefix guidance with an emoji marker; we agreed to drop the marker.
- Use absolute paths in violation output.
