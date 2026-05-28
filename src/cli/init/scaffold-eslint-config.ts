import { TOOL_CONFIG_FILENAMES } from '../../detect/tool.js';
import { ESLINT_CONFIG_FILENAME, ESLINT_CONFIG_TEMPLATE } from './templates/eslint-config.js';
import { scaffoldFile, type ScaffoldResult } from './scaffold-config.js';

export function scaffoldEslintConfig(cwd: string): ScaffoldResult {
  return scaffoldFile({
    cwd,
    candidates: TOOL_CONFIG_FILENAMES.eslint,
    defaultName: ESLINT_CONFIG_FILENAME,
    template: ESLINT_CONFIG_TEMPLATE,
  });
}
