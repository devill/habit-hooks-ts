import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from './run.js';
import { makeAutoPrompter } from './prompts.js';
import type { Language } from '../../config/schema.js';

function run(cwd: string, language: Language): ReturnType<typeof runInit> {
  return runInit(cwd, { prompter: makeAutoPrompter(false), language });
}

describe('completion report', () => {
  let cwd: string;
  let home: string;
  let originalHome: string | undefined;
  let originalPath: string | undefined;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'hh-report-'));
    home = mkdtempSync(join(tmpdir(), 'hh-report-home-'));
    originalHome = process.env.HOME;
    originalPath = process.env.PATH;
    process.env.HOME = home;
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo' }));
  });
  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  function withPythonToolsOnPath(): string {
    const bin = mkdtempSync(join(tmpdir(), 'hh-report-bin-'));
    for (const tool of ['ruff', 'deptry']) {
      writeFileSync(join(bin, tool), '#!/bin/sh\n');
    }
    return bin;
  }

  function fakeNodeToolInstalled(name: string): void {
    const binDir = join(cwd, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, name), '#!/usr/bin/env node\n');
    const pkgDir = join(cwd, 'node_modules', name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name }));
  }

  it('shows the eslint advisory but still reaches Setup complete for a configured TS project', async () => {
    for (const tool of ['eslint', 'knip', 'jscpd']) fakeNodeToolInstalled(tool);
    const result = await run(cwd, 'typescript');
    expect(result.stdout).toContain('Setup complete');
    expect(result.stdout).not.toContain('Setup incomplete');
    expect(result.stdout).toContain(
      'Note: eslint config may be missing the bundled thresholds',
    );
  });

  it('lists the node install for a missing jscpd in a python project', async () => {
    writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname = "x"\n');
    process.env.PATH = withPythonToolsOnPath();
    const result = await run(cwd, 'python');
    expect(result.stdout).toContain('Setup incomplete');
    expect(result.stdout).toContain('Install jscpd:');
    expect(result.stdout).toContain('npm install --save-dev jscpd');
    expect(existsSync(join(cwd, '.jscpd.json'))).toBe(true);
  });

  it('prints Setup complete when everything is installed, configured, and tuned', async () => {
    writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname = "x"\n');
    const bin = withPythonToolsOnPath();
    const jscpdBin = join(cwd, 'node_modules', '.bin');
    mkdirSync(jscpdBin, { recursive: true });
    writeFileSync(join(jscpdBin, 'jscpd'), '#!/usr/bin/env node\n');
    const pkgDir = join(cwd, 'node_modules', 'jscpd');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'jscpd' }));
    process.env.PATH = bin;
    const result = await run(cwd, 'python');
    expect(result.stdout).toContain('Setup complete');
    expect(result.stdout).not.toContain('Setup incomplete');
  });

  it('tells a python project with no pyproject.toml to create one for deptry', async () => {
    process.env.PATH = withPythonToolsOnPath();
    const result = await run(cwd, 'python');
    expect(result.stdout).toContain('Setup incomplete');
    expect(result.stdout).toContain('Create a pyproject.toml that declares your dependencies');
  });

  it('names a recommended jscpd key missing from an existing config', async () => {
    writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname = "x"\n');
    writeFileSync(join(cwd, '.jscpd.json'), JSON.stringify({ threshold: 0, minLines: 5 }));
    process.env.PATH = withPythonToolsOnPath();
    const result = await run(cwd, 'python');
    expect(result.stdout).toContain('.jscpd.json is missing recommended keys');
    expect(result.stdout).toContain('"minTokens": 50');
  });

  it('flags ruff thresholds missing from the user pyproject.toml', async () => {
    writeFileSync(
      join(cwd, 'pyproject.toml'),
      '[tool.ruff.lint.mccabe]\nmax-complexity = 10\n',
    );
    process.env.PATH = withPythonToolsOnPath();
    const result = await run(cwd, 'python');
    expect(result.stdout).toContain('ruff is missing recommended thresholds');
    expect(result.stdout).toContain('max-args = 3');
    expect(result.stdout).toContain('max-statements = 50');
    expect(result.stdout).not.toContain('max-complexity = 10\n  - set');
  });

  it('does not flag ruff thresholds when the scaffolded ruff.toml covers them', async () => {
    writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname = "x"\n');
    process.env.PATH = withPythonToolsOnPath();
    const result = await run(cwd, 'python');
    expect(result.stdout).not.toContain('ruff is missing recommended thresholds');
  });
});

describe('completion report under dry-run', () => {
  let cwd: string;
  let home: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'hh-report-dry-'));
    home = mkdtempSync(join(tmpdir(), 'hh-report-dry-home-'));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'demo' }));
  });
  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('python --dry-run writes no files', async () => {
    writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = await runInit(cwd, {
      prompter: makeAutoPrompter(false),
      language: 'python',
      dryRun: true,
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, 'ruff.toml'))).toBe(false);
    expect(existsSync(join(cwd, '.jscpd.json'))).toBe(false);
    expect(existsSync(join(cwd, 'habit-hooks.config.js'))).toBe(false);
    expect(existsSync(join(cwd, '.habit-hooks-baseline.json'))).toBe(false);
    expect(result.stdout).toContain('[dry-run] would write');
    expect(result.stdout).not.toContain('Setup complete');
    expect(result.stdout).toContain('Setup incomplete');
    expect(result.stdout).toContain('.jscpd.json is missing recommended keys');
  });
});
