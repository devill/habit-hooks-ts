import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapIssues, type RoutingLookup, type SmellRouting } from './mapper.js';
import type { Issue } from '../sensors/types.js';

function issue(smell: string, file: string): Issue {
  return { smell, details: { file } };
}

// Fix resolution (the former `resolveFix`) is internal to mapIssues. We exercise
// every branch of it through the public entry point: a routed smell whose action
// carries the resolved fix, so the test sees the same Fix production would build.
function routeAs(smell: string, routing: SmellRouting): RoutingLookup {
  return (s) => (s === smell ? routing : undefined);
}

describe('mapIssues fix resolution', () => {
  let packagedDir: string;
  let overrideDir: string;

  beforeEach(() => {
    packagedDir = mkdtempSync(join(tmpdir(), 'hh-pkg-'));
    overrideDir = mkdtempSync(join(tmpdir(), 'hh-ovr-'));
  });
  afterEach(() => {
    rmSync(packagedDir, { recursive: true, force: true });
    rmSync(overrideDir, { recursive: true, force: true });
  });

  it('resolves <smell>.md from the packaged dir as a prompt', () => {
    writeFileSync(join(packagedDir, 'too-many-parameters.md'), 'PROMPT');
    const result = mapIssues(
      [issue('too-many-parameters', '/a.ts')],
      routeAs('too-many-parameters', { severity: 'enforced' }),
      { packagedDir },
    );
    expect(result.actions[0]?.action).toEqual({ kind: 'prompt', templatePath: join(packagedDir, 'too-many-parameters.md') });
  });

  it('prefers the override dir over the packaged dir', () => {
    writeFileSync(join(packagedDir, 'duplicated-code.md'), 'PKG');
    writeFileSync(join(overrideDir, 'duplicated-code.md'), 'OVERRIDE');
    const result = mapIssues(
      [issue('duplicated-code', '/a.ts')],
      routeAs('duplicated-code', { severity: 'enforced' }),
      { overrideDir, packagedDir },
    );
    expect(result.actions[0]?.action).toEqual({ kind: 'prompt', templatePath: join(overrideDir, 'duplicated-code.md') });
  });

  it('falls back to a <smell> script as a command when no markdown exists', () => {
    writeFileSync(join(packagedDir, 'oversized-file'), '#!/bin/sh\n');
    const result = mapIssues(
      [issue('oversized-file', '/a.ts')],
      routeAs('oversized-file', { severity: 'enforced' }),
      { packagedDir },
    );
    expect(result.actions[0]?.action).toEqual({ kind: 'command', scriptPath: join(packagedDir, 'oversized-file') });
  });

  it('drops a routed smell to uncoached when nothing (incl. uncoached.md) resolves', () => {
    const issues = [issue('unknown-smell', '/x.ts')];
    const result = mapIssues(issues, routeAs('unknown-smell', { severity: 'enforced' }), { packagedDir });
    expect(result.actions).toEqual([]);
    expect(result.uncoached).toEqual(issues);
  });

  it('honours an explicit fix setting pointing at a markdown template', () => {
    mkdirSync(join(overrideDir, 'shared'));
    writeFileSync(join(overrideDir, 'shared', 'style.md'), 'SHARED');
    const result = mapIssues(
      [issue('redundant-type-annotation', '/a.ts')],
      routeAs('redundant-type-annotation', { severity: 'enforced', fix: 'shared/style.md' }),
      { overrideDir, packagedDir },
    );
    expect(result.actions[0]?.action).toEqual({ kind: 'prompt', templatePath: join(overrideDir, 'shared', 'style.md') });
  });

  it('treats a non-markdown fix setting as a command', () => {
    writeFileSync(join(packagedDir, 'fixit.sh'), '#!/bin/sh\n');
    const result = mapIssues(
      [issue('any', '/a.ts')],
      routeAs('any', { severity: 'enforced', fix: 'fixit.sh' }),
      { packagedDir },
    );
    expect(result.actions[0]?.action).toEqual({ kind: 'command', scriptPath: join(packagedDir, 'fixit.sh') });
  });

  it('throws a config error when an explicit fix names a missing file', () => {
    expect(() =>
      mapIssues([issue('any', '/a.ts')], routeAs('any', { severity: 'enforced', fix: 'nope.md' }), { packagedDir }),
    ).toThrow(/fix file not found: nope\.md/);
  });
});

describe('mapIssues', () => {
  let packagedDir: string;

  beforeEach(() => {
    packagedDir = mkdtempSync(join(tmpdir(), 'hh-map-'));
    writeFileSync(join(packagedDir, 'too-many-parameters.md'), 'PROMPT');
  });
  afterEach(() => {
    rmSync(packagedDir, { recursive: true, force: true });
  });

  const routing: RoutingLookup = (smell) =>
    smell === 'too-many-parameters' ? { severity: 'enforced' } : undefined;

  it('groups issues by smell and builds one action per coached smell', () => {
    const issues = [issue('too-many-parameters', '/a.ts'), issue('too-many-parameters', '/b.ts')];
    const result = mapIssues(issues, routing, { packagedDir });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.smell).toBe('too-many-parameters');
    expect(result.actions[0]?.severity).toBe('enforced');
    expect(result.actions[0]?.issues.map((i) => i.details.file)).toEqual(['/a.ts', '/b.ts']);
    expect(result.actions[0]?.action).toEqual({ kind: 'prompt', templatePath: join(packagedDir, 'too-many-parameters.md') });
    expect(result.uncoached).toEqual([]);
  });

  it('routes a smell with no routing into the uncoached bucket', () => {
    const issues = [issue('mystery-smell', '/x.ts')];
    const result = mapIssues(issues, routing, { packagedDir });
    expect(result.actions).toEqual([]);
    expect(result.uncoached).toEqual(issues);
  });

  it('falls back to uncoached.md for a routed enforced smell with no dedicated template', () => {
    writeFileSync(join(packagedDir, 'uncoached.md'), 'GENERIC GUIDANCE');
    const routed: RoutingLookup = (smell) => (smell === 'loose-equality' ? { severity: 'enforced' } : undefined);
    const result = mapIssues([issue('loose-equality', '/a.ts')], routed, { packagedDir });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.severity).toBe('enforced');
    expect(result.actions[0]?.action).toEqual({ kind: 'prompt', templatePath: join(packagedDir, 'uncoached.md') });
    expect(result.uncoached).toEqual([]);
  });
});
