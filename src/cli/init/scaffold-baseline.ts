import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASELINE_FILENAME, BASELINE_VERSION, saveBaseline } from '../../baseline/store.js';

export function scaffoldBaseline(cwd: string): { path: string; created: boolean } {
  const path = join(cwd, BASELINE_FILENAME);
  if (existsSync(path)) return { path, created: false };
  saveBaseline(cwd, { version: BASELINE_VERSION, files: {} });
  return { path, created: true };
}
