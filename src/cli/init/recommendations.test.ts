import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSCPD_RECOMMENDATION, RUFF_RECOMMENDATION } from './recommendations.js';
import { scaffoldJscpdConfig } from './scaffold-jscpd-config.js';
import { scaffoldRuffConfig } from './scaffold-ruff-config.js';

describe('recommendations', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'hh-recs-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  describe('jscpd missingKeys', () => {
    it('reports all keys when no config exists', () => {
      expect(JSCPD_RECOMMENDATION.missingKeys(cwd)).toEqual(['threshold', 'minTokens', 'minLines']);
    });

    it('returns [] for a config carrying every recommended key', () => {
      writeFileSync(
        join(cwd, '.jscpd.json'),
        JSON.stringify({ threshold: 1, minTokens: 99, minLines: 9 }),
      );
      expect(JSCPD_RECOMMENDATION.missingKeys(cwd)).toEqual([]);
    });

    it('flags only the absent key', () => {
      writeFileSync(join(cwd, '.jscpd.json'), JSON.stringify({ threshold: 0, minLines: 5 }));
      expect(JSCPD_RECOMMENDATION.missingKeys(cwd)).toEqual(['minTokens']);
    });
  });

  describe('ruff missingKeys', () => {
    it('returns [] when ruff.toml carries all three thresholds', () => {
      writeFileSync(
        join(cwd, 'ruff.toml'),
        '[lint.mccabe]\nmax-complexity = 10\n[lint.pylint]\nmax-args = 3\nmax-statements = 50\n',
      );
      expect(RUFF_RECOMMENDATION.missingKeys(cwd)).toEqual([]);
    });

    it('flags thresholds absent from pyproject.toml', () => {
      writeFileSync(
        join(cwd, 'pyproject.toml'),
        '[tool.ruff.lint.mccabe]\nmax-complexity = 10\n',
      );
      expect(RUFF_RECOMMENDATION.missingKeys(cwd)).toEqual(['max-args', 'max-statements']);
    });

    it('reports all keys when no ruff config text exists', () => {
      expect(RUFF_RECOMMENDATION.missingKeys(cwd)).toEqual([
        'max-complexity',
        'max-args',
        'max-statements',
      ]);
    });
  });

  describe('scaffolded templates satisfy the recommendations', () => {
    it('scaffolded .jscpd.json has no missing recommended keys', () => {
      scaffoldJscpdConfig(cwd, 'typescript');
      expect(JSCPD_RECOMMENDATION.missingKeys(cwd)).toEqual([]);
    });

    it('scaffolded ruff.toml has no missing recommended keys', () => {
      scaffoldRuffConfig(cwd);
      expect(RUFF_RECOMMENDATION.missingKeys(cwd)).toEqual([]);
    });
  });
});
