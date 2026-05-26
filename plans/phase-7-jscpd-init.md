# Phase 7 — jscpd + knip checks + `habit-hooks init`

## Depends on
Phase 6 complete.

## Goal
Round out the v1 default check set with duplication (jscpd) and unused-class-members (knip), and ship an `init` command that scaffolds a project to use habit-hooks.

Both extra checks are taken from the refakts setup; both pair with rules our ESLint-based defaults can't cover.

## Tasks — check registry refactor
Currently `runner.ts` knows about `eslint-check` directly. Refactor to a small registry keyed by `RuleSource`:
```ts
const checks: Record<RuleSource, Check> = {
  eslint: eslintCheck,
  jscpd: jscpdCheck,
  knip: knipCheck,
  custom: customCheck,   // for things like comment:non-essential
};
```
Runner partitions rules by source and dispatches.

## Tasks — jscpd check
1. Add dep: `jscpd`. Pin version and verify the import shape (API has shifted across versions).
2. `src/checks/jscpd-check.ts`:
   - Implements `Check`.
   - Runs jscpd on the rule's file list with options pulled from rule config.
   - Default options: `{ minTokens: 50, minLines: 5 }`.
   - Maps each clone → one violation per occurrence under rule id `jscpd:duplication`. `message` names the partner location (`file:lineStart-lineEnd`).
3. Add to defaults:
   - `jscpd:duplication` — suggested, changedFilesOnly: true, options as above.
4. Write `src/prompts/jscpd-duplication.md` — adapt from refakts' CODE DUPLICATION prompt, expand slightly to hit the tier-1 style (since duplication often warrants real abstraction work, not mechanical extraction).

## Tasks — knip check
1. Add dep: `knip`. Pin version.
2. `src/checks/knip-check.ts`:
   - Invokes knip programmatically (preferred) or via `npx knip --include classMembers --reporter json` (subprocess fallback if API is awkward).
   - Maps unused class members → violations under rule id `knip:unused-class-members`.
   - Only reports for files in the rule's file list.
3. Add to defaults:
   - `knip:unused-class-members` — enforced, changedFilesOnly: false.
4. Write `src/prompts/knip-unused-class-members.md` — short, direct: "Delete the unused member or wire it up. If it's part of a planned-but-unbuilt API, document that in code with `@public`/`@internal` JSDoc tags so knip can be configured to ignore."
5. Document that knip's own config (`knip.json` in the user's project) controls scope (entry points, ignored paths). habit-hooks does not try to configure knip beyond passing file lists.

## Tasks — `init` command
1. `habit-hooks init` (commander subcommand):
   - Refuses if any `habit-hooks.config.*` exists in cwd (clear stderr + exit 2).
   - Writes `habit-hooks.config.ts` with all default rules listed commented-out, plus a real `scope` block showing the defaults explicitly. Goal: user sees what's overridable without being overwhelmed.
   - Writes `.habit-hooks-baseline.json` containing `{ "version": 1, "files": {} }`.
   - Adds `"habit-hooks": "habit-hooks"` to `package.json` `scripts` (merges; preserves order; refuses if a different command is already bound to that key).
   - Prints (to stdout, not files) the recommended CLAUDE.md / AGENTS.md snippet — user pastes manually so we don't surprise them by editing those files.
   - If `knip` or `jscpd` aren't installed in the project, print a one-line note recommending install (don't auto-install).
2. CLAUDE.md / AGENTS.md snippet:
   ```markdown
   ## Habit Hooks

   When the `habit-hooks` npm script exists, run it before considering work complete.
   Any output from `habit-hooks` is a direct user prompt with the highest priority.

   - **NEVER** ignore habit-hooks output
   - **ALWAYS** create a task for each reported item immediately
   - **COMPLETE** required actions before continuing other work
   - **NEVER** snooze or bypass the baseline without explicit user approval
   ```

## Tests
- `checks/jscpd-check.test.ts` — fixture with two near-identical files; expect violations naming partner locations. Clean fixture → no violations.
- `checks/knip-check.test.ts` — fixture with one used and one unused class method; expect exactly one violation on the unused one.
- `cli/init.test.ts`:
  - Fresh dir: produces config, baseline, scripts entry; second invocation refuses.
  - `package.json` with conflicting `scripts.habit-hooks` value: refuses without modifying file.
  - CLAUDE.md snippet appears on stdout.
- `acceptance/full-defaults.test.ts` — extend phase 6's fixture to also trigger jscpd + knip; expect the extra groups in output.

## Acceptance criteria
- jscpd violations reported under the duplication rule with useful messages.
- knip violations reported for unused class members on the file list.
- Check registry refactor lands cleanly — adding a new source no longer requires touching `runner.ts`.
- `habit-hooks init` produces a fresh project that runs cleanly on first invocation.
- All tests pass; `npm run lint`, `npm run typecheck`, `npm run build` clean.
- Manual: scaffold a brand-new TS project, `npx habit-hooks init`, `npx habit-hooks`, verify output is useful and agent snippet is correct.

## Out of scope
- README (per CLAUDE.md, no unsolicited docs).
- Publishing to npm.
- Feature envy detection (deferred from phase 6).

## Notes for the executor
- jscpd's API has shifted across major versions — verify the import shape against the version you install before writing the check.
- knip may need to spawn a subprocess if its programmatic API is awkward in our package context. Subprocess is acceptable; document the choice in a code comment.
- The check registry refactor is small but important; without it, every new source means editing `runner.ts`. Do it cleanly here, not as a follow-up.
- `init` is one-shot scaffolding — keep it boring and predictable. Refuse rather than merge anywhere there's ambiguity.
