import { describe, expect, it } from 'vitest';
import {
  absolutize,
  emptyOutcome,
  firstLine,
  isSpawnFailure,
  noticesFor,
  spawnFailureWarning,
} from './notices.js';

describe('notices', () => {
  it('spawnFailureWarning joins multiple warnings', () => {
    expect(spawnFailureWarning('knip', '/x', ['EACCES', 'spawn failed'])).toBe(
      'habit-hooks: knip skipped in /x (EACCES; spawn failed)',
    );
  });

  it('spawnFailureWarning falls back to a generic message when warnings empty', () => {
    expect(spawnFailureWarning('jscpd', '/x', [])).toBe('habit-hooks: jscpd skipped in /x (spawn failure)');
  });

  it('firstLine returns the first non-empty trimmed line', () => {
    expect(firstLine('\n\n  hello world  \nnext\n')).toBe('hello world');
  });

  it('firstLine returns empty for blank input', () => {
    expect(firstLine('\n   \n')).toBe('');
  });

  it('isSpawnFailure recognises the -1 exit code', () => {
    expect(isSpawnFailure({ stdout: '', stderr: '', exitCode: -1, warnings: [] })).toBe(true);
    expect(isSpawnFailure({ stdout: '', stderr: '', exitCode: 0, warnings: [] })).toBe(false);
  });

  it('emptyOutcome wraps stderr in a CheckOutcome with zero violations', () => {
    expect(emptyOutcome(['a', 'b'])).toEqual({ violations: [], stderr: ['a', 'b'] });
  });

  it('noticesFor emits the fallback notice only when isFallback is true', () => {
    expect(noticesFor('eslint', { binPath: '/x', isFallback: true }, '/cwd')).toEqual([
      'habit-hooks: using bundled eslint (no eslint installation found in /cwd)',
    ]);
    expect(noticesFor('eslint', { binPath: '/x', isFallback: false }, '/cwd')).toEqual([]);
  });

  it('absolutize keeps absolute paths and joins relative ones', () => {
    expect(absolutize('/cwd', '/abs/path')).toBe('/abs/path');
    expect(absolutize('/cwd', 'rel/path')).toBe('/cwd/rel/path');
  });
});
