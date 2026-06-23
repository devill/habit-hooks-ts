import type { CoachingPrompt } from '../types.js';
import { resolvePackagedDir } from './packaged-dir.js';
import { allSeeds, buildPrompt, type RuleSeed } from './seeds.js';

function addSeedToMap(map: Map<string, CoachingPrompt>, seed: RuleSeed, packagedDir: string): void {
  map.set(seed.id, buildPrompt(seed, packagedDir));
}

function buildRegistry(): Map<string, CoachingPrompt> {
  const packagedDir = resolvePackagedDir();
  const map = new Map<string, CoachingPrompt>();
  for (const seed of allSeeds()) addSeedToMap(map, seed, packagedDir);
  return map;
}

const registry = buildRegistry();

export function lookupPrompt(ruleId: string): CoachingPrompt | null {
  return registry.get(ruleId) ?? null;
}
