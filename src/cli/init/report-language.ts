import { detectLanguageWithReason } from './scaffold-config.js';
import type { Language } from '../../config/schema.js';

const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: 'TypeScript',
  python: 'Python',
};

export function detectionReport(cwd: string): string {
  const { language, reason } = detectLanguageWithReason(cwd);
  const label = LANGUAGE_LABELS[language];
  return (
    `Detected ${label} (${reason}). Re-run \`habit-hooks init ${language}\` to proceed, ` +
    'or `habit-hooks init <language>` to install for other supported languages.\n'
  );
}
