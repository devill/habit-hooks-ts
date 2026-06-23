import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Language } from '../../config/schema.js';
import { defaultSensorsFor } from '../../sensors/registry.js';

const CONFIG_FILENAMES = [
  'habit-hooks.config.ts',
  'habit-hooks.config.mjs',
  'habit-hooks.config.js',
  'habit-hooks.config.json',
];

const NEW_CONFIG_FILENAME = 'habit-hooks.config.js';

interface DetectedLanguage {
  language: Language;
  reason: string;
}

// init selects the language so only that language's sensors run. A Python
// project is recognised by its manifest; everything else defaults to TypeScript.
export function detectLanguageWithReason(cwd: string): DetectedLanguage {
  if (existsSync(join(cwd, 'pyproject.toml'))) {
    return { language: 'python', reason: 'found pyproject.toml' };
  }
  if (existsSync(join(cwd, 'setup.py'))) {
    return { language: 'python', reason: 'found setup.py' };
  }
  return { language: 'typescript', reason: 'no Python manifest found' };
}

function detectLanguage(cwd: string): Language {
  return detectLanguageWithReason(cwd).language;
}

function configTemplate(language: Language): string {
  const config = {
    language,
    scope: { onlyChangedFiles: true, branchBase: 'main' },
    sensors: defaultSensorsFor(language),
  };
  return `export default ${JSON.stringify(config, null, 2)};\n`;
}

export interface ScaffoldResult {
  path: string;
  created: boolean;
}

function findExisting(cwd: string, candidates: readonly string[]): string | null {
  for (const name of candidates) {
    const candidate = join(cwd, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface ScaffoldFileArgs {
  cwd: string;
  candidates: readonly string[];
  defaultName: string;
  template: string;
}

export function scaffoldFile(args: ScaffoldFileArgs): ScaffoldResult {
  const { cwd, candidates, defaultName, template } = args;
  const existing = findExisting(cwd, candidates);
  if (existing !== null) return { path: existing, created: false };
  const path = join(cwd, defaultName);
  writeFileSync(path, template);
  return { path, created: true };
}

export function scaffoldConfig(cwd: string, language?: Language): ScaffoldResult {
  return scaffoldFile({
    cwd,
    candidates: CONFIG_FILENAMES,
    defaultName: NEW_CONFIG_FILENAME,
    template: configTemplate(language ?? detectLanguage(cwd)),
  });
}
