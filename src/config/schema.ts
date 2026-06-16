import type { RuleSource, Severity } from '../types.js';

export interface RuleOverride {
  severity?: Severity;
  changedFilesOnly?: boolean;
  title?: string;
  description?: string;
  disabled?: boolean;
  include?: string[];
  exclude?: string[];
  fix?: string;
}

export interface RuleDefinition extends RuleOverride {
  id: string;
  source: RuleSource;
  sourceRuleId?: string;
}

export interface ScopeConfig {
  onlyChangedFiles?: boolean;
  autoBranchOffMain?: boolean;
  branchBase?: string;
  mainBranch?: string;
  exclude?: string[];
}

export interface CommentCheckConfig {
  maxSingleLineChars?: number;
  maxBlockChars?: number;
}

// When `replace` is true, a `needs-extraction` finding suppresses its two input
// smells (oversized-file, duplicated-code) for that file. Default (augment)
// shows all three.
export interface NeedsExtractionConfig {
  replace?: boolean;
}

export type Language = 'typescript' | 'python';

export interface HabitHooksConfig {
  prompts?: string;
  // `init` selects the language; only that language's sensors run. Default: typescript.
  language?: Language;
  // `smells` is the canonical smell-keyed mapping (docs/mapper.md); `rules` is a
  // transitional alias accepted for back-compat. Both merge, smells last.
  smells?: Record<string, RuleOverride | RuleDefinition>;
  rules?: Record<string, RuleOverride | RuleDefinition>;
  scope?: ScopeConfig;
  commentCheck?: CommentCheckConfig;
  needsExtraction?: NeedsExtractionConfig;
}

export function isRuleDefinition(
  entry: RuleOverride | RuleDefinition,
): entry is RuleDefinition {
  return 'source' in entry && typeof (entry as RuleDefinition).source === 'string';
}
