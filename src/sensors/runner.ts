import type { Issue, Sensor, SensorContext } from './types.js';

// Registers active sensors and runs them in dependency order, merging their
// issues (docs/sensors.md). Leaf sensors leave dependsOn unset; a multi sensor
// receives its depended-on smells' issues in ctx.deps. Unsatisfiable
// dependencies or dependency cycles are a startup error.

export interface SensorRunInput {
  files: string[];
  cwd: string;
}

function assertUniqueIds(sensors: Sensor[]): void {
  const seen = new Set<string>();
  for (const sensor of sensors) {
    if (seen.has(sensor.id)) throw new Error(`duplicate sensor id: ${sensor.id}`);
    seen.add(sensor.id);
  }
}

function buildProducers(sensors: Sensor[]): Map<string, Sensor[]> {
  const producers = new Map<string, Sensor[]>();
  for (const sensor of sensors) {
    for (const smell of sensor.produces) {
      const list = producers.get(smell) ?? [];
      list.push(sensor);
      producers.set(smell, list);
    }
  }
  return producers;
}

function dependencyKeys(sensor: Sensor): string[] {
  return sensor.dependsOn ?? [];
}

function assertSatisfiable(sensor: Sensor, producers: Map<string, Sensor[]>): void {
  for (const smell of dependencyKeys(sensor)) {
    const others = (producers.get(smell) ?? []).filter((p) => p.id !== sensor.id);
    if (others.length === 0) {
      throw new Error(`sensor '${sensor.id}' depends on unproduced smell: ${smell}`);
    }
  }
}

function predecessorsOf(sensor: Sensor, producers: Map<string, Sensor[]>): Sensor[] {
  const seen = new Map<string, Sensor>();
  for (const smell of dependencyKeys(sensor)) {
    for (const producer of producers.get(smell) ?? []) {
      if (producer.id !== sensor.id) seen.set(producer.id, producer);
    }
  }
  return [...seen.values()];
}

function isReady(sensor: Sensor, placed: Set<string>, producers: Map<string, Sensor[]>): boolean {
  return predecessorsOf(sensor, producers).every((p) => placed.has(p.id));
}

function orderSensors(sensors: Sensor[], producers: Map<string, Sensor[]>): Sensor[] {
  const order: Sensor[] = [];
  const placed = new Set<string>();
  while (order.length < sensors.length) {
    const next = sensors.find((s) => !placed.has(s.id) && isReady(s, placed, producers));
    if (next === undefined) throw new Error('sensor dependency cycle detected');
    order.push(next);
    placed.add(next.id);
  }
  return order;
}

function gatherDeps(sensor: Sensor, issues: Issue[]): Issue[] {
  const wanted = new Set(dependencyKeys(sensor));
  if (wanted.size === 0) return [];
  return issues.filter((issue) => wanted.has(issue.smell));
}

export class SensorRunner {
  private readonly ordered: Sensor[];

  constructor(sensors: Sensor[]) {
    assertUniqueIds(sensors);
    const producers = buildProducers(sensors);
    for (const sensor of sensors) assertSatisfiable(sensor, producers);
    this.ordered = orderSensors(sensors, producers);
  }

  get sensors(): Sensor[] {
    return [...this.ordered];
  }

  async run(input: SensorRunInput): Promise<Issue[]> {
    const issues: Issue[] = [];
    for (const sensor of this.ordered) {
      const ctx: SensorContext = { files: input.files, cwd: input.cwd, deps: gatherDeps(sensor, issues) };
      issues.push(...(await sensor.run(ctx)));
    }
    return issues;
  }
}
