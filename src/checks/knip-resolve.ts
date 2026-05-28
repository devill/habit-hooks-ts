import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detectTool } from '../detect/tool.js';
import { type BinResolution } from '../wrap/notices.js';

const require = createRequire(import.meta.url);

const KNIP_BASE_ARGS = ['--reporter', 'json', '--no-exit-code'];

function bundledKnipDir(): string {
  const main = require.resolve('knip');
  return join(dirname(main), '..');
}

function bundledKnipBin(): string {
  return join(bundledKnipDir(), 'bin', 'knip.js');
}

export function resolveKnipBin(cwd: string): BinResolution {
  const detected = detectTool(cwd, 'knip');
  if (detected !== null) return { binPath: detected.binPath, isFallback: false };
  return { binPath: bundledKnipBin(), isFallback: true };
}

function readMajorFromPackageJson(path: string): number | null {
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    if (typeof pkg.version !== 'string') return null;
    const major = Number.parseInt(pkg.version.split('.')[0] ?? '', 10);
    return Number.isFinite(major) ? major : null;
  } catch {
    return null;
  }
}

export function consumerKnipMajor(cwd: string): number | null {
  return readMajorFromPackageJson(join(cwd, 'node_modules', 'knip', 'package.json'));
}

function bundledKnipMajor(): number | null {
  return readMajorFromPackageJson(join(bundledKnipDir(), 'package.json'));
}

function effectiveKnipMajor(resolution: BinResolution, cwd: string): number | null {
  if (resolution.isFallback) return bundledKnipMajor();
  return consumerKnipMajor(cwd);
}

export function buildKnipArgs(resolution: BinResolution, cwd: string): string[] {
  const major = effectiveKnipMajor(resolution, cwd);
  if (major !== null && major >= 6) return [...KNIP_BASE_ARGS];
  return [...KNIP_BASE_ARGS, '--include', 'classMembers'];
}
