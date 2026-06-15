import { describe, expect, it } from 'vitest';
import { SensorRunner } from './runner.js';
import type { Issue, Sensor, SensorContext } from './types.js';

interface RunRecord {
  id: string;
  ctx: SensorContext;
}

interface SensorSpec {
  id: string;
  produces: string[];
  dependsOn?: string[];
  emit?: Issue[];
  log?: RunRecord[];
}

function issue(smell: string, file: string): Issue {
  return { smell, details: { file } };
}

// A configurable fake. A leaf emits its `emit` list; a sensor with `dependsOn`
// derives one issue per received dep so we can assert what flowed into ctx.deps.
function fakeSensor(spec: SensorSpec): Sensor {
  const derived = spec.dependsOn !== undefined;
  return {
    id: spec.id,
    produces: spec.produces,
    dependsOn: spec.dependsOn,
    async run(ctx) {
      spec.log?.push({ id: spec.id, ctx });
      if (!derived) return spec.emit ?? [];
      return ctx.deps.map((d) => ({ smell: spec.produces[0] ?? spec.id, details: { from: d.smell } }));
    },
  };
}

describe('SensorRunner', () => {
  const base = { files: ['/a.ts', '/b.ts'], cwd: '/repo' };

  it('registers leaf sensors and merges their issues in registration order', async () => {
    const a = fakeSensor({ id: 'a', produces: ['x'], emit: [issue('x', '/a.ts')] });
    const b = fakeSensor({ id: 'b', produces: ['y'], emit: [issue('y', '/b.ts'), issue('y', '/a.ts')] });
    const runner = new SensorRunner([a, b]);

    const issues = await runner.run(base);

    expect(issues.map((i) => i.smell)).toEqual(['x', 'y', 'y']);
  });

  it('passes files and cwd through to each sensor with empty deps for leaves', async () => {
    const log: RunRecord[] = [];
    const a = fakeSensor({ id: 'a', produces: ['x'], emit: [], log });
    const runner = new SensorRunner([a]);

    await runner.run(base);

    expect(log[0]?.ctx.files).toEqual(['/a.ts', '/b.ts']);
    expect(log[0]?.ctx.cwd).toBe('/repo');
    expect(log[0]?.ctx.deps).toEqual([]);
  });

  it('runs a multi sensor after its producers and feeds it their issues via deps', async () => {
    const log: RunRecord[] = [];
    const producer = fakeSensor({ id: 'p', produces: ['oversized-file'], emit: [issue('oversized-file', '/a.ts')], log });
    const multi = fakeSensor({ id: 'm', dependsOn: ['oversized-file'], produces: ['needs-extraction'], log });
    const runner = new SensorRunner([multi, producer]); // registration order is multi-first

    const issues = await runner.run(base);

    expect(log.map((r) => r.id)).toEqual(['p', 'm']); // producer ran first despite order
    const multiCtx = log.find((r) => r.id === 'm')?.ctx;
    expect(multiCtx?.deps.map((d) => d.smell)).toEqual(['oversized-file']);
    expect(issues.map((i) => i.smell)).toEqual(['oversized-file', 'needs-extraction']);
  });

  it('gives a multi sensor only the deps it asked for', async () => {
    const log: RunRecord[] = [];
    const p1 = fakeSensor({ id: 'p1', produces: ['oversized-file'], emit: [issue('oversized-file', '/a.ts')], log });
    const p2 = fakeSensor({ id: 'p2', produces: ['duplicated-code'], emit: [issue('duplicated-code', '/a.ts')], log });
    const multi = fakeSensor({ id: 'm', dependsOn: ['oversized-file'], produces: ['needs-extraction'], log });
    const runner = new SensorRunner([p1, p2, multi]);

    await runner.run(base);

    const multiCtx = log.find((r) => r.id === 'm')?.ctx;
    expect(multiCtx?.deps.map((d) => d.smell)).toEqual(['oversized-file']);
  });

  it('throws when a dependsOn smell has no producer', () => {
    const multi = fakeSensor({ id: 'm', dependsOn: ['oversized-file'], produces: ['needs-extraction'] });
    expect(() => new SensorRunner([multi])).toThrow(/unproduced smell: oversized-file/);
  });

  it('throws on a dependency cycle', () => {
    const a = fakeSensor({ id: 'a', dependsOn: ['y'], produces: ['x'] });
    const b = fakeSensor({ id: 'b', dependsOn: ['x'], produces: ['y'] });
    expect(() => new SensorRunner([a, b])).toThrow(/cycle/);
  });

  it('throws on duplicate sensor ids', () => {
    const a = fakeSensor({ id: 'dup', produces: ['x'] });
    const b = fakeSensor({ id: 'dup', produces: ['y'] });
    expect(() => new SensorRunner([a, b])).toThrow(/duplicate sensor id: dup/);
  });

  it('exposes the resolved run order via sensors', () => {
    const producer = fakeSensor({ id: 'p', produces: ['oversized-file'] });
    const multi = fakeSensor({ id: 'm', dependsOn: ['oversized-file'], produces: ['needs-extraction'] });
    const runner = new SensorRunner([multi, producer]);
    expect(runner.sensors.map((s) => s.id)).toEqual(['p', 'm']);
  });
});
