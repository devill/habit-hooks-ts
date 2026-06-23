import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Severity } from '../types.js';
import type { Issue } from '../sensors/types.js';

// The mapper routes a smell to guidance: a pure smell -> GuideAction function
// (docs/mapper.md). Everything tool/language-specific was already resolved by
// the sensor layer into a smell key.

export type Fix =
  | { kind: 'prompt'; templatePath: string }
  | { kind: 'command'; scriptPath: string };

export interface GuideAction {
  smell: string;
  severity: Severity;
  title: string;
  description: string;
  issues: Issue[];
  action: Fix;
}

export interface MapResult {
  actions: GuideAction[];
  uncoached: Issue[];
}

// Per-smell routing resolved from the merged `smells` config (and catalogue).
export interface SmellRouting {
  severity: Severity;
  fix?: string;
  title?: string;
  description?: string;
}

export interface MapperDirs {
  overrideDir?: string;
  packagedDir: string;
}

function existsIn(dir: string, name: string): string | null {
  const path = join(dir, name);
  return existsSync(path) ? path : null;
}

// Look up a file first in the consumer's override dir, then the packaged dir.
function findInDirs(name: string, dirs: MapperDirs): string | null {
  if (dirs.overrideDir !== undefined) {
    const override = existsIn(dirs.overrideDir, name);
    if (override !== null) return override;
  }
  return existsIn(dirs.packagedDir, name);
}

function fixFromPath(path: string): Fix {
  return path.endsWith('.md') ? { kind: 'prompt', templatePath: path } : { kind: 'command', scriptPath: path };
}

// A `fix` setting that names a missing file is a configuration error.
function resolveConfiguredFix(fix: string, dirs: MapperDirs): Fix {
  const path = isAbsolute(fix) ? (existsSync(fix) ? fix : null) : findInDirs(fix, dirs);
  if (path === null) throw new Error(`habit-hooks: fix file not found: ${fix}`);
  return fixFromPath(path);
}

// Default chain: `<smell>.md` template wins over a `<smell>` script.
function resolveDefaultFix(smell: string, dirs: MapperDirs): Fix | null {
  const template = findInDirs(`${smell}.md`, dirs);
  if (template !== null) return { kind: 'prompt', templatePath: template };
  const script = findInDirs(smell, dirs);
  return script !== null ? { kind: 'command', scriptPath: script } : null;
}

// 1. the `fix` setting; 2. `<smell>.md`; 3. the `<smell>` script; else uncoached.
function resolveFix(smell: string, fix: string | undefined, dirs: MapperDirs): Fix | null {
  if (fix !== undefined) return resolveConfiguredFix(fix, dirs);
  return resolveDefaultFix(smell, dirs);
}

function groupBySmell(issues: Issue[]): Map<string, Issue[]> {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.smell) ?? [];
    list.push(issue);
    groups.set(issue.smell, list);
  }
  return groups;
}

export type RoutingLookup = (_smell: string) => SmellRouting | undefined;

interface MapContext {
  routingFor: RoutingLookup;
  dirs: MapperDirs;
}

// A routed smell (known severity from config or catalogue) always becomes an
// action: its dedicated template if present, otherwise the generic uncoached.md
// body — so an enforced smell with no tuned prompt still renders and still
// escalates the exit code. Only a smell with no routing at all is truly uncoached.
function resolveActionFix(smell: string, routing: SmellRouting, dirs: MapperDirs): Fix | null {
  return resolveFix(smell, routing.fix, dirs) ?? resolveFix('uncoached', undefined, dirs);
}

function resolveAction(smell: string, group: Issue[], ctx: MapContext): GuideAction | null {
  const routing = ctx.routingFor(smell);
  if (routing === undefined) return null;
  const fix = resolveActionFix(smell, routing, ctx.dirs);
  if (fix === null) return null;
  const { severity, title = smell, description = '' } = routing;
  return { smell, severity, title, description, issues: group, action: fix };
}

// Group the bag by smell and resolve each group to one action carrying its
// issues; a smell with no resolvable fix falls through to the uncoached bucket.
export function mapIssues(issues: Issue[], routingFor: RoutingLookup, dirs: MapperDirs): MapResult {
  const actions: GuideAction[] = [];
  const uncoached: Issue[] = [];
  for (const [smell, group] of groupBySmell(issues)) {
    const action = resolveAction(smell, group, { routingFor, dirs });
    if (action === null) uncoached.push(...group);
    else actions.push(action);
  }
  return { actions, uncoached };
}
