import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createGitRepo, type GitRepo } from '../tests/helpers/git.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(repoRoot, 'dist', 'cli.js');
const fixturesDir = join(repoRoot, 'tests', 'fixtures');

const DIRTY_FN = `export function tooMany(a: number, b: number, c: number, d: number): number {
  return a + b + c + d;
}
`;

describe('cli', () => {
  beforeAll(() => {
    if (!existsSync(cliPath)) {
      const build = spawnSync('npm', ['run', 'build'], { cwd: repoRoot, encoding: 'utf8' });
      if (build.status !== 0) {
        throw new Error(`build failed: ${build.stderr}`);
      }
    }
  }, 60_000);

  it('prints version with --version', () => {
    const result = spawnSync('node', [cliPath, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('habit-hooks v0.1.0-beta.0');
  });

  describe('malformed config', () => {
    let workDir: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), 'hh-cli-bad-'));
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    it('exits 2 and prints a field-path message on malformed config', () => {
      const bad = { rules: { x: { severity: 'bogus' } } };
      writeFileSync(join(workDir, 'habit-hooks.config.json'), JSON.stringify(bad));
      const result = spawnSync('node', [cliPath], { cwd: workDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/rules\.x\.severity must be 'enforced' or 'suggested'/);
    });
  });

  describe('--config flag', () => {
    it('applies the config at the given path from a different cwd', () => {
      const configPath = join(fixturesDir, 'configured-project', 'habit-hooks.config.ts');
      const dirtyCwd = join(fixturesDir, 'dirty-project');
      const result = spawnSync('node', [cliPath, '--config', configPath], {
        cwd: dirtyCwd,
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Habit Hooks: 1 violation');
      expect(result.stdout).toContain('Too many parameters');
      expect(result.stdout).toContain('CUSTOM PROJECT GUIDANCE');
    });
  });

  describe('init command', () => {
    let workDir: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), 'hh-cli-init-'));
      writeFileSync(join(workDir, 'package.json'), JSON.stringify({ name: 'x' }));
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    it('exits 2 and lists supported languages for an unknown language', () => {
      const result = spawnSync('node', [cliPath, 'init', 'rust'], {
        cwd: workDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/unsupported language 'rust'/);
      expect(result.stderr).toMatch(/typescript, python/);
      expect(existsSync(join(workDir, 'habit-hooks.config.js'))).toBe(false);
    });

    it('reports detection and writes nothing when no language is given', () => {
      const result = spawnSync('node', [cliPath, 'init'], {
        cwd: workDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Detected TypeScript');
      expect(result.stdout).toContain('habit-hooks init typescript');
      expect(existsSync(join(workDir, 'habit-hooks.config.js'))).toBe(false);
    });
  });

  describe('scope flags', () => {
    let repo: GitRepo;

    afterEach(() => {
      rmSync(repo.cwd, { recursive: true, force: true });
    });

    it('errors and exits 2 when --last and --branch are combined', () => {
      repo = createGitRepo();
      const result = spawnSync('node', [cliPath, '--last', '1', '--branch', 'main'], {
        cwd: repo.cwd,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/cannot be used with/);
    });

    it('--branch with no value uses config.scope.branchBase', () => {
      repo = createGitRepo({ withEslint: true });
      const cfg = {
        scope: { branchBase: 'main' },
        smells: { 'oversized-function': { disabled: true } },
      };
      writeFileSync(join(repo.cwd, 'habit-hooks.config.json'), JSON.stringify(cfg));
      repo.commitAll('initial config');
      repo.run(['checkout', '-b', 'feature']);
      repo.writeFile('bad.ts', DIRTY_FN);
      repo.commitAll('feature work');

      const result = spawnSync('node', [cliPath, '--branch'], {
        cwd: repo.cwd,
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('bad.ts');
    });

    it('exits 2 with a clear error when --last is used outside a git repo', () => {
      repo = { cwd: mkdtempSync(join(tmpdir(), 'hh-nogit-')) } as GitRepo;
      const result = spawnSync('node', [cliPath, '--last', '1'], {
        cwd: repo.cwd,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/--last requires a git repository/);
    });
  });
});
