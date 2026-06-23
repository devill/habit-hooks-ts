import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectLanguageWithReason, scaffoldConfig } from './scaffold-config.js';
import { defaultSensorsFor } from '../../sensors/registry.js';
import { loadConfig, SENSORS_FALLBACK_DEPRECATION } from '../../config/load.js';
import { collectConfigWarnings } from '../../config/warnings.js';

describe('detectLanguage (through scaffoldConfig)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-lang-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects python from a pyproject.toml manifest', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = scaffoldConfig(dir);
    expect(readFileSync(result.path, 'utf8')).toContain('"language": "python"');
  });

  it('detects python from setup.py', () => {
    writeFileSync(join(dir, 'setup.py'), '');
    const result = scaffoldConfig(dir);
    expect(readFileSync(result.path, 'utf8')).toContain('"language": "python"');
  });

  it('defaults to typescript', () => {
    const result = scaffoldConfig(dir);
    expect(readFileSync(result.path, 'utf8')).toContain('"language": "typescript"');
  });

  it('scaffolds a config carrying the detected language', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = scaffoldConfig(dir);
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain('"language": "python"');
  });

  it('scaffolds a config carrying an explicit language overriding detection', () => {
    writeFileSync(join(dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const result = scaffoldConfig(dir, 'typescript');
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, 'utf8')).toContain('"language": "typescript"');
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

describe('scaffolded sensors block', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-sensors-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits the typescript sensors as JSON', () => {
    const result = scaffoldConfig(dir, 'typescript');
    const text = readFileSync(result.path, 'utf8');
    expect(text).toContain('"sensors": {');
    expect(text).toContain('"eslint": {');
    expect(text).toContain('"use": "eslint"');
    expect(text).toContain('"needs-extraction"');
  });

  it('emits the python sensors as JSON', () => {
    const result = scaffoldConfig(dir, 'python');
    const text = readFileSync(result.path, 'utf8');
    expect(text).toContain('"sensors": {');
    expect(text).toContain('"ruff": {');
    expect(text).toContain('"use": "ruff"');
    expect(text).toContain('"line-count"');
  });
});

describe('scaffolded config loads back without drift', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-loadback-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0' }, null, 2));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(['typescript', 'python'] as const)(
    'parses %s sensors back to the single source and skips the fallback warning',
    async (language) => {
      scaffoldConfig(dir, language);
      const loaded = await loadConfig(dir);
      expect(loaded.config.sensors).toStrictEqual(defaultSensorsFor(language));
      expect(collectConfigWarnings(loaded.config, language)).not.toContain(SENSORS_FALLBACK_DEPRECATION);
    },
  );
});
