import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectLanguage, detectLanguageWithReason, scaffoldConfig } from './scaffold-config.js';

describe('detectLanguage', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-lang-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects python from a pyproject.toml manifest', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    expect(detectLanguage(dir)).toBe('python');
  });

  it('detects python from setup.py', () => {
    writeFileSync(join(dir, 'setup.py'), '');
    expect(detectLanguage(dir)).toBe('python');
  });

  it('defaults to typescript', () => {
    expect(detectLanguage(dir)).toBe('typescript');
  });

  it('scaffolds a config carrying the detected language', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = scaffoldConfig(dir);
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain("language: 'python'");
  });

  it('scaffolds a config carrying an explicit language overriding detection', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = scaffoldConfig(dir, 'typescript');
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain("language: 'typescript'");
  });
});

describe('detectLanguageWithReason', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-lang-reason-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports the pyproject.toml manifest as the reason', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    expect(detectLanguageWithReason(dir)).toEqual({
      language: 'python',
      reason: 'found pyproject.toml',
    });
  });

  it('reports setup.py as the reason', () => {
    writeFileSync(join(dir, 'setup.py'), '');
    expect(detectLanguageWithReason(dir)).toEqual({
      language: 'python',
      reason: 'found setup.py',
    });
  });

  it('reports no Python manifest for a typescript default', () => {
    expect(detectLanguageWithReason(dir)).toEqual({
      language: 'typescript',
      reason: 'no Python manifest found',
    });
  });
});
