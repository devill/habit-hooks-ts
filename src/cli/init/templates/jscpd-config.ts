import type { Language } from '../../../config/schema.js';
import { JSCPD_RECOMMENDED } from '../recommendations.js';

export const JSCPD_CONFIG_FILENAME = '.jscpd.json';

const IGNORE_BY_LANGUAGE: Record<Language, string[]> = {
  typescript: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
  python: ['**/.venv/**', '**/venv/**', '**/__pycache__/**', '**/*_test.py', '**/test_*.py'],
};

function recommendedSettings(): Record<string, number> {
  const settings: Record<string, number> = {};
  for (const { key, value } of JSCPD_RECOMMENDED) settings[key] = value;
  return settings;
}

export function jscpdConfigTemplate(language: Language): string {
  const config = { ...recommendedSettings(), ignore: IGNORE_BY_LANGUAGE[language] };
  return `${JSON.stringify(config, null, 2)}\n`;
}
