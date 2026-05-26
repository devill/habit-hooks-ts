# Phase 5 — Baseline (snooze by file)

## Depends on
Phase 4 complete.

## Goal
`.habit-hooks-baseline.json` (committed to repo) records per-file snooze hashes. A snoozed file is skipped entirely until it changes. We never persist *which* violations were snoozed — re-checking happens on every file change.

## File format (`.habit-hooks-baseline.json`)
```json
{
  "version": 1,
  "files": {
    "src/legacy/big-file.ts": { "snoozedAt": "abc123def4567..." }
  }
}
```
- Paths are repo-root-relative, forward-slash.
- `snoozedAt` is the file's last-commit hash at the moment of snooze (`git log -n 1 --format=%H -- <path>`).
- Missing entry ⇒ not snoozed.

## Skip rule
A file is skipped from all rules iff:
1. Baseline entry exists, AND
2. Current last-commit hash for the file equals `snoozedAt`, AND
3. Working tree is clean for that file (`git status --porcelain -- <path>` returns no entry — this also rules out untracked files since untracked never have a baseline entry to begin with).

If any condition fails, the file participates normally.

## Commands
- `habit-hooks baseline generate` — runs all checks, then for every file with at least one violation stores its current last-commit hash. Files with no violations are left untouched (no entry added, no entry removed). Files with stale entries (file deleted, or no violations remain) are NOT auto-cleaned by this command — `prune` handles that.
- `habit-hooks baseline status` — lists snoozed files; for each, flags: `current` / `stale-changed` (hash drifted) / `stale-missing` (file gone).
- `habit-hooks baseline snooze <file>...` — explicit per-file snooze, regardless of current violation state.
- `habit-hooks baseline forget <file>...` — remove entries.
- `habit-hooks baseline prune` — remove `stale-missing` entries and entries whose files no longer have violations.

## Tasks
1. `src/baseline/store.ts`:
   - `loadBaseline(cwd): BaselineFile` (returns empty `{version:1, files:{}}` if file missing).
   - `saveBaseline(cwd, baseline)` — writes pretty-printed JSON with trailing newline; sorts keys for stable diffs.
   - `version` mismatch ⇒ exit 2 with clear error (we'll handle migrations when v2 lands).
2. `src/baseline/file-hash.ts`:
   - `lastCommitHash(cwd, path): string | null` (null if file untracked or no commits).
   - `isWorkingTreeCleanFor(cwd, path): boolean`.
3. `src/baseline/filter.ts`:
   - `partitionBySnooze(files, baseline, cwd): { active: string[]; skipped: string[] }`.
4. `src/runner.ts`:
   - After computing each rule's file list (phase 4), apply baseline filter. Skipped files don't run.
   - Skip list is logged only with a verbose flag (out of scope here — leave a TODO).
5. CLI subcommands in `src/cli.ts`:
   - `baseline generate|status|snooze|forget|prune` via commander subcommand group.
6. Concurrency / safety:
   - `generate` does a full run with `--all` semantics (overrides scope flags) so it captures real state.
   - It does NOT run with snooze filter active — generating against an already-snoozed file should still snapshot it if it's currently violating.

## Tests
Use temp git repos.
- `baseline/store.test.ts` — round-trip, missing-file default, version mismatch error.
- `baseline/filter.test.ts` — four-quadrant matrix:
  - snoozed + unchanged + clean ⇒ skipped
  - snoozed + unchanged + dirty ⇒ active
  - snoozed + committed-past ⇒ active
  - not snoozed ⇒ active
- `baseline/commands.test.ts`:
  - `generate` populates entries for currently-violating files.
  - `snooze <f>` adds entry even if file has no current violation.
  - `forget <f>` removes entry.
  - `prune` removes missing/clean entries.
  - `status` output shape.
- `runner.test.ts` — snoozed-clean file with violations does not appear in output; uncommitted edit on that file resurfaces the violations.

## Acceptance criteria
- All baseline subcommands work as specified.
- Skip logic matches the four-quadrant matrix.
- Baseline file is deterministic across runs (stable sort, trailing newline) — verifiable with a test that runs `generate` twice and diffs the file.
- Tests pass; lint/typecheck/build clean.

## Out of scope
- Verbose / `--show-skipped` flag (later).
- Built-in default rule content (phase 6).
- jscpd.

## Notes for the executor
- Untracked files have no last-commit hash; `lastCommitHash` returns null, so the skip check trivially fails — correct behaviour.
- Don't try to be clever about partial-file blame. File-level granularity is the contract.
- `generate` should be idempotent on a clean repo: running it twice in a row with no intermediate changes must leave the baseline byte-identical.
