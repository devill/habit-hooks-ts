import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { installCommandsFor } from './install-commands.js';
import {
  JSCPD_RECOMMENDATION,
  RUFF_RECOMMENDATION,
  describeKey,
  type Recommendation,
} from './recommendations.js';
import type { ToolName, ToolState } from './detect.js';
import type { Language } from '../../config/schema.js';

interface ReportInput {
  cwd: string;
  language: Language;
  tools: ToolName[];
  matrix: Record<ToolName, ToolState>;
}

interface ReportItem {
  heading: string;
  details: string[];
}

const COMPLETE_LINE = '✅ Setup complete.\n';
const INCOMPLETE_HEADER = '⚠️  Setup incomplete — to finish:\n';

function missingToolItems(input: ReportInput): ReportItem[] {
  const missing = input.tools.filter((t) => !input.matrix[t].installed);
  if (missing.length === 0) return [];
  const commands = installCommandsFor(input.cwd, missing);
  return [{ heading: `Install ${missing.join(', ')}:`, details: commands }];
}

function deptryConfigItems(input: ReportInput): ReportItem[] {
  if (!input.tools.includes('deptry')) return [];
  if (existsSync(join(input.cwd, 'pyproject.toml'))) return [];
  return [
    { heading: 'Create a pyproject.toml that declares your dependencies (deptry reads it).', details: [] },
  ];
}

function ruffEditDetail(recommendation: Recommendation, key: string): string {
  const detail = describeKey(recommendation, key);
  return `set \`${key} = ${detail.value}\` (${detail.description}) in ruff.toml or pyproject.toml [tool.ruff.lint.*]`;
}

function ruffRecommendationItems(input: ReportInput): ReportItem[] {
  if (!input.tools.includes('ruff')) return [];
  const missing = RUFF_RECOMMENDATION.missingKeys(input.cwd);
  if (missing.length === 0) return [];
  const details = missing.map((k) => ruffEditDetail(RUFF_RECOMMENDATION, k));
  return [{ heading: 'ruff is missing recommended thresholds:', details }];
}

function jscpdEditDetail(key: string): string {
  const detail = describeKey(JSCPD_RECOMMENDATION, key);
  return `add \`"${key}": ${detail.value}\` (${detail.description}) to .jscpd.json`;
}

function jscpdRecommendationItems(input: ReportInput): ReportItem[] {
  if (!input.tools.includes('jscpd')) return [];
  const missing = JSCPD_RECOMMENDATION.missingKeys(input.cwd);
  if (missing.length === 0) return [];
  return [{ heading: '.jscpd.json is missing recommended keys:', details: missing.map(jscpdEditDetail) }];
}

function hardGapItems(input: ReportInput): ReportItem[] {
  return [
    ...missingToolItems(input),
    ...deptryConfigItems(input),
    ...ruffRecommendationItems(input),
    ...jscpdRecommendationItems(input),
  ];
}

// eslint is advisory-only: its flat `.js` config can't be cheaply parsed, so we
// can't verify its thresholds — surfacing it as a hard gap would make every
// configured project read "incomplete". We note it without flipping the status.
function eslintAdvisoryLine(input: ReportInput): string | null {
  if (!input.tools.includes('eslint') || !input.matrix.eslint.configured) return null;
  return 'Note: eslint config may be missing the bundled thresholds — review it against the habit-hooks defaults.';
}

function renderItem(item: ReportItem): string {
  const heading = `  - ${item.heading}`;
  const details = item.details.map((d) => `      ${d}`);
  return [heading, ...details].join('\n');
}

function withAdvisory(body: string, advisory: string | null): string {
  if (advisory === null) return body;
  return `${body}${advisory}\n`;
}

export function completionReport(input: ReportInput): string {
  const items = hardGapItems(input);
  const advisory = eslintAdvisoryLine(input);
  if (items.length === 0) return withAdvisory(`\n${COMPLETE_LINE}`, advisory);
  const gaps = `\n${INCOMPLETE_HEADER}${items.map(renderItem).join('\n')}\n`;
  return withAdvisory(gaps, advisory);
}
