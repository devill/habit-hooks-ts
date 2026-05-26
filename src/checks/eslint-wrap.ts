import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runTool, type ShellResult } from '../wrap/shell.js';
import { detectTool } from '../detect/tool.js';
import { lookupPrompt } from '../prompts/registry.js';
import type { Check, CheckOutcome, Violation } from '../types.js';

const require = createRequire(import.meta.url);

interface BinResolution {
  binPath: string;
  isFallback: boolean;
}

interface EslintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  column?: number;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

function bundledEslintBin(): string {
  const main = require.resolve('eslint');
  return join(dirname(main), '..', 'bin', 'eslint.js');
}

export function resolveEslintBin(cwd: string): BinResolution {
  const detected = detectTool(cwd, 'eslint');
  if (detected !== null) return { binPath: detected.binPath, isFallback: false };
  return { binPath: bundledEslintBin(), isFallback: true };
}

function fallbackNotice(cwd: string): string {
  return `habit-hooks: using bundled eslint (no eslint installation found in ${cwd})`;
}

function configWarning(cwd: string, detail: string): string {
  const suffix = detail.length > 0 ? `: ${detail}` : '';
  return `habit-hooks: eslint skipped in ${cwd} (config error)${suffix}`;
}

function spawnFailureWarning(cwd: string, warnings: string[]): string {
  const detail = warnings.length > 0 ? warnings.join('; ') : 'spawn failure';
  return `habit-hooks: eslint skipped in ${cwd} (${detail})`;
}

function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function tryParseJson(stdout: string): EslintFileResult[] | null {
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as EslintFileResult[];
  } catch {
    return null;
  }
}

function isSpawnFailure(result: ShellResult): boolean {
  return result.exitCode === -1;
}

function isConfigError(result: ShellResult, parsed: EslintFileResult[] | null): boolean {
  if (parsed !== null) return false;
  if (isSpawnFailure(result)) return false;
  return result.exitCode !== 0 && result.exitCode !== 1;
}

function messageToViolation(filePath: string, m: EslintMessage): Violation | null {
  if (m.ruleId === null) return null;
  const ruleId = `eslint:${m.ruleId}`;
  const prompt = lookupPrompt(ruleId);
  const title = prompt?.title ?? m.ruleId;
  return { ruleId, file: filePath, line: m.line, column: m.column, message: `${title}: ${m.message}` };
}

function fileResultToViolations(result: EslintFileResult): Violation[] {
  return result.messages
    .map((m) => messageToViolation(result.filePath, m))
    .filter((v): v is Violation => v !== null);
}

function parseEslintJson(stdout: string): Violation[] {
  const parsed = tryParseJson(stdout);
  if (parsed === null) return [];
  return parsed.flatMap(fileResultToViolations);
}

function buildArgs(files: string[]): string[] {
  return ['--format', 'json', ...files];
}

function emptyOutcome(stderr: string[]): CheckOutcome {
  return { violations: [], stderr };
}

function noticesFor(resolution: BinResolution, cwd: string): string[] {
  return resolution.isFallback ? [fallbackNotice(cwd)] : [];
}

function requiresNodeRuntime(binPath: string): boolean {
  return binPath.endsWith('.js');
}

function spawnTarget(binPath: string, files: string[]): { bin: string; args: string[] } {
  const args = buildArgs(files);
  if (requiresNodeRuntime(binPath)) return { bin: process.execPath, args: [binPath, ...args] };
  return { bin: binPath, args };
}

async function executeEslint(resolution: BinResolution, cwd: string, files: string[]): Promise<ShellResult> {
  const target = spawnTarget(resolution.binPath, files);
  return runTool({ bin: target.bin, args: target.args, cwd });
}

function failureNotices(cwd: string, result: ShellResult): string[] {
  const detail = firstLine(result.stderr.length > 0 ? result.stderr : result.stdout);
  return [configWarning(cwd, detail)];
}

function spawnFailureNotices(cwd: string, result: ShellResult): string[] {
  return [spawnFailureWarning(cwd, result.warnings)];
}

async function runEslint(resolution: BinResolution, cwd: string, files: string[]): Promise<CheckOutcome> {
  const notices = noticesFor(resolution, cwd);
  const result = await executeEslint(resolution, cwd, files);
  const parsed = tryParseJson(result.stdout);
  if (isSpawnFailure(result)) return emptyOutcome([...notices, ...spawnFailureNotices(cwd, result)]);
  if (isConfigError(result, parsed)) return emptyOutcome([...notices, ...failureNotices(cwd, result)]);
  return { violations: parseEslintJson(result.stdout), stderr: notices };
}

export const eslintWrap: Check = {
  id: 'eslint',
  async run(files, _rules, cwd) {
    const runCwd = cwd ?? process.cwd();
    if (files.length === 0) return { violations: [], stderr: [] };
    return runEslint(resolveEslintBin(runCwd), runCwd, files);
  },
};
