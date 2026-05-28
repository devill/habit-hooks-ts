import { TOOL_CONFIG_FILENAMES } from '../../detect/tool.js';
import { JSCPD_CONFIG_FILENAME, JSCPD_CONFIG_TEMPLATE } from './templates/jscpd-config.js';
import { scaffoldFile, type ScaffoldResult } from './scaffold-config.js';

export function scaffoldJscpdConfig(cwd: string): ScaffoldResult {
  return scaffoldFile({
    cwd,
    candidates: TOOL_CONFIG_FILENAMES.jscpd,
    defaultName: JSCPD_CONFIG_FILENAME,
    template: JSCPD_CONFIG_TEMPLATE,
  });
}
