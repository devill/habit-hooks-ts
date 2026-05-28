import { TOOL_CONFIG_FILENAMES } from '../../detect/tool.js';
import { KNIP_CONFIG_FILENAME, KNIP_CONFIG_TEMPLATE } from './templates/knip-config.js';
import { scaffoldFile, type ScaffoldResult } from './scaffold-config.js';

export function scaffoldKnipConfig(cwd: string): ScaffoldResult {
  return scaffoldFile({
    cwd,
    candidates: TOOL_CONFIG_FILENAMES.knip,
    defaultName: KNIP_CONFIG_FILENAME,
    template: KNIP_CONFIG_TEMPLATE,
  });
}
