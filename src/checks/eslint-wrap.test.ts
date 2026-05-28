import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eslintWrap } from './eslint-wrap.js';
import type { CheckOutcome, Rule } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const repoNodeModules = join(repoRoot, 'node_modules');

const RULES: Rule[] = [];

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hh-eslint-wrap-'));
}

function linkNodeModules(cwd: string): void {
  symlinkSync(repoNodeModules, join(cwd, 'node_modules'), 'dir');
}

function writeFile(cwd: string, rel: string, contents: string): string {
  const full = join(cwd, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

function asOutcome(result: Awaited<ReturnType<typeof eslintWrap.run>>): CheckOutcome {
  if (Array.isArray(result)) return { violations: result, stderr: [] };
  return result;
}

async function runWrap(cwd: string, files: string[]): Promise<CheckOutcome> {
  return asOutcome(await eslintWrap.run(files, RULES, cwd));
}

describe('eslintWrap', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns eslint-prefixed violations when consumer eslint reports problems', async () => {
    linkNodeModules(cwd);
    writeFile(cwd, 'eslint.config.mjs', 'export default [{ rules: { "no-var": "error" } }];\n');
    const file = writeFile(cwd, 'a.js', 'var x = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toHaveLength(1);
    expect(outcome.violations[0]?.ruleId).toBe('eslint:no-var');
    expect(outcome.stderr).toEqual([]);
  }, 30_000);

  it('emits a single fallback stderr notice when no consumer eslint is installed', async () => {
    writeFile(cwd, 'eslint.config.mjs', 'export default [{ rules: { "no-var": "error" } }];\n');
    const file = writeFile(cwd, 'a.js', 'var x = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.stderr).toHaveLength(1);
    expect(outcome.stderr?.[0]).toContain('using bundled eslint');
    expect(outcome.violations).toHaveLength(1);
  }, 30_000);

  it('warns and returns zero violations when eslint exits with a config error', async () => {
    linkNodeModules(cwd);
    const file = writeFile(cwd, 'a.js', 'var x = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toEqual([]);
    expect(outcome.stderr?.some((s) => s.includes('config error'))).toBe(true);
  }, 30_000);

  it('skips invocation entirely when file list is empty', async () => {
    const outcome = await runWrap(cwd, []);

    expect(outcome).toEqual({ violations: [], stderr: [] });
  });

  it('returns a violation with raw ruleId when no prompt is registered for it', async () => {
    linkNodeModules(cwd);
    writeFile(cwd, 'eslint.config.mjs', 'export default [{ rules: { "no-console": "error" } }];\n');
    const file = writeFile(cwd, 'a.js', 'console.log(1);\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toHaveLength(1);
    expect(outcome.violations[0]?.ruleId).toBe('eslint:no-console');
    expect(outcome.violations[0]?.message).toMatch(/^no-console: /);
  }, 30_000);

  it('emits a spawn-failure stderr notice when the eslint binary cannot be executed', async () => {
    const eslintDir = join(cwd, 'node_modules', 'eslint');
    mkdirSync(eslintDir, { recursive: true });
    const fakeBin = writeFile(cwd, 'node_modules/eslint/eslint-broken', 'not-executable');
    chmodSync(fakeBin, 0o644);
    writeFileSync(join(eslintDir, 'package.json'), JSON.stringify({ bin: { eslint: 'eslint-broken' } }));
    writeFile(cwd, 'eslint.config.mjs', 'export default [];\n');
    const file = writeFile(cwd, 'a.js', 'var x = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toEqual([]);
    expect(outcome.stderr?.some((s) => s.includes('eslint skipped') && /EACCES|spawn/i.test(s))).toBe(true);
    expect(outcome.stderr?.some((s) => s.includes('config error'))).toBe(false);
  });

  it('surfaces fatal parser errors as eslint:fatal violations', async () => {
    linkNodeModules(cwd);
    writeFile(cwd, 'eslint.config.mjs', 'export default [{ rules: { "no-var": "error" } }];\n');
    const file = writeFile(cwd, 'broken.js', 'function foo(\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toHaveLength(1);
    expect(outcome.violations[0]?.ruleId).toBe('eslint:fatal');
    expect(outcome.violations[0]?.file).toBe(file);
    expect(outcome.violations[0]?.line).toBe(2);
    expect(outcome.violations[0]?.message).toMatch(/Fatal parse\/config error:/);
    expect(outcome.stderr).toEqual([]);
  }, 30_000);

  it('surfaces a fatal and a real rule violation as two violations on the same run', async () => {
    linkNodeModules(cwd);
    writeFile(cwd, 'eslint.config.mjs', 'export default [{ rules: { "no-var": "error" } }];\n');
    const fatalFile = writeFile(cwd, 'broken.js', 'function foo(\n');
    const ruleFile = writeFile(cwd, 'a.js', 'var x = 1;\n');

    const outcome = await runWrap(cwd, [fatalFile, ruleFile]);

    expect(outcome.violations).toHaveLength(2);
    const ruleIds = outcome.violations.map((v) => v.ruleId).sort();
    expect(ruleIds).toEqual(['eslint:fatal', 'eslint:no-var']);
  }, 30_000);

  it('parses valid eslint JSON output and decorates each violation', async () => {
    linkNodeModules(cwd);
    writeFile(
      cwd,
      'eslint.config.mjs',
      'export default [{ rules: { "no-var": "error", "no-console": "error" } }];\n',
    );
    const file = writeFile(cwd, 'a.js', 'var x = 1;\nconsole.log(x);\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toHaveLength(2);
    expect(outcome.violations.every((v) => v.ruleId.startsWith('eslint:'))).toBe(true);
    expect(outcome.violations.every((v) => v.file === file)).toBe(true);
  }, 30_000);
});
