# Phase 4 — Git scope

## Depends on
Phase 3 complete.

## Goal
CLI flags select which files count as "changed"; per-rule `changedFilesOnly` filters the file list for heavy rules; config options provide ergonomic defaults.

## Scope modes
Exactly one of:
- `uncommitted` — `git status --porcelain` (modified, staged, untracked-non-ignored). The implicit default for "changed files."
- `last:<n>` — files in `git diff --name-only HEAD~<n> HEAD`, unioned with `uncommitted`.
- `branch:<base>` — files in `git diff --name-only $(git merge-base HEAD <base>) HEAD`, unioned with `uncommitted`.
- `since:<hash>` — files in `git diff --name-only <hash>...HEAD`, unioned with `uncommitted`.
- `all` — no filter; rule's file list is the full project file set.

## Effective scope resolution (in order)
1. If a CLI scope flag is present → use it.
2. Else if `config.scope.onlyChangedFiles` → `uncommitted`.
3. Else if `config.scope.autoBranchOffMain` and current branch ≠ `config.scope.mainBranch` (default `main`) → `branch:<config.scope.branchBase>` (default `origin/main`).
4. Else → `all`.

## Per-rule filtering
- `changedFilesOnly: true` rule → its file list = project files ∩ scope-changed-set.
- `changedFilesOnly: false` rule → its file list = project files (full set).
- When effective scope is `all`, both kinds receive the full project file set.

## Tasks
1. `src/git/exec.ts` — thin wrapper around `execFileSync('git', ...)` returning stdout strings; surfaces clean errors when not in a repo.
2. `src/git/scope.ts`:
   - `getUncommittedFiles(cwd): string[]` — parse `git status --porcelain`; include `??` lines (untracked-non-ignored, since git already excludes gitignored).
   - `getChangedVsCommit(cwd, hash): string[]` — `git diff --name-only <hash> HEAD` (resolves to the right form for `since`/`last`/`branch`).
   - `getLastNCommitsChanges(cwd, n): string[]` — uses `HEAD~<n>` as the base.
   - `getMergeBase(cwd, base): string` then diff.
   - `getCurrentBranch(cwd): string`.
   - All paths returned as absolute.
3. `src/git/resolve-scope.ts`:
   - `resolveScope(flags, config, cwd): { mode: ScopeMode; changedFiles: Set<string> | null }`.
   - `null` for `mode: 'all'`.
4. CLI flags in `src/cli.ts` (commander):
   - `--last <n>`, `--branch [name]`, `--since <hash>`, `--all`.
   - Mutually exclusive; error to stderr + exit 2 if more than one set.
   - `--branch` with no value → use `config.scope.branchBase`.
5. `src/runner.ts`:
   - After loading config + building rules: resolve scope.
   - Discover project files once (existing logic from phase 2).
   - For each rule, compute the effective file list per the rules above.
   - Skip the check entirely when its file list is empty (no spurious "clean" output per rule).
6. Error UX:
   - Scope flag used outside a git repo → clear stderr message naming the failing git command, exit 2.
   - `autoBranchOffMain` enabled outside a git repo → silently fall back to `all` (config-driven, shouldn't error).

## Tests
Use temporary git repos created via helper (`tests/helpers/git.ts`).
- `git/scope.test.ts` — each scope getter against a repo with known commits.
- `git/resolve-scope.test.ts` — precedence rules: CLI > onlyChangedFiles > autoBranchOffMain > all.
- `runner.test.ts` — heavy rule + `--last 1` only checks files touched in last commit; light rule still checks full project.
- CLI parsing: mutually exclusive flags error; `--branch` no-arg picks up config base.

## Acceptance criteria
- All four flags work and resolve to expected file sets in fixture repos.
- `onlyChangedFiles: true` in config behaves identically to passing nothing on the CLI with `uncommitted` mode.
- `autoBranchOffMain` triggers only when current branch ≠ main and no CLI flag is set.
- A rule's effective file list is correctly intersected with the scope set.
- Outside a git repo, `--last/--branch/--since` produce a clear error; defaults still work.
- Tests pass; lint/typecheck/build clean.

## Out of scope
- Baseline (phase 5).
- jscpd.

## Notes for the executor
- Untracked-non-ignored detection: `git status --porcelain` already excludes gitignored files. No extra filtering needed.
- Don't shell out to `git` more than necessary inside a single run — cache `getCurrentBranch` and any merge-base result.
