import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  getChangedVsBranch,
  getChangedVsCommit,
  getCurrentBranch,
  getLastNCommitsChanges,
  getUncommittedFiles,
} from './scope.js';
import { createGitRepo, type GitRepo } from '../../tests/helpers/git.js';

describe('git/scope', () => {
  let repo: GitRepo;

  beforeEach(() => {
    repo = createGitRepo();
  });

  afterEach(() => {
    rmSync(repo.cwd, { recursive: true, force: true });
  });

  describe('getUncommittedFiles', () => {
    it('returns absolute paths for modified, staged, and untracked-non-ignored files', () => {
      repo.writeFile('a.ts', 'export const a = 1;\n');
      repo.commitAll('initial');
      repo.writeFile('a.ts', 'export const a = 2;\n');
      repo.writeFile('new.ts', 'export const n = 1;\n');
      repo.writeFile('.gitignore', 'ignored.ts\n');
      repo.writeFile('ignored.ts', 'export const i = 1;\n');

      const files = getUncommittedFiles(repo.cwd);

      expect(files).toContain(join(repo.cwd, 'a.ts'));
      expect(files).toContain(join(repo.cwd, 'new.ts'));
      expect(files).toContain(join(repo.cwd, '.gitignore'));
      expect(files).not.toContain(join(repo.cwd, 'ignored.ts'));
    });

    it('returns empty for a clean working tree', () => {
      repo.writeFile('a.ts', 'export const a = 1;\n');
      repo.commitAll('initial');
      expect(getUncommittedFiles(repo.cwd)).toEqual([]);
    });
  });

  describe('getChangedVsCommit and getLastNCommitsChanges', () => {
    it('returns files changed against a specific commit', () => {
      repo.writeFile('a.ts', 'export const a = 1;\n');
      repo.commitAll('first');
      const firstHash = repo.run(['rev-parse', 'HEAD']).trim();
      repo.writeFile('b.ts', 'export const b = 1;\n');
      repo.commitAll('second');

      const changed = getChangedVsCommit(repo.cwd, firstHash);

      expect(changed).toEqual([join(repo.cwd, 'b.ts')]);
    });

    it('returns files touched in the last N commits', () => {
      repo.writeFile('a.ts', 'export const a = 1;\n');
      repo.commitAll('first');
      repo.writeFile('b.ts', 'export const b = 1;\n');
      repo.commitAll('second');
      repo.writeFile('c.ts', 'export const c = 1;\n');
      repo.commitAll('third');

      const lastOne = getLastNCommitsChanges(repo.cwd, 1);
      const lastTwo = getLastNCommitsChanges(repo.cwd, 2);

      expect(lastOne).toEqual([join(repo.cwd, 'c.ts')]);
      expect(lastTwo.sort()).toEqual(
        [join(repo.cwd, 'b.ts'), join(repo.cwd, 'c.ts')].sort(),
      );
    });
  });

  describe('getChangedVsBranch', () => {
    it('lists files changed since the merge base, ignoring commits the base advanced past', () => {
      repo.writeFile('shared.ts', 'export const s = 1;\n');
      repo.commitAll('shared');
      repo.run(['checkout', '-b', 'feature']);
      repo.writeFile('feature.ts', 'export const f = 1;\n');
      repo.commitAll('feature work');

      // Advance main past the divergence point. A naive diff against main's
      // tip would surface main-only.ts; diffing against the merge base must
      // not, which exercises getMergeBase's branch resolution via the
      // public path.
      repo.run(['checkout', 'main']);
      repo.writeFile('main-only.ts', 'export const m = 1;\n');
      repo.commitAll('main work');
      repo.run(['checkout', 'feature']);

      const changed = getChangedVsBranch(repo.cwd, 'main');
      expect(changed).toEqual([join(repo.cwd, 'feature.ts')]);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns the current branch name', () => {
      repo.writeFile('a.ts', 'export const a = 1;\n');
      repo.commitAll('initial');
      expect(getCurrentBranch(repo.cwd)).toBe('main');
      repo.run(['checkout', '-b', 'feature/x']);
      expect(getCurrentBranch(repo.cwd)).toBe('feature/x');
    });
  });
});
