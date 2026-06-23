import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ShellResult } from '../wrap/shell.js';
import { TOOL_CONFIG_FILENAMES } from '../detect/tool.js';
import { hasPackageJsonKey } from '../detect/package-json.js';
import { absolutize, emptyOutcome, firstLine, noticesFor, type BinResolution } from '../wrap/notices.js';
import { isSpawnSkip, skipOutcome, spawnWrapped } from '../wrap/run.js';
import { resolveJscpdBin } from './jscpd-resolve.js';
import { JSCPD_SMELL } from '../config/tool-smells.js';
import type { Check, CheckOutcome, Violation } from '../types.js';

const REPORT_FILENAME = 'jscpd-report.json';

interface JscpdLocation {
  name: string;
  startLoc: { line: number; column?: number };
  endLoc: { line: number; column?: number };
}

interface JscpdClone {
  firstFile: JscpdLocation;
  secondFile: JscpdLocation;
}

interface JscpdReport {
  duplicates?: JscpdClone[];
}

function reportMissingWarning(cwd: string, code: number, stderr: string): string {
  const detail = firstLine(stderr);
  const suffix = detail.length > 0 ? `: ${detail}` : '';
  return `habit-hooks: jscpd skipped in ${cwd} (exit ${code}, no report)${suffix}`;
}

function parseFailureWarning(cwd: string): string {
  return `habit-hooks: jscpd skipped in ${cwd} (unparseable report)`;
}

function unresolvedBinWarning(cwd: string): string {
  return `habit-hooks: jscpd skipped in ${cwd} (could not locate bundled bin)`;
}

function locationDescription(loc: JscpdLocation, cwd: string): string {
  return `${absolutize(cwd, loc.name)}:${loc.startLoc.line}-${loc.endLoc.line}`;
}

function buildViolation(self: JscpdLocation, partner: JscpdLocation, cwd: string): Violation {
  return {
    ruleId: JSCPD_SMELL,
    source: 'jscpd:duplication',
    file: absolutize(cwd, self.name),
    line: self.startLoc.line,
    column: self.startLoc.column,
    message: `duplicates ${locationDescription(partner, cwd)}`,
  };
}

function isInScope(loc: JscpdLocation, scope: Set<string>, cwd: string): boolean {
  return scope.has(absolutize(cwd, loc.name));
}

function cloneToViolations(clone: JscpdClone, scope: Set<string>, cwd: string): Violation[] {
  const violations: Violation[] = [];
  if (isInScope(clone.firstFile, scope, cwd)) {
    violations.push(buildViolation(clone.firstFile, clone.secondFile, cwd));
  }
  if (isInScope(clone.secondFile, scope, cwd)) {
    violations.push(buildViolation(clone.secondFile, clone.firstFile, cwd));
  }
  return violations;
}

function reportToViolations(report: JscpdReport, scope: Set<string>, cwd: string): Violation[] {
  return (report.duplicates ?? []).flatMap((c) => cloneToViolations(c, scope, cwd));
}

function tryReadReport(reportDir: string): JscpdReport | null {
  const path = join(reportDir, REPORT_FILENAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JscpdReport;
  } catch {
    return null;
  }
}

function buildArgs(reportDir: string): string[] {
  return ['-r', 'json', '-o', reportDir, '--silent', '--noTips', '-n', '.'];
}

function makeReportDir(): string {
  return mkdtempSync(join(tmpdir(), 'hh-jscpd-'));
}

function removeReportDir(reportDir: string): void {
  rmSync(reportDir, { recursive: true, force: true });
}

interface RunInputs {
  resolution: BinResolution;
  cwd: string;
  scope: Set<string>;
  notices: string[];
}

function missingReportOutcome(inputs: RunInputs, result: ShellResult): CheckOutcome {
  if (result.exitCode !== 0) {
    return emptyOutcome([...inputs.notices, reportMissingWarning(inputs.cwd, result.exitCode, result.stderr)]);
  }
  return emptyOutcome([...inputs.notices, parseFailureWarning(inputs.cwd)]);
}

async function runOnce(inputs: RunInputs, reportDir: string): Promise<CheckOutcome> {
  const { resolution, cwd } = inputs;
  const result = await spawnWrapped({ tool: 'jscpd', resolution, cwd, args: buildArgs(reportDir) });
  if (isSpawnSkip(result)) return skipOutcome(result, inputs.notices);
  const report = tryReadReport(reportDir);
  if (report === null) return missingReportOutcome(inputs, result);
  return { violations: reportToViolations(report, inputs.scope, inputs.cwd), stderr: inputs.notices };
}

async function runJscpd(inputs: RunInputs): Promise<CheckOutcome> {
  const reportDir = makeReportDir();
  try {
    return await runOnce(inputs, reportDir);
  } finally {
    removeReportDir(reportDir);
  }
}

function hasJscpdConfig(cwd: string): boolean {
  if (TOOL_CONFIG_FILENAMES.jscpd.some((name) => existsSync(join(cwd, name)))) return true;
  return hasPackageJsonKey(cwd, 'jscpd');
}

function noConfigOutcome(cwd: string, notices: string[]): CheckOutcome {
  return emptyOutcome([...notices, `habit-hooks: jscpd skipped in ${cwd} (no jscpd config)`]);
}

function noBinOutcome(cwd: string): CheckOutcome {
  return emptyOutcome([unresolvedBinWarning(cwd)]);
}

async function runJscpdWrap(files: string[], cwd: string, resolution: BinResolution | null): Promise<CheckOutcome> {
  if (files.length === 0) return { violations: [], stderr: [] };
  if (resolution === null) return noBinOutcome(cwd);
  const notices = noticesFor('jscpd', resolution, cwd);
  if (!hasJscpdConfig(cwd)) return noConfigOutcome(cwd, notices);
  return runJscpd({ resolution, cwd, scope: new Set(files), notices });
}

export const jscpdWrap: Check = {
  id: 'jscpd',
  async run(files, _rules, cwd) {
    const runCwd = cwd ?? process.cwd();
    return runJscpdWrap(files, runCwd, resolveJscpdBin(runCwd));
  },
};
