import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_CONFIG_FILENAMES } from '../../detect/tool.js';

export interface RecommendedKey {
  key: string;
  value: number;
  description: string;
}

export interface Recommendation {
  keys: RecommendedKey[];
  missingKeys: (_cwd: string) => string[];
}

export const JSCPD_RECOMMENDED: RecommendedKey[] = [
  { key: 'threshold', value: 0, description: 'fail on any duplication' },
  { key: 'minTokens', value: 50, description: 'smallest duplicate token run reported' },
  { key: 'minLines', value: 5, description: 'smallest duplicate line run reported' },
];

export const RUFF_RECOMMENDED: RecommendedKey[] = [
  { key: 'max-complexity', value: 10, description: 'mccabe cyclomatic complexity ceiling' },
  { key: 'max-args', value: 3, description: 'pylint maximum function arguments' },
  { key: 'max-statements', value: 50, description: 'pylint maximum function statements' },
];

function readJscpdConfig(cwd: string): Record<string, unknown> | null {
  for (const filename of TOOL_CONFIG_FILENAMES.jscpd) {
    const path = join(cwd, filename);
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function jscpdMissingKeys(cwd: string): string[] {
  const config = readJscpdConfig(cwd);
  if (config === null) return JSCPD_RECOMMENDED.map((k) => k.key);
  return JSCPD_RECOMMENDED.filter((k) => !(k.key in config)).map((k) => k.key);
}

function readTextOrEmpty(path: string): string {
  if (!existsSync(path)) return '';
  try {
    return `${readFileSync(path, 'utf8')}\n`;
  } catch {
    return '';
  }
}

function readRuffConfigText(cwd: string): string {
  const sources = [...TOOL_CONFIG_FILENAMES.ruff, 'pyproject.toml'];
  return sources.map((filename) => readTextOrEmpty(join(cwd, filename))).join('');
}

function ruffMissingKeys(cwd: string): string[] {
  const text = readRuffConfigText(cwd);
  return RUFF_RECOMMENDED.filter((k) => !text.includes(k.key)).map((k) => k.key);
}

export const JSCPD_RECOMMENDATION: Recommendation = {
  keys: JSCPD_RECOMMENDED,
  missingKeys: jscpdMissingKeys,
};

export const RUFF_RECOMMENDATION: Recommendation = {
  keys: RUFF_RECOMMENDED,
  missingKeys: ruffMissingKeys,
};

export function describeKey(recommendation: Recommendation, key: string): RecommendedKey {
  const found = recommendation.keys.find((k) => k.key === key);
  if (found === undefined) throw new Error(`unknown recommended key ${key}`);
  return found;
}
