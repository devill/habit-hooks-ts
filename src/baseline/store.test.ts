import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createGitRepo, type GitRepo } from '../../tests/helpers/git.js';
import {
  BASELINE_FILENAME,
  BaselineParseError,
  BaselineVersionError,
  loadBaseline,
  saveBaseline,
} from './store.js';

describe('baseline store', () => {
  let repo: GitRepo;

  afterEach(() => {
    if (repo) rmSync(repo.cwd, { recursive: true, force: true });
  });

  it('returns empty baseline when file is missing', () => {
    repo = createGitRepo();
    const baseline = loadBaseline(repo.cwd);
    expect(baseline).toEqual({ version: 2, files: {} });
  });

  it('round-trips through save and load', () => {
    repo = createGitRepo();
    const original = {
      version: 2 as const,
      files: {
        'src/a.ts': { snoozedAtCommit: 'aaa' },
        'src/b.ts': { snoozedAtCommit: 'bbb' },
      },
    };
    saveBaseline(repo.cwd, original);
    const loaded = loadBaseline(repo.cwd);
    expect(loaded).toEqual(original);
  });

  it('writes a stable, sorted, pretty-printed file ending with newline', () => {
    repo = createGitRepo();
    const baseline = {
      version: 2 as const,
      files: {
        'z.ts': { snoozedAtCommit: 'zhash' },
        'a.ts': { snoozedAtCommit: 'ahash' },
        'm.ts': { snoozedAtCommit: 'mhash' },
      },
    };
    saveBaseline(repo.cwd, baseline);
    const contents = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');
    expect(contents.endsWith('\n')).toBe(true);
    const aIndex = contents.indexOf('"a.ts"');
    const mIndex = contents.indexOf('"m.ts"');
    const zIndex = contents.indexOf('"z.ts"');
    expect(aIndex).toBeLessThan(mIndex);
    expect(mIndex).toBeLessThan(zIndex);
  });

  it('produces byte-identical output across two saves of the same data', () => {
    repo = createGitRepo();
    const baseline = {
      version: 2 as const,
      files: { 'b.ts': { snoozedAtCommit: 'bbb' }, 'a.ts': { snoozedAtCommit: 'aaa' } },
    };
    saveBaseline(repo.cwd, baseline);
    const first = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');
    saveBaseline(repo.cwd, baseline);
    const second = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');
    expect(second).toBe(first);
  });

  it('throws BaselineVersionError on a future version', () => {
    repo = createGitRepo();
    repo.writeFile(BASELINE_FILENAME, JSON.stringify({ version: 3, files: {} }));
    expect(() => loadBaseline(repo.cwd)).toThrow(BaselineVersionError);
    expect(() => loadBaseline(repo.cwd)).toThrow(/unsupported baseline version 3; expected 1 or 2/);
  });

  it('migrates a v1 baseline on read to a v2 in-memory shape', () => {
    repo = createGitRepo();
    repo.writeFile(
      BASELINE_FILENAME,
      JSON.stringify({
        version: 1,
        files: {
          'src/a.ts': { snoozedAt: 'aaa' },
          'src/b.ts': { snoozedAt: 'bbb' },
        },
      }),
    );
    const loaded = loadBaseline(repo.cwd);
    expect(loaded).toEqual({
      version: 2,
      files: {
        'src/a.ts': { snoozedAtCommit: 'aaa' },
        'src/b.ts': { snoozedAtCommit: 'bbb' },
      },
    });
  });

  it('migrates a v1 baseline with an empty files map to a v2 in-memory shape', () => {
    repo = createGitRepo();
    repo.writeFile(
      BASELINE_FILENAME,
      JSON.stringify({ version: 1, files: {} }),
    );
    const loaded = loadBaseline(repo.cwd);
    expect(loaded).toEqual({ version: 2, files: {} });
  });

  it('does not rewrite the on-disk file just from a v1 read', () => {
    repo = createGitRepo();
    const v1Contents = JSON.stringify({
      version: 1,
      files: { 'a.ts': { snoozedAt: 'aaa' } },
    });
    repo.writeFile(BASELINE_FILENAME, v1Contents);
    loadBaseline(repo.cwd);
    const after = readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8');
    expect(after).toBe(v1Contents);
  });

  it('rewrites a v1 baseline to v2 on the next saveBaseline', () => {
    repo = createGitRepo();
    repo.writeFile(
      BASELINE_FILENAME,
      JSON.stringify({
        version: 1,
        files: { 'a.ts': { snoozedAt: 'aaa' } },
      }),
    );
    const loaded = loadBaseline(repo.cwd);
    saveBaseline(repo.cwd, loaded);
    const after = JSON.parse(readFileSync(join(repo.cwd, BASELINE_FILENAME), 'utf8')) as unknown;
    expect(after).toEqual({
      version: 2,
      files: { 'a.ts': { snoozedAtCommit: 'aaa' } },
    });
  });

  it('rejects a v2 baseline missing snoozedAtCommit with a field-named error', () => {
    repo = createGitRepo();
    repo.writeFile(
      BASELINE_FILENAME,
      JSON.stringify({
        version: 2,
        files: { 'a.ts': { snoozedAt: 'aaa' } },
      }),
    );
    expect(() => loadBaseline(repo.cwd)).toThrow(BaselineParseError);
    expect(() => loadBaseline(repo.cwd)).toThrow(/missing 'snoozedAtCommit' string/);
  });

  it('rejects a v1 baseline missing snoozedAt with a field-named error', () => {
    repo = createGitRepo();
    repo.writeFile(
      BASELINE_FILENAME,
      JSON.stringify({
        version: 1,
        files: { 'a.ts': { snoozedAtCommit: 'aaa' } },
      }),
    );
    expect(() => loadBaseline(repo.cwd)).toThrow(BaselineParseError);
    expect(() => loadBaseline(repo.cwd)).toThrow(/missing 'snoozedAt' string/);
  });
});
