import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveScope } from './resolve-scope.js';
import { createGitRepo, type GitRepo } from '../../tests/helpers/git.js';

describe('resolveScope', () => {
  let repo: GitRepo;

  beforeEach(() => {
    repo = createGitRepo();
    repo.writeFile('a.ts', 'export const a = 1;\n');
    repo.commitAll('first');
    repo.writeFile('b.ts', 'export const b = 1;\n');
    repo.commitAll('second');
  });

  afterEach(() => {
    rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('returns all mode when no flags and no scope config', () => {
    const result = resolveScope({}, undefined, repo.cwd);
    expect(result.mode).toBe('all');
    expect(result.changedFiles).toBeNull();
  });

  it('CLI --all wins over config.onlyChangedFiles', () => {
    const result = resolveScope({ all: true }, { onlyChangedFiles: true }, repo.cwd);
    expect(result.mode).toBe('all');
    expect(result.changedFiles).toBeNull();
  });

  it('--last takes precedence over config and includes uncommitted', () => {
    repo.writeFile('c.ts', 'export const c = 1;\n');
    const result = resolveScope({ last: 1 }, { onlyChangedFiles: true }, repo.cwd);
    expect(result.mode).toBe('last');
    expect(result.changedFiles).toEqual(
      new Set([join(repo.cwd, 'b.ts'), join(repo.cwd, 'c.ts')]),
    );
  });

  it('--since unions diff with uncommitted', () => {
    const firstHash = repo.run(['rev-parse', 'HEAD~1']).trim();
    repo.writeFile('dirty.ts', 'export const d = 1;\n');
    const result = resolveScope({ since: firstHash }, undefined, repo.cwd);
    expect(result.mode).toBe('since');
    expect(result.changedFiles).toEqual(
      new Set([join(repo.cwd, 'b.ts'), join(repo.cwd, 'dirty.ts')]),
    );
  });

  it('--branch with explicit base diffs against that branch', () => {
    repo.run(['checkout', '-b', 'feature']);
    repo.writeFile('f.ts', 'export const f = 1;\n');
    repo.commitAll('feature work');
    const result = resolveScope({ branch: 'main' }, undefined, repo.cwd);
    expect(result.mode).toBe('branch');
    expect(result.changedFiles).toEqual(new Set([join(repo.cwd, 'f.ts')]));
  });

  it('--branch with empty value falls back to config.branchBase', () => {
    repo.run(['checkout', '-b', 'feature']);
    repo.writeFile('f.ts', 'export const f = 1;\n');
    repo.commitAll('feature work');
    const result = resolveScope({ branch: '' }, { branchBase: 'main' }, repo.cwd);
    expect(result.mode).toBe('branch');
    expect(result.changedFiles).toEqual(new Set([join(repo.cwd, 'f.ts')]));
  });

  it('config.onlyChangedFiles resolves to uncommitted', () => {
    repo.writeFile('dirty.ts', 'export const d = 1;\n');
    const result = resolveScope({}, { onlyChangedFiles: true }, repo.cwd);
    expect(result.mode).toBe('uncommitted');
    expect(result.changedFiles).toEqual(new Set([join(repo.cwd, 'dirty.ts')]));
  });

  it('config.autoBranchOffMain triggers only off main', () => {
    const onMain = resolveScope({}, { autoBranchOffMain: true, branchBase: 'main' }, repo.cwd);
    expect(onMain.mode).toBe('all');

    repo.run(['checkout', '-b', 'feature']);
    repo.writeFile('f.ts', 'export const f = 1;\n');
    repo.commitAll('feature');
    const onFeature = resolveScope(
      {},
      { autoBranchOffMain: true, branchBase: 'main' },
      repo.cwd,
    );
    expect(onFeature.mode).toBe('branch');
    expect(onFeature.changedFiles).toEqual(new Set([join(repo.cwd, 'f.ts')]));
  });

  it('respects custom mainBranch when checking autoBranchOffMain', () => {
    repo.run(['checkout', '-b', 'trunk']);
    const result = resolveScope(
      {},
      { autoBranchOffMain: true, mainBranch: 'trunk' },
      repo.cwd,
    );
    expect(result.mode).toBe('all');
  });

  it('throws when --last is used outside a git repo', () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'hh-nogit-'));
    try {
      expect(() => resolveScope({ last: 1 }, undefined, nonGit)).toThrow(
        '--last requires a git repository',
      );
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('autoBranchOffMain silently falls back to all outside a git repo', () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'hh-nogit-'));
    try {
      const result = resolveScope({}, { autoBranchOffMain: true }, nonGit);
      expect(result.mode).toBe('all');
      expect(result.changedFiles).toBeNull();
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('onlyChangedFiles silently falls back to all outside a git repo', () => {
    const nonGit = mkdtempSync(join(tmpdir(), 'hh-nogit-'));
    try {
      const result = resolveScope({}, { onlyChangedFiles: true }, nonGit);
      expect(result.mode).toBe('all');
    } finally {
      rmSync(nonGit, { recursive: true, force: true });
    }
  });
});
