import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knipConfigMarksProduction } from './knip-resolve.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hh-knip-resolve-'));
}

function write(cwd: string, filename: string, contents: string): void {
  writeFileSync(join(cwd, filename), contents);
}

describe('knipConfigMarksProduction', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTempDir();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns false when no config exists', () => {
    expect(knipConfigMarksProduction(cwd)).toBe(false);
  });

  it('returns true for knip.json with a production-marked pattern', () => {
    write(cwd, 'knip.json', '{"entry":["src/index.ts!"],"project":["src/**/*.ts!"]}');
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });

  it('returns false for knip.json without any production marker', () => {
    write(cwd, 'knip.json', '{"entry":["src/index.ts"],"project":["src/**/*.ts"]}');
    expect(knipConfigMarksProduction(cwd)).toBe(false);
  });

  it('returns true for knip.jsonc with comments and a production marker', () => {
    write(cwd, 'knip.jsonc', '{\n  // entry points\n  "entry": ["src/index.ts!"]\n}');
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });

  it('returns true for knip.ts using an export default with a production marker', () => {
    write(cwd, 'knip.ts', "export default { entry: ['src/index.ts!'], project: ['src/**/*.ts!'] };\n");
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });

  it('returns true for package.json knip key with a production marker', () => {
    write(cwd, 'package.json', '{"name":"x","knip":{"entry":["src/index.ts!"]}}');
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });

  it('returns false for package.json knip key without a marker even if a script ends in bang', () => {
    write(
      cwd,
      'package.json',
      '{"name":"x","scripts":{"x":"echo hi!"},"knip":{"entry":["src/index.ts"]}}',
    );
    expect(knipConfigMarksProduction(cwd)).toBe(false);
  });

  it('lets a dedicated knip.json win over package.json knip key', () => {
    write(cwd, 'knip.json', '{"entry":["src/index.ts"]}');
    write(cwd, 'package.json', '{"name":"x","knip":{"entry":["src/index.ts!"]}}');
    expect(knipConfigMarksProduction(cwd)).toBe(false);
  });

  it('detects a production marker when entry is a single string', () => {
    write(cwd, 'knip.json', '{"entry":"src/index.ts!","project":["src/**/*.ts"]}');
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });

  it('detects a production marker inside a nested workspaces config', () => {
    write(
      cwd,
      'knip.json',
      '{"workspaces":{"packages/app":{"entry":["src/main.ts!"],"project":["src/**/*.ts!"]}}}',
    );
    expect(knipConfigMarksProduction(cwd)).toBe(true);
  });
});
