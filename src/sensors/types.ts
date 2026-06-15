// The sensor stage of the sensor -> mapper -> guide pipeline (docs/sensors.md).
// A sensor finds smells and appends Issues to the bag, translating its tool's
// raw output into canonical kebab-case smell keys.

export interface Issue {
  smell: string; // canonical key (kebab-case) — the routing key
  details: Record<string, unknown>; // everything relevant to this smell
}

export interface SensorContext {
  files: string[];
  cwd: string;
  deps: Issue[]; // issues for the smells listed in dependsOn (empty for leaf sensors)
}

export interface Sensor {
  id: string;
  produces: string[]; // smell keys this sensor can emit
  dependsOn?: string[]; // smell keys it consumes (multi sensors only)
  run(_ctx: SensorContext): Promise<Issue[]>;
}
