import { relative } from 'node:path';
import picomatch from 'picomatch';
import type { Rule } from './types.js';

function buildMatcher(patterns: string[] | undefined): ((_path: string) => boolean) | null {
  if (!patterns || patterns.length === 0) return null;
  return picomatch(patterns);
}

export function filterFilesForRule(rule: Rule, files: string[], cwd: string): string[] {
  const includeMatcher = buildMatcher(rule.include);
  const excludeMatcher = buildMatcher(rule.exclude);
  if (!includeMatcher && !excludeMatcher) return files;
  return files.filter((file) => {
    const rel = relative(cwd, file);
    if (includeMatcher && !includeMatcher(rel)) return false;
    if (excludeMatcher && excludeMatcher(rel)) return false;
    return true;
  });
}
