import { readFileSync } from 'node:fs';
import type { Issue, Sensor } from './types.js';

// Default file-length ceiling, matching the TS `max-lines` (200).
export const DEFAULT_MAX_FILE_LINES = 200;

function lineCount(content: string): number {
  if (content.length === 0) return 0;
  const body = content.endsWith('\n') ? content.slice(0, -1) : content;
  return body.split('\n').length;
}

function readLineCount(file: string): number | null {
  try {
    return lineCount(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function oversizedIssue(file: string, count: number, maxLines: number): Issue {
  return {
    smell: 'oversized-file',
    details: {
      file,
      line: maxLines + 1,
      column: 1,
      message: `File has ${String(count)} lines; the maximum is ${String(maxLines)}.`,
      source: 'line-count:max-module-lines',
    },
  };
}

function oversizedIssues(files: string[], maxLines: number): Issue[] {
  const issues: Issue[] = [];
  for (const file of files) {
    const count = readLineCount(file);
    if (count !== null && count > maxLines) issues.push(oversizedIssue(file, count, maxLines));
  }
  return issues;
}

// A language-agnostic leaf sensor that emits `oversized-file` for any discovered
// file whose physical line count exceeds the threshold. `oversized-file` is a
// pure line count and needs no AST, so this covers languages (Python) that have
// no tool rule for it.
export function lineCountSensor(maxLines: number): Sensor {
  return {
    id: 'line-count',
    produces: ['oversized-file'],
    run: (ctx) => Promise.resolve(oversizedIssues(ctx.files, maxLines)),
  };
}
