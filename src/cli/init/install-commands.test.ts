import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager, installCommandsFor, runScriptCommand } from './install-commands.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hh-pm-'));
}

describe('detectPackageManager', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('defaults to npm when no lockfile is present', () => {
    expect(detectPackageManager(cwd)).toBe('npm');
  });

  it('detects pnpm via pnpm-lock.yaml', () => {
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(cwd)).toBe('pnpm');
  });

  it('detects yarn via yarn.lock', () => {
    writeFileSync(join(cwd, 'yarn.lock'), '');
    expect(detectPackageManager(cwd)).toBe('yarn');
  });

  it('detects bun via bun.lockb', () => {
    writeFileSync(join(cwd, 'bun.lockb'), '');
    expect(detectPackageManager(cwd)).toBe('bun');
  });

  it('detects bun via bun.lock (Bun 1.2 text lockfile)', () => {
    writeFileSync(join(cwd, 'bun.lock'), '');
    expect(detectPackageManager(cwd)).toBe('bun');
  });

  it('picks the newest lockfile when multiple are present', () => {
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), '');
    writeFileSync(join(cwd, 'yarn.lock'), '');
    const past = new Date('2020-01-01T00:00:00Z');
    const recent = new Date('2025-01-01T00:00:00Z');
    utimesSync(join(cwd, 'pnpm-lock.yaml'), past, past);
    utimesSync(join(cwd, 'yarn.lock'), recent, recent);
    expect(detectPackageManager(cwd)).toBe('yarn');
  });
});

describe('runScriptCommand', () => {
  it('formats pnpm run <script>', () => {
    expect(runScriptCommand('pnpm', 'habit-hooks')).toBe('pnpm run habit-hooks');
  });

  it('formats npm run <script>', () => {
    expect(runScriptCommand('npm', 'habit-hooks')).toBe('npm run habit-hooks');
  });
});

describe('installCommandsFor', () => {
  let cwd: string;

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function withLockfile(lockfile: string): void {
    cwd = makeTempDir();
    writeFileSync(join(cwd, lockfile), '');
  }

  describe('node command assembly per package manager', () => {
    it('emits pnpm add -D for a pnpm-lock.yaml project', () => {
      withLockfile('pnpm-lock.yaml');
      expect(installCommandsFor(cwd, ['knip'])).toEqual(['pnpm add -D knip']);
    });

    it('emits npm install --save-dev (no lockfile) and joins multiple packages', () => {
      cwd = makeTempDir();
      expect(installCommandsFor(cwd, ['knip', 'jscpd'])).toEqual([
        'npm install --save-dev knip jscpd',
      ]);
    });

    it('emits yarn add -D for a yarn.lock project', () => {
      withLockfile('yarn.lock');
      expect(installCommandsFor(cwd, ['jscpd'])).toEqual(['yarn add -D jscpd']);
    });

    it('emits bun add -d for a bun.lockb project', () => {
      withLockfile('bun.lockb');
      expect(installCommandsFor(cwd, ['knip'])).toEqual(['bun add -d knip']);
    });
  });

  describe('package expansion', () => {
    beforeEach(() => {
      withLockfile('pnpm-lock.yaml');
    });

    it('expands eslint into its peer packages', () => {
      expect(installCommandsFor(cwd, ['eslint'])).toEqual([
        'pnpm add -D eslint @eslint/js typescript-eslint',
      ]);
    });

    it('uses just the tool name for knip and jscpd', () => {
      expect(installCommandsFor(cwd, ['knip', 'jscpd'])).toEqual(['pnpm add -D knip jscpd']);
    });

    it('uses just the tool name for ruff and deptry (pip)', () => {
      expect(installCommandsFor(cwd, ['ruff', 'deptry'])).toEqual(['pip install ruff deptry']);
    });
  });

  describe('ecosystem routing', () => {
    beforeEach(() => {
      withLockfile('pnpm-lock.yaml');
    });

    it('returns an empty array when nothing is missing', () => {
      expect(installCommandsFor(cwd, [])).toEqual([]);
    });

    it('returns a node command for jscpd', () => {
      expect(installCommandsFor(cwd, ['jscpd'])).toEqual(['pnpm add -D jscpd']);
    });

    it('returns both node and pip commands when the missing set spans ecosystems', () => {
      expect(installCommandsFor(cwd, ['jscpd', 'ruff'])).toEqual([
        'pnpm add -D jscpd',
        'pip install ruff',
      ]);
    });
  });
});
