import { join } from 'node:path';
import type { CoachingPrompt, Severity } from '../types.js';
import { defaultRules } from '../config/defaults.js';

export interface RuleSeed {
  id: string;
  title: string;
  description: string;
  severity?: Severity;
}

// Supplemental seeds: coached issue kinds that have no entry in the smell
// catalogue (defaultRules) but still need a tuned prompt.
const supplementalSeeds: RuleSeed[] = [
  {
    id: 'parse-error',
    title: 'ESLint fatal parse/config error',
    description: 'ESLint could not analyze the file — a parse error, unresolvable config, or a plugin threw.',
    severity: 'enforced',
  },
  {
    id: 'unused-export',
    title: 'Unused export',
    description: 'An export no production code references — either dead code, or an internal exposed only for tests.',
    severity: 'suggested',
  },
];

function slugify(ruleId: string): string {
  return ruleId.replace(/[:/]/g, '-').replace(/@/g, '');
}

export function buildPrompt(seed: RuleSeed, packagedDir: string): CoachingPrompt {
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    severity: seed.severity ?? 'suggested',
    guidancePath: join(packagedDir, `${slugify(seed.id)}.md`),
  };
}

// The complete catalogue of prompt seeds the registry is built from: the
// canonical smell catalogue plus the supplemental seeds, deduped by id with
// last-wins semantics — mirroring how buildRegistry inserts them into a Map
// (defaultRules first, then supplementalSeeds, so a supplemental seed sharing
// an id overrides the catalogue entry).
export function allSeeds(): RuleSeed[] {
  const byId = new Map<string, RuleSeed>();
  for (const seed of [...defaultRules, ...supplementalSeeds]) byId.set(seed.id, seed);
  return [...byId.values()];
}
