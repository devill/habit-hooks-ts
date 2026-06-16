import { Command } from 'commander';
import { runInit } from './init/run.js';
import { makeAutoPrompter, makeInteractivePrompter, type Prompter } from './init/prompts.js';
import { emit } from './emit.js';
import type { Language } from '../config/schema.js';

interface InitFlags {
  yes?: boolean;
  defaults?: boolean;
  dryRun?: boolean;
}

const SUPPORTED_LANGUAGES: Language[] = ['typescript', 'python'];

function isLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as string[]).includes(value);
}

function pickPrompter(flags: InitFlags): Prompter {
  if (flags.yes === true) return makeAutoPrompter(true);
  if (flags.defaults === true) return makeAutoPrompter(false);
  if (flags.dryRun === true) return makeAutoPrompter(false);
  return makeInteractivePrompter();
}

function rejectLanguage(language: string): void {
  emit({
    stdout: '',
    stderr: `habit-hooks: unsupported language '${language}'. Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}\n`,
    exitCode: 2,
  });
}

async function execute(language: Language | undefined, flags: InitFlags): Promise<void> {
  const prompter = pickPrompter(flags);
  try {
    emit(await runInit(process.cwd(), { prompter, dryRun: flags.dryRun === true, language }));
  } finally {
    prompter.close();
  }
}

async function handleInit(language: string | undefined, flags: InitFlags): Promise<void> {
  if (language !== undefined && !isLanguage(language)) {
    rejectLanguage(language);
    return;
  }
  await execute(language, flags);
}

export function registerInitCommand(program: Command): void {
  program
    .command('init [language]')
    .description('detect tools, scaffold missing configs, write a slim habit-hooks config')
    .option('--yes', 'accept every prompt (non-interactive)')
    .option('--defaults', 'take the default answer for every prompt (non-interactive)')
    .option('--dry-run', 'show what would be written without writing')
    .action(handleInit);
}
