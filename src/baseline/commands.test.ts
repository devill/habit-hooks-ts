import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGitRepo, type GitRepo } from '../../tests/helpers/git.js';
import {
  baselineForget,
  baselineGenerate,
  baselinePrune,
  baselineSnooze,
  baselineStatus,
} from './commands.js';
import { BASELINE_FILENAME, loadBaseline, saveBaseline } from './store.js';
import { lastCommitHash } from './file-hash.js';

const DIRTY_FN = `export function tooMany(a: number, b: number, c: number, d: number): number {
  return a + b + c + d;
}
`;
const CLEAN_FN = `export function add(a: number, b: number): number {
  return a + b;
}
`;

function writeConfig(cwd: string): void {
  const cfg = { rules: { 'eslint:max-lines-per-function': { disabled: true } } };
  writeFileSync(join(cwd, 'habit-hooks.config.json'), JSON.stringify(cfg));
}

describe('baseline generate', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('populates entries for currently-violating files', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.writeFile('clean.ts', CLEAN_FN);
    repo.commitAll('initial');

    const result = await baselineGenerate(repo.cwd);

    expect(result.exitCode).toBe(0);
    const loaded = loadBaseline(repo.cwd);
    expect(Object.keys(loaded.files)).toEqual(['bad.ts']);
    expect(loaded.files['bad.ts'].snoozedAt).toBe(lastCommitHash(repo.cwd, 'bad.ts'));
  });

  it('is deterministic: running twice produces a byte-identical file', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    repo.writeFile('a-bad.ts', DIRTY_FN);
    repo.writeFile('z-bad.ts', DIRTY_FN);
    repo.writeFile('m-bad.ts', DIRTY_FN);
    repo.commitAll('initial');

    await baselineGenerate(repo.cwd);
    const first = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');
    await baselineGenerate(repo.cwd);
    const second = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');

    expect(second).toBe(first);
  });

  it('uses --all semantics: captures violations regardless of scope config', async () => {
    repo = createGitRepo({ withEslint: true });
    const cfg = {
      scope: { onlyChangedFiles: true },
      rules: {
        'eslint:max-params': { changedFilesOnly: true },
        'eslint:max-lines-per-function': { disabled: true },
      },
    };
    writeFileSync(join(repo.cwd, 'habit-hooks.config.json'), JSON.stringify(cfg));
    repo.writeFile('old-bad.ts', DIRTY_FN);
    repo.commitAll('initial');

    await baselineGenerate(repo.cwd);

    const loaded = loadBaseline(repo.cwd);
    expect(Object.keys(loaded.files)).toContain('old-bad.ts');
  });

  it('records every violating file even past the reporter per-rule cap', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    const expected: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const name = `bad-${String(i).padStart(2, '0')}.ts`;
      repo.writeFile(name, DIRTY_FN);
      expected.push(name);
    }
    repo.commitAll('initial');

    await baselineGenerate(repo.cwd);

    const loaded = loadBaseline(repo.cwd);
    expect(Object.keys(loaded.files).sort()).toEqual(expected.sort());
  });

  it('preserves entries for files that have no violations (no auto-cleanup)', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.commitAll('initial');
    saveBaseline(repo.cwd, {
      version: 1,
      files: { 'long-gone.ts': { snoozedAt: 'deadbeef' } },
    });

    await baselineGenerate(repo.cwd);

    const loaded = loadBaseline(repo.cwd);
    expect(Object.keys(loaded.files).sort()).toEqual(['bad.ts', 'long-gone.ts']);
  });
});

describe('baseline snooze', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('adds an entry for a tracked file even with no current violation', () => {
    repo = createGitRepo();
    repo.writeFile('clean.ts', CLEAN_FN);
    repo.commitAll('initial');

    const result = baselineSnooze(repo.cwd, ['clean.ts']);

    expect(result.exitCode).toBe(0);
    const loaded = loadBaseline(repo.cwd);
    expect(loaded.files['clean.ts'].snoozedAt).toBe(lastCommitHash(repo.cwd, 'clean.ts'));
  });

  it('rejects missing files', () => {
    repo = createGitRepo();
    const result = baselineSnooze(repo.cwd, ['ghost.ts']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/ghost\.ts/);
  });

  it('rejects untracked files', () => {
    repo = createGitRepo();
    repo.writeFile('untracked.ts', CLEAN_FN);
    const result = baselineSnooze(repo.cwd, ['untracked.ts']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/untracked/);
  });
});

describe('baseline forget', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('removes an entry', () => {
    repo = createGitRepo();
    repo.writeFile('a.ts', CLEAN_FN);
    repo.commitAll('initial');
    saveBaseline(repo.cwd, {
      version: 1,
      files: { 'a.ts': { snoozedAt: 'deadbeef' } },
    });

    const result = baselineForget(repo.cwd, ['a.ts']);

    expect(result.exitCode).toBe(0);
    const loaded = loadBaseline(repo.cwd);
    expect(loaded.files).toEqual({});
  });

  it('removes entries for files that no longer exist', () => {
    repo = createGitRepo();
    repo.writeFile('keep.ts', CLEAN_FN);
    repo.commitAll('initial');
    saveBaseline(repo.cwd, {
      version: 1,
      files: { 'gone.ts': { snoozedAt: 'deadbeef' } },
    });

    const result = baselineForget(repo.cwd, ['gone.ts']);

    expect(result.exitCode).toBe(0);
    const loaded = loadBaseline(repo.cwd);
    expect(loaded.files).toEqual({});
  });

  it('is a no-op (exit 0) for entries that are not present', () => {
    repo = createGitRepo();
    saveBaseline(repo.cwd, { version: 1, files: {} });
    const result = baselineForget(repo.cwd, ['anything.ts']);
    expect(result.exitCode).toBe(0);
  });
});

describe('baseline prune', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('removes entries for files that no longer exist and entries with no violations', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.writeFile('clean.ts', CLEAN_FN);
    repo.commitAll('initial');
    const badHash = lastCommitHash(repo.cwd, 'bad.ts');
    const cleanHash = lastCommitHash(repo.cwd, 'clean.ts');
    saveBaseline(repo.cwd, {
      version: 1,
      files: {
        'bad.ts': { snoozedAt: badHash ?? '' },
        'clean.ts': { snoozedAt: cleanHash ?? '' },
        'gone.ts': { snoozedAt: 'deadbeef' },
      },
    });

    const result = await baselinePrune(repo.cwd);

    expect(result.exitCode).toBe(0);
    const loaded = loadBaseline(repo.cwd);
    expect(Object.keys(loaded.files)).toEqual(['bad.ts']);
  });
});

describe('baseline status', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('reports a friendly message when no baseline exists', () => {
    repo = createGitRepo();
    const result = baselineStatus(repo.cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no baseline/i);
  });

  it('flags each entry as current / stale-changed / stale-missing', () => {
    repo = createGitRepo();
    repo.writeFile('current.ts', CLEAN_FN);
    repo.writeFile('changed.ts', CLEAN_FN);
    repo.commitAll('initial');
    const currentHash = lastCommitHash(repo.cwd, 'current.ts');
    saveBaseline(repo.cwd, {
      version: 1,
      files: {
        'current.ts': { snoozedAt: currentHash ?? '' },
        'changed.ts': { snoozedAt: 'olddeadbeef' },
        'gone.ts': { snoozedAt: 'deadbeef' },
      },
    });

    const result = baselineStatus(repo.cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('current.ts');
    expect(result.stdout).toContain('current');
    expect(result.stdout).toContain('changed.ts');
    expect(result.stdout).toContain('stale-changed');
    expect(result.stdout).toContain('gone.ts');
    expect(result.stdout).toContain('stale-missing');
  });
});

describe('baseline file lifecycle', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('generate then snooze then forget removes all entries', async () => {
    repo = createGitRepo({ withEslint: true });
    writeConfig(repo.cwd);
    repo.writeFile('bad.ts', DIRTY_FN);
    repo.writeFile('clean.ts', CLEAN_FN);
    repo.commitAll('initial');

    await baselineGenerate(repo.cwd);
    baselineSnooze(repo.cwd, ['clean.ts']);
    expect(Object.keys(loadBaseline(repo.cwd).files).sort()).toEqual(['bad.ts', 'clean.ts']);

    baselineForget(repo.cwd, ['bad.ts', 'clean.ts']);
    expect(loadBaseline(repo.cwd).files).toEqual({});
    expect(existsSync(join(repo.cwd, BASELINE_FILENAME))).toBe(true);
  });
});
