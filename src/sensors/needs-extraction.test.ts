import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReplaceMode, needsExtractionSensor } from './needs-extraction.js';
import { satisfiableSensors } from './runner.js';
import { run } from '../runner.js';
import type { Issue, Sensor } from './types.js';

function issue(smell: string, file: string): Issue {
  return { smell, details: { file } };
}

describe('needsExtractionSensor', () => {
  it('emits needs-extraction only for files with both inputs', async () => {
    const deps = [
      issue('oversized-file', '/a.ts'),
      issue('duplicated-code', '/a.ts'),
      issue('oversized-file', '/b.ts'),
      issue('duplicated-code', '/c.ts'),
    ];
    const out = await needsExtractionSensor().run({ files: [], cwd: '/', deps });
    expect(out.map((i) => i.details.file)).toEqual(['/a.ts']);
    expect(out[0]?.smell).toBe('needs-extraction');
  });
});

describe('applyReplaceMode', () => {
  const issues = [
    issue('needs-extraction', '/a.ts'),
    issue('oversized-file', '/a.ts'),
    issue('duplicated-code', '/a.ts'),
    issue('oversized-file', '/b.ts'),
  ];

  it('augment (default) keeps every issue', () => {
    expect(applyReplaceMode(issues, false)).toEqual(issues);
  });

  it('replace drops the input smells only for files with needs-extraction', () => {
    expect(applyReplaceMode(issues, true).map((i) => `${i.smell}:${String(i.details.file)}`)).toEqual([
      'needs-extraction:/a.ts',
      'oversized-file:/b.ts',
    ]);
  });
});

describe('satisfiableSensors', () => {
  const producer: Sensor = {
    id: 'p',
    produces: ['oversized-file', 'duplicated-code'],
    run: () => Promise.resolve([]),
  };

  it('drops a multi sensor whose deps are not produced by another active sensor', () => {
    expect(satisfiableSensors([needsExtractionSensor()])).toEqual([]);
  });

  it('keeps the multi sensor when both deps are produced', () => {
    expect(satisfiableSensors([needsExtractionSensor(), producer]).map((s) => s.id)).toEqual([
      'needs-extraction',
      'p',
    ]);
  });
});

const BLOCK = `export function NAME(order) {
  const tax = order.total * 0.1;
  const shipping = order.total > 100 ? 0 : 10;
  return order.total + tax + shipping;
}
`;

describe('needs-extraction end-to-end', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function setup(config?: unknown): void {
    dir = mkdtempSync(join(tmpdir(), 'hh-needs-extraction-'));
    writeFileSync(
      join(dir, 'eslint.config.js'),
      `export default [{ languageOptions: { sourceType: 'module', ecmaVersion: 2022 }, rules: { 'max-lines': ['error', { max: 8 }] } }];\n`,
    );
    writeFileSync(join(dir, '.jscpd.json'), JSON.stringify({ minTokens: 20, minLines: 2 }));
    writeFileSync(join(dir, 'big.js'), BLOCK.replace('NAME', 'alpha') + BLOCK.replace('NAME', 'beta'));
    if (config !== undefined) writeFileSync(join(dir, 'habit-hooks.config.json'), JSON.stringify(config));
  }

  function smellsOf(violations: { ruleId: string }[]): Set<string> {
    return new Set(violations.map((v) => v.ruleId));
  }

  it('fires needs-extraction through the real runner and augments by default', async () => {
    setup();
    const smells = smellsOf((await run(dir)).violations);
    expect(smells.has('needs-extraction')).toBe(true);
    expect(smells.has('oversized-file')).toBe(true);
    expect(smells.has('duplicated-code')).toBe(true);
  }, 30_000);

  it('replace mode suppresses the input smells for the combined file', async () => {
    setup({ needsExtraction: { replace: true } });
    const violations = (await run(dir)).violations;
    expect(violations.filter((v) => v.ruleId === 'needs-extraction').length).toBeGreaterThan(0);
    expect(violations.filter((v) => v.ruleId === 'oversized-file')).toEqual([]);
    expect(violations.filter((v) => v.ruleId === 'duplicated-code')).toEqual([]);
  }, 30_000);
});
