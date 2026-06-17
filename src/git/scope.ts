import { resolve } from 'node:path';
import { gitExec } from './exec.js';

export class UnsafeRefError extends Error {
  constructor(ref: string) {
    super(`refusing git revision that looks like an option: ${ref}`);
    this.name = 'UnsafeRefError';
  }
}

// A revision that begins with `-` (from a committed config's branchBase or a
// `--since` value) would be parsed by git as an option, not a commit — e.g.
// `git diff --name-only --output=<file> HEAD` writes an arbitrary file. Reject
// such refs before they reach git.
function safeRef(ref: string): string {
  if (ref.startsWith('-')) throw new UnsafeRefError(ref);
  return ref;
}

function parseLines(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toAbsolute(cwd: string, files: string[]): string[] {
  return files.map((file) => resolve(cwd, file));
}

function extractTargetFromRenameOrCopy(rest: string): string {
  const arrowIndex = rest.indexOf(' -> ');
  return arrowIndex === -1 ? rest : rest.slice(arrowIndex + 4);
}

function parseStatusLine(line: string): string | null {
  if (line.length < 4) return null;
  const status = line.slice(0, 2);
  const rest = line.slice(3);
  if (status === '??') return rest;
  return extractTargetFromRenameOrCopy(rest);
}

export function getUncommittedFiles(cwd: string): string[] {
  const stdout = gitExec(['status', '--porcelain'], cwd);
  const files = stdout
    .split('\n')
    .map(parseStatusLine)
    .filter((entry): entry is string => entry !== null && entry.length > 0);
  return toAbsolute(cwd, files);
}

export function getChangedVsCommit(cwd: string, hash: string): string[] {
  const stdout = gitExec(['diff', '--name-only', safeRef(hash), 'HEAD', '--'], cwd);
  return toAbsolute(cwd, parseLines(stdout));
}

export function getLastNCommitsChanges(cwd: string, n: number): string[] {
  return getChangedVsCommit(cwd, `HEAD~${String(n)}`);
}

export function getMergeBase(cwd: string, base: string): string {
  return gitExec(['merge-base', 'HEAD', safeRef(base)], cwd).trim();
}

export function getChangedVsBranch(cwd: string, base: string): string[] {
  const mergeBase = getMergeBase(cwd, base);
  return getChangedVsCommit(cwd, mergeBase);
}

export function getCurrentBranch(cwd: string): string {
  return gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim();
}

export function unionFiles(...lists: string[][]): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    for (const file of list) seen.add(file);
  }
  return [...seen];
}
