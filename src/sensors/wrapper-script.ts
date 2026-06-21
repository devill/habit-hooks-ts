import { runTool } from '../wrap/shell.js';
import { isSpawnFailure, recordSpawnFailure, spawnFailureWarning, type SensorSink } from '../wrap/notices.js';
import { buildArgv, parseJson } from './adapter.js';
import type { Issue, Sensor, SensorContext } from './types.js';

// The universal "wrapper script" path (docs/sensors.md): a command that prints
// bag JSON `{ "issues": [ { "smell", "details" } ] }` to stdout. Any tool can be
// adapted by a shim that emits this shape, so this is the fallback for tools the
// declarative adapter cannot read. Parsing is lenient — bad JSON yields [].

// A spec object (mirroring declarativeSensor) keeps the factory under the
// max-params cap and gives each field a name at the call site.
interface WrapperSpec {
  id: string;
  produces: string[];
  command: string;
  dependsOn?: string[];
}

function isIssue(value: unknown): value is Issue {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.smell === 'string' &&
    typeof entry.details === 'object' &&
    entry.details !== null &&
    !Array.isArray(entry.details)
  );
}

function readBag(parsed: unknown): Issue[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const issues = (parsed as Record<string, unknown>).issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter(isIssue).map((issue) => ({ smell: issue.smell, details: issue.details }));
}

async function runWrapper(spec: WrapperSpec, ctx: SensorContext, sink: SensorSink): Promise<Issue[]> {
  if (ctx.files.length === 0) return [];
  const { bin, args } = buildArgv(spec.command, ctx.files);
  const result = await runTool({ bin, args, cwd: ctx.cwd });
  if (isSpawnFailure(result)) {
    recordSpawnFailure(sink, spawnFailureWarning(spec.id, ctx.cwd, result.warnings));
    return [];
  }
  return readBag(parseJson(result.stdout));
}

export function wrapperScriptSensor(spec: WrapperSpec, sink: SensorSink): Sensor {
  const sensor: Sensor = { id: spec.id, produces: spec.produces, run: (ctx) => runWrapper(spec, ctx, sink) };
  if (spec.dependsOn !== undefined) sensor.dependsOn = spec.dependsOn;
  return sensor;
}
