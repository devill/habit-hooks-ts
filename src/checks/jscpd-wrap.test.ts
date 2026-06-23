import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jscpdWrap } from './jscpd-wrap.js';
import { resolveJscpdBin } from './jscpd-resolve.js';
import type { CheckOutcome, Rule } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const repoNodeModules = join(repoRoot, 'node_modules');

const RULES: Rule[] = [];

const DUPLICATE = `export function processOrder(order: { id: number; total: number }): number {
  const tax = order.total * 0.1;
  const shipping = order.total > 100 ? 0 : 10;
  const discount = order.total > 500 ? order.total * 0.05 : 0;
  return order.total + tax + shipping - discount;
}
`;

const CLEAN = `export const x = 1;\n`;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hh-jscpd-wrap-'));
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

function writeJscpdConfig(cwd: string): void {
  writeFile(cwd, '.jscpd.json', JSON.stringify({ minTokens: 20, minLines: 2 }));
}

function asOutcome(result: Awaited<ReturnType<typeof jscpdWrap.run>>): CheckOutcome {
  if (Array.isArray(result)) return { violations: result, stderr: [] };
  return result;
}

async function runWrap(cwd: string, files: string[]): Promise<CheckOutcome> {
  return asOutcome(await jscpdWrap.run(files, RULES, cwd));
}

// jscpdWrap.run creates its scratch report dir under os.tmpdir() (makeReportDir).
// os.tmpdir() honours TMPDIR per call, so pointing TMPDIR at a private dir lets us
// observe the wrap's own scratch cleanup race-free against parallel tests. Returns
// the scratch dirs the wrap left behind in that private root.
async function runWrapWithPrivateTmp(cwd: string, files: string[]): Promise<string[]> {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'hh-jscpd-root-'));
  const original = process.env.TMPDIR;
  process.env.TMPDIR = tmpRoot;
  try {
    await runWrap(cwd, files);
    return readdirSync(tmpRoot);
  } finally {
    if (original === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = original;
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

describe('jscpdWrap', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns duplicated-code violations for two near-identical files', async () => {
    linkNodeModules(cwd);
    writeJscpdConfig(cwd);
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    const b = writeFile(cwd, 'b.ts', DUPLICATE);

    const outcome = await runWrap(cwd, [a, b]);

    expect(outcome.violations.length).toBeGreaterThanOrEqual(2);
    expect(outcome.violations.every((v) => v.ruleId === 'duplicated-code')).toBe(true);
    expect(outcome.violations.some((v) => v.file === a && v.message.includes(b))).toBe(true);
    expect(outcome.violations.some((v) => v.file === b && v.message.includes(a))).toBe(true);
    expect(outcome.stderr).toEqual([]);
  }, 30_000);

  it('emits a fallback stderr notice when no consumer jscpd is installed', async () => {
    writeJscpdConfig(cwd);
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    const b = writeFile(cwd, 'b.ts', DUPLICATE);

    const outcome = await runWrap(cwd, [a, b]);

    expect(outcome.stderr?.[0]).toContain('using bundled jscpd');
    expect(outcome.violations.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('returns empty when no files supplied', async () => {
    linkNodeModules(cwd);
    const outcome = await runWrap(cwd, []);
    expect(outcome).toEqual({ violations: [], stderr: [] });
  });

  it('only reports clones with at least one location in the changed-files set', async () => {
    linkNodeModules(cwd);
    writeJscpdConfig(cwd);
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    writeFile(cwd, 'b.ts', DUPLICATE);
    const c = writeFile(cwd, 'c.ts', CLEAN);

    const outcome = await runWrap(cwd, [a, c]);

    expect(outcome.violations.length).toBeGreaterThanOrEqual(1);
    expect(outcome.violations.every((v) => v.file === a)).toBe(true);
  }, 30_000);

  it('reports all clones when scope passes all files', async () => {
    linkNodeModules(cwd);
    writeJscpdConfig(cwd);
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    const b = writeFile(cwd, 'b.ts', DUPLICATE);

    const outcome = await runWrap(cwd, [a, b]);

    const files = new Set(outcome.violations.map((v) => v.file));
    expect(files.has(a)).toBe(true);
    expect(files.has(b)).toBe(true);
  }, 30_000);

  it('cleans up the tmpdir after a successful run', async () => {
    linkNodeModules(cwd);
    writeJscpdConfig(cwd);
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    const b = writeFile(cwd, 'b.ts', DUPLICATE);

    const leftover = await runWrapWithPrivateTmp(cwd, [a, b]);

    expect(leftover).toEqual([]);
  }, 30_000);

  it('cleans up the tmpdir even when the report is missing', async () => {
    writeJscpdConfig(cwd);
    const jscpdDir = join(cwd, 'node_modules', 'jscpd');
    mkdirSync(jscpdDir, { recursive: true });
    const stub = writeFile(cwd, 'node_modules/jscpd/stub.js', '#!/usr/bin/env node\nprocess.exit(0);\n');
    chmodSync(stub, 0o755);
    writeFileSync(join(jscpdDir, 'package.json'), JSON.stringify({ bin: { jscpd: 'stub.js' } }));

    const leftover = await runWrapWithPrivateTmp(cwd, [writeFile(cwd, 'a.ts', 'x')]);

    expect(leftover).toEqual([]);
  });

  it('emits a spawn-failure stderr notice when the jscpd binary cannot be executed', async () => {
    writeJscpdConfig(cwd);
    const jscpdDir = join(cwd, 'node_modules', 'jscpd');
    mkdirSync(jscpdDir, { recursive: true });
    const fakeBin = writeFile(cwd, 'node_modules/jscpd/broken', 'not-executable');
    chmodSync(fakeBin, 0o644);
    writeFileSync(join(jscpdDir, 'package.json'), JSON.stringify({ bin: { jscpd: 'broken' } }));
    const file = writeFile(cwd, 'a.ts', 'export const a = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toEqual([]);
    expect(outcome.stderr?.some((s) => s.includes('jscpd skipped'))).toBe(true);
  });

  it('emits a skip stderr notice when no jscpd config file exists', async () => {
    linkNodeModules(cwd);
    const file = writeFile(cwd, 'a.ts', 'export const a = 1;\n');

    const outcome = await runWrap(cwd, [file]);

    expect(outcome.violations).toEqual([]);
    expect(outcome.stderr?.some((s) => s.includes('no jscpd config'))).toBe(true);
  });

  it('runs when jscpd config is supplied via package.json#jscpd', async () => {
    linkNodeModules(cwd);
    const pkg = { name: 'fixture', version: '0.0.0', jscpd: { minTokens: 20, minLines: 2 } };
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg));
    const a = writeFile(cwd, 'a.ts', DUPLICATE);
    const b = writeFile(cwd, 'b.ts', DUPLICATE);

    const outcome = await runWrap(cwd, [a, b]);

    expect(outcome.violations.length).toBeGreaterThanOrEqual(2);
    expect(outcome.violations.every((v) => v.ruleId === 'duplicated-code')).toBe(true);
  }, 30_000);

  it('resolveJscpdBin returns null when no consumer jscpd and the bundled fallback throws', () => {
    // No consumer node_modules in cwd, so detection fails; the injected bundled
    // resolver throws, so tryBundledJscpdBin swallows it and resolution is null.
    // This null is exactly what makes jscpdWrap.run emit the "could not locate
    // bundled bin" notice in production.
    expect(
      resolveJscpdBin(cwd, () => {
        throw new Error('synthetic');
      }),
    ).toBeNull();
  });

  it('resolveJscpdBin prefers a consumer-detected bin over the bundled fallback', () => {
    const jscpdDir = join(cwd, 'node_modules', 'jscpd');
    mkdirSync(jscpdDir, { recursive: true });
    const stub = writeFile(cwd, 'node_modules/jscpd/stub.js', '#!/usr/bin/env node\n');
    chmodSync(stub, 0o755);
    writeFileSync(join(jscpdDir, 'package.json'), JSON.stringify({ bin: { jscpd: 'stub.js' } }));

    const resolution = resolveJscpdBin(cwd, () => {
      throw new Error('bundled fallback must not be consulted');
    });

    expect(resolution).toEqual({ binPath: stub, isFallback: false });
  });
});
