import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detectTool } from '../detect/tool.js';
import { type BinResolution } from '../wrap/notices.js';

const require = createRequire(import.meta.url);

function findPackageRoot(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error(`Could not find package.json from ${start}`);
}

function bundledJscpdBin(): string {
  const main = require.resolve('jscpd');
  const pkgRoot = findPackageRoot(dirname(main));
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { bin?: { jscpd?: string } | string };
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.jscpd ?? 'bin/jscpd';
  return join(pkgRoot, binRel);
}

function tryBundledJscpdBin(resolver: () => string): string | null {
  try {
    return resolver();
  } catch {
    return null;
  }
}

export function resolveJscpdBin(cwd: string, fallbackResolver: () => string = bundledJscpdBin): BinResolution | null {
  const detected = detectTool(cwd, 'jscpd');
  if (detected !== null) return { binPath: detected.binPath, isFallback: false };
  const fallback = tryBundledJscpdBin(fallbackResolver);
  if (fallback === null) return null;
  return { binPath: fallback, isFallback: true };
}
