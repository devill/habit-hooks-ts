import { describe, expect, it } from 'vitest';
import { spawnTarget } from './resolve.js';

describe('resolve', () => {
  it('spawnTarget prepends node for .js bins', () => {
    const target = spawnTarget('/x/cli.js', ['--flag', 'value']);
    expect(target.bin).toBe(process.execPath);
    expect(target.args).toEqual(['/x/cli.js', '--flag', 'value']);
  });

  it('spawnTarget invokes the bin directly for non-.js entries', () => {
    const target = spawnTarget('/usr/local/bin/tool', ['--flag']);
    expect(target.bin).toBe('/usr/local/bin/tool');
    expect(target.args).toEqual(['--flag']);
  });
});
