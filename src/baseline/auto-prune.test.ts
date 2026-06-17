import { afterEach, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runWithAutoPrune } from './auto-prune.js';
import { loadBaseline, saveBaseline } from './store.js';
import { lastCommitHash } from './file-hash.js';
import { createGitRepo, type GitRepo } from '../../tests/helpers/git.js';

const DIRTY_FN = `export function tooMany(a: number, b: number, c: number, d: number): number {
  return a + b + c + d;
}
`;
const CLEAN_FN = `export function add(a: number, b: number): number {
  return a + b;
}
`;

function snooze(repo: GitRepo, file: string): void {
  saveBaseline(repo.cwd, {
    version: 2,
    files: { [file]: { snoozedAtCommit: lastCommitHash(repo.cwd, file) ?? '' } },
  });
}

const LENIENT_CONFIG = `export default { scope: { exclude: ['bad.ts'] } };\n`;

describe('runWithAutoPrune', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('prunes a now-clean baselined file on a full-repo run and reports it', async () => {
    repo = createGitRepo({ withEslint: true });
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.commitAll('add bad');
    snooze(repo, 'bad.ts');
    repo.writeFile('bad.ts', CLEAN_FN);
    repo.commitAll('fix bad');

    const result = await runWithAutoPrune(repo.cwd, { scopeFlags: { all: true } });

    expect(loadBaseline(repo.cwd).files['bad.ts']).toBeUndefined();
    expect(result.stdout).toContain('Auto-pruned');
    expect(result.stdout).toContain('bad.ts');
  });

  it('keeps a still-violating baselined file on a full-repo run', async () => {
    repo = createGitRepo({ withEslint: true });
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.commitAll('add bad');
    snooze(repo, 'bad.ts');

    await runWithAutoPrune(repo.cwd, { scopeFlags: { all: true } });

    expect(loadBaseline(repo.cwd).files['bad.ts']).toBeDefined();
  });

  it('never mutates the baseline on a scoped run, even when the snoozed file is now clean', async () => {
    repo = createGitRepo({ withEslint: true });
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.commitAll('add bad');
    snooze(repo, 'bad.ts');
    repo.writeFile('bad.ts', CLEAN_FN);
    repo.commitAll('fix bad');

    await runWithAutoPrune(repo.cwd, { scopeFlags: { last: 1 } });

    expect(loadBaseline(repo.cwd).files['bad.ts']).toBeDefined();
  });

  it('forwards configPath to the re-scan so the same rules govern both the main run and auto-prune', async () => {
    // Scenario: a custom config excludes bad.ts from scope. Under that config,
    // bad.ts is never scanned → never appears as violating. Without the fix,
    // the re-scan uses default config discovery (no exclusion) and still finds
    // bad.ts violating, so the baseline entry is kept even though the main run
    // would never surface it. With the fix, the re-scan uses the same custom
    // config, sees bad.ts as out-of-scope, and correctly prunes the stale entry.
    repo = createGitRepo({ withEslint: true });
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.commitAll('add bad');
    snooze(repo, 'bad.ts');

    // Custom config excludes bad.ts — the user is no longer tracking it.
    const configPath = join(repo.cwd, 'lenient.config.js');
    writeFileSync(configPath, LENIENT_CONFIG);

    await runWithAutoPrune(repo.cwd, { configPath, scopeFlags: { all: true } });

    // The baseline entry for bad.ts is stale under the custom config (the file
    // is excluded from scope). The fix ensures auto-prune uses the same config
    // as the main run, so it correctly prunes the entry.
    expect(loadBaseline(repo.cwd).files['bad.ts']).toBeUndefined();
  });
});
