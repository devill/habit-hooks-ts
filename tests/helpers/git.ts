import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const helpersDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(helpersDir, '..', '..');
const repoNodeModules = join(repoRoot, 'node_modules');
const SHARED_ESLINT_CONFIG_PATH = join(repoRoot, 'tests', 'fixtures', '_shared', 'eslint.config.js');

export interface GitRepo {
  cwd: string;
  writeFile: (relPath: string, contents: string) => void;
  commitAll: (message: string) => void;
  run: (args: string[]) => string;
}

export interface CreateGitRepoOptions {
  withEslint?: boolean;
}

function readSharedEslintConfig(): string {
  return readFileSync(SHARED_ESLINT_CONFIG_PATH, 'utf8');
}

function writeDefaultEslintConfig(cwd: string): void {
  writeFileSync(join(cwd, 'eslint.config.js'), readSharedEslintConfig());
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'hh-test', type: 'module' }));
  symlinkSync(repoNodeModules, join(cwd, 'node_modules'), 'dir');
}

function gitInit(cwd: string): void {
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd });
}

function makeWriteFile(cwd: string): GitRepo['writeFile'] {
  return (relPath, contents) => {
    const full = join(cwd, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  };
}

function makeCommitAll(cwd: string): GitRepo['commitAll'] {
  return (message) => {
    execFileSync('git', ['add', '-A'], { cwd });
    execFileSync('git', ['commit', '--quiet', '-m', message], { cwd });
  };
}

function makeRun(cwd: string): GitRepo['run'] {
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
}

export function createGitRepo(opts: CreateGitRepoOptions = {}): GitRepo {
  const cwd = mkdtempSync(join(tmpdir(), 'hh-git-'));
  gitInit(cwd);
  if (opts.withEslint === true) writeDefaultEslintConfig(cwd);
  return {
    cwd,
    writeFile: makeWriteFile(cwd),
    commitAll: makeCommitAll(cwd),
    run: makeRun(cwd),
  };
}
