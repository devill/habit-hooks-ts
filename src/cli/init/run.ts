import { scaffoldConfig } from './scaffold-config.js';
import { scaffoldBaseline } from './scaffold-baseline.js';
import { runToolSteps } from './tool-steps.js';
import { detectToolStates, toolsForLanguage } from './detect.js';
import { completionReport } from './completion-report.js';
import { dryRunPath, noteScaffold, type Ctx } from './ctx.js';
import { detectionReport } from './report-language.js';
import type { Language } from '../../config/schema.js';
import { addCiScript, addHabitHooksScript } from './package-scripts.js';
import { installPreCommitHook } from './git-hook.js';
import { installSkills } from './skill.js';
import { agentSnippet } from './snippet.js';
import {
  reportHookResult,
  reportScriptResult,
  reportSkillResults,
  type Lines,
} from './reporters.js';
import type { Prompter } from './prompts.js';

interface InitOptions {
  prompter: Prompter;
  dryRun?: boolean;
  language?: Language;
}

interface InitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function writeConfigStep(ctx: Ctx): void {
  if (ctx.dryRun) {
    dryRunPath(ctx, 'habit-hooks.config.js', 'habit-hooks config');
    return;
  }
  noteScaffold(ctx, scaffoldConfig(ctx.cwd, ctx.language), 'habit-hooks config');
}

function writeBaselineStep(ctx: Ctx): void {
  if (ctx.dryRun) {
    dryRunPath(ctx, '.habit-hooks-baseline.json', 'baseline');
    return;
  }
  const result = scaffoldBaseline(ctx.cwd);
  if (result.created) ctx.lines.out.push(`wrote ${result.path}\n`);
  else ctx.lines.out.push(`baseline already present at ${result.path}\n`);
}

async function maybeAddHabitHooksScript(ctx: Ctx, prompter: Prompter): Promise<void> {
  if (ctx.dryRun) return;
  const yes = await prompter.ask("Add 'habit-hooks' to package.json scripts?", { defaultYes: true });
  if (!yes) return;
  reportScriptResult('habit-hooks', addHabitHooksScript(ctx.cwd), ctx.lines);
}

async function maybeAddCiScript(ctx: Ctx, prompter: Prompter): Promise<void> {
  if (ctx.dryRun) return;
  const yes = await prompter.ask("Wire 'npm run ci' as the full quality gate?", { defaultYes: true });
  if (!yes) return;
  reportScriptResult('ci', addCiScript(ctx.cwd), ctx.lines);
}

async function maybeInstallHook(ctx: Ctx, prompter: Prompter): Promise<void> {
  if (ctx.dryRun) return;
  const yes = await prompter.ask('Install a git pre-commit hook?', { defaultYes: false });
  if (!yes) return;
  reportHookResult(installPreCommitHook(ctx.cwd, ctx.language), ctx.lines);
}

async function maybeInstallSkill(ctx: Ctx, prompter: Prompter): Promise<void> {
  if (ctx.dryRun) return;
  const yes = await prompter.ask(
    'Install the bundled habit-hooks skills into ~/.claude/skills/?',
    { defaultYes: false },
  );
  if (!yes) return;
  reportSkillResults(installSkills(), ctx.lines);
}

function printCompletionReport(ctx: Ctx): void {
  const tools = toolsForLanguage(ctx.language);
  const matrix = detectToolStates(ctx.cwd);
  ctx.lines.out.push(completionReport({ cwd: ctx.cwd, language: ctx.language, tools, matrix }));
}

function printSnippet(ctx: Ctx): void {
  ctx.lines.out.push('\n--- paste into CLAUDE.md / AGENTS.md ---\n');
  ctx.lines.out.push(agentSnippet(ctx.language));
  ctx.lines.out.push('--- end snippet ---\n');
}

async function maybeAddNpmScripts(ctx: Ctx, prompter: Prompter): Promise<void> {
  if (ctx.language === 'python') return;
  await maybeAddHabitHooksScript(ctx, prompter);
  await maybeAddCiScript(ctx, prompter);
}

async function runPrompts(ctx: Ctx, prompter: Prompter): Promise<void> {
  await maybeAddNpmScripts(ctx, prompter);
  await maybeInstallHook(ctx, prompter);
  await maybeInstallSkill(ctx, prompter);
}

function toResult(lines: Lines): InitResult {
  return { stdout: lines.out.join(''), stderr: lines.err.join(''), exitCode: lines.exit };
}

function reportOnly(cwd: string): InitResult {
  return { stdout: detectionReport(cwd), stderr: '', exitCode: 0 };
}

async function scaffold(ctx: Ctx, prompter: Prompter): Promise<InitResult> {
  runToolSteps(ctx);
  writeConfigStep(ctx);
  writeBaselineStep(ctx);
  await runPrompts(ctx, prompter);
  printCompletionReport(ctx);
  printSnippet(ctx);
  return toResult(ctx.lines);
}

export async function runInit(cwd: string, opts: InitOptions): Promise<InitResult> {
  if (opts.language === undefined) return reportOnly(cwd);
  const ctx: Ctx = {
    cwd,
    lines: { out: [], err: [], exit: 0 },
    dryRun: opts.dryRun === true,
    language: opts.language,
  };
  return scaffold(ctx, opts.prompter);
}
