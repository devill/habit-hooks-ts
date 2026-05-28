import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_FILENAMES = [
  'habit-hooks.config.ts',
  'habit-hooks.config.mjs',
  'habit-hooks.config.js',
  'habit-hooks.config.json',
];

const NEW_CONFIG_FILENAME = 'habit-hooks.config.js';

const CONFIG_TEMPLATE = `export default {
  scope: {
    onlyChangedFiles: true,
    branchBase: 'main',
  },
};
`;

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

export function scaffoldConfig(cwd: string): ScaffoldResult {
  return scaffoldFile({
    cwd,
    candidates: CONFIG_FILENAMES,
    defaultName: NEW_CONFIG_FILENAME,
    template: CONFIG_TEMPLATE,
  });
}
