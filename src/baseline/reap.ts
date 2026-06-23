import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselineEntry, BaselineFile } from './store.js';

interface ReapResult {
  files: Record<string, BaselineEntry>;
  pruned: string[];
}

function shouldKeep(cwd: string, relPath: string, violating: Set<string>): boolean {
  if (!existsSync(join(cwd, relPath))) return false;
  return violating.has(relPath);
}

// The one reaper shared by manual `baseline prune` and full-repo auto-prune:
// drop an entry whose file is gone, or present but no longer in the violating
// set (the smell was fixed). `violating` must come from a baseline-free scan.
export function reapBaseline(cwd: string, baseline: BaselineFile, violating: Set<string>): ReapResult {
  const files: Record<string, BaselineEntry> = {};
  const pruned: string[] = [];
  for (const [rel, entry] of Object.entries(baseline.files)) {
    if (shouldKeep(cwd, rel, violating)) files[rel] = entry;
    else pruned.push(rel);
  }
  return { files, pruned };
}
