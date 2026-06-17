import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

export type ToolName = 'eslint' | 'knip' | 'jscpd' | 'ruff' | 'deptry';

interface ToolDetection {
  available: true;
  binPath: string;
  configPath: string | null;
}

export const TOOL_CONFIG_FILENAMES: Record<ToolName, readonly string[]> = {
  eslint: ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', 'eslint.config.cjs'],
  knip: ['knip.json', 'knip.jsonc', 'knip.ts'],
  jscpd: ['.jscpd.json', 'jscpd.json'],
  ruff: ['ruff.toml', '.ruff.toml'],
  deptry: [],
};

export const TOOL_PACKAGE_JSON_KEYS: Partial<Record<ToolName, string>> = {
  eslint: 'eslintConfig',
  knip: 'knip',
  jscpd: 'jscpd',
};

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// The bin path comes from an attacker-controllable node_modules/<tool>/package.json.
// A value like "../../evil.js" would otherwise escape the package and let
// `habit-hooks` spawn an arbitrary committed file (RCE on clone + run). Reject any
// resolved path that lands outside the tool's own package directory.
function containedBin(packageDir: string, binValue: string): string | null {
  const resolved = join(packageDir, binValue);
  const rel = relative(packageDir, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return resolved;
}

function resolveBinFromPackageJson(packageDir: string, name: string): string | null {
  const pkg = readJson(join(packageDir, 'package.json'));
  if (pkg === null) return null;
  const bin = pkg.bin;
  if (typeof bin === 'string') return containedBin(packageDir, bin);
  if (bin !== null && typeof bin === 'object' && !Array.isArray(bin)) {
    const entry = (bin as Record<string, unknown>)[name];
    if (typeof entry === 'string') return containedBin(packageDir, entry);
  }
  return null;
}

function findBinPath(cwd: string, name: string): string | null {
  const packageDir = join(cwd, 'node_modules', name);
  const fromPkg = resolveBinFromPackageJson(packageDir, name);
  if (fromPkg !== null && existsSync(fromPkg)) return fromPkg;
  const fromBin = join(cwd, 'node_modules', '.bin', name);
  if (existsSync(fromBin)) return fromBin;
  return null;
}

function filenamesFor(name: string): readonly string[] {
  return TOOL_CONFIG_FILENAMES[name as ToolName] ?? [];
}

function packageJsonKeyFor(name: string): string | undefined {
  return TOOL_PACKAGE_JSON_KEYS[name as ToolName];
}

function findConfigFile(cwd: string, name: string): string | null {
  for (const filename of filenamesFor(name)) {
    const candidate = join(cwd, filename);
    if (existsSync(candidate)) return candidate;
  }
  const packageJsonPath = join(cwd, 'package.json');
  const pkg = readJson(packageJsonPath);
  const key = packageJsonKeyFor(name);
  if (pkg !== null && key !== undefined && pkg[key] !== undefined) return packageJsonPath;
  return null;
}

export function detectTool(cwd: string, name: string): ToolDetection | null {
  const binPath = findBinPath(cwd, name);
  if (binPath === null) return null;
  const configPath = findConfigFile(cwd, name);
  return { available: true, binPath, configPath };
}
