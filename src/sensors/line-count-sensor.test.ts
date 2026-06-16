import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lineCountSensor } from './line-count-sensor.js';

describe('lineCountSensor', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hh-linecount-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeLines(name: string, lines: number): string {
    const path = join(dir, name);
    writeFileSync(path, `${Array.from({ length: lines }, (_, i) => `a${String(i)} = ${String(i)}`).join('\n')}\n`);
    return path;
  }

  it('emits oversized-file only for files over the threshold', async () => {
    const big = writeLines('big.py', 10);
    const small = writeLines('small.py', 3);

    const issues = await lineCountSensor(5).run({ files: [big, small], cwd: dir, deps: [] });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.smell).toBe('oversized-file');
    expect(issues[0]?.details.file).toBe(big);
    expect(issues[0]?.details.message).toContain('10 lines');
  });

  it('counts physical lines and ignores a trailing newline (boundary is strictly over)', async () => {
    const file = writeLines('exact.py', 5);

    expect(await lineCountSensor(5).run({ files: [file], cwd: dir, deps: [] })).toEqual([]);
    expect(await lineCountSensor(4).run({ files: [file], cwd: dir, deps: [] })).toHaveLength(1);
  });
});
