import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScaffoldResult } from './scaffold-config.js';
import type { Lines } from './reporters.js';
import type { Language } from '../../config/schema.js';

export interface Ctx {
  cwd: string;
  lines: Lines;
  dryRun: boolean;
  language: Language;
}

export function noteScaffold(ctx: Ctx, result: ScaffoldResult, label: string): void {
  if (result.created) ctx.lines.out.push(`wrote ${result.path}\n`);
  else ctx.lines.out.push(`${label} already present at ${result.path}\n`);
}

export function dryRunPath(ctx: Ctx, filename: string, label: string): void {
  const path = join(ctx.cwd, filename);
  if (existsSync(path)) ctx.lines.out.push(`${label} already present at ${path}\n`);
  else ctx.lines.out.push(`[dry-run] would write ${path}\n`);
}
