import { describe, expect, it } from 'vitest';
import type { Rule } from '../types.js';
import { mergeRules } from './merge.js';

const base: Rule[] = [
  {
    id: 'eslint:max-params',
    source: 'eslint',
    sourceRuleId: 'max-params',
    severity: 'enforced',
    changedFilesOnly: false,
    title: 'Too many parameters',
    description: 'desc',
    sourceOptions: [3],
  },
  {
    id: 'eslint:complexity',
    source: 'eslint',
    sourceRuleId: 'complexity',
    severity: 'suggested',
    changedFilesOnly: false,
    title: 'Complex',
    description: 'desc',
    sourceOptions: [10],
  },
];

describe('mergeRules', () => {
  it('returns defaults when overrides are empty', () => {
    const result = mergeRules(base, undefined);
    expect(result).toEqual(base);
  });

  it('overrides severity', () => {
    const result = mergeRules(base, {
      'eslint:max-params': { severity: 'suggested' },
    });
    const target = result.find((r) => r.id === 'eslint:max-params');
    expect(target?.severity).toBe('suggested');
  });

  it('overrides sourceOptions', () => {
    const result = mergeRules(base, {
      'eslint:max-params': { sourceOptions: [5] },
    });
    const target = result.find((r) => r.id === 'eslint:max-params');
    expect(target?.sourceOptions).toEqual([5]);
  });

  it('removes a disabled rule', () => {
    const result = mergeRules(base, {
      'eslint:complexity': { disabled: true },
    });
    expect(result.map((r) => r.id)).not.toContain('eslint:complexity');
  });

  it('appends a custom rule definition', () => {
    const result = mergeRules(base, {
      'custom:my-check': {
        id: 'custom:my-check',
        source: 'custom',
        severity: 'enforced',
        title: 'Custom',
        description: 'Custom desc',
      },
    });
    const custom = result.find((r) => r.id === 'custom:my-check');
    expect(custom?.source).toBe('custom');
    expect(custom?.severity).toBe('enforced');
  });

  it('applies include and exclude patterns', () => {
    const result = mergeRules(base, {
      'eslint:max-params': { include: ['src/**'], exclude: ['**/*.test.ts'] },
    });
    const target = result.find((r) => r.id === 'eslint:max-params');
    expect(target?.include).toEqual(['src/**']);
    expect(target?.exclude).toEqual(['**/*.test.ts']);
  });

  it('merges multiple override sources (later wins per field)', () => {
    const result = mergeRules(
      base,
      { 'eslint:max-params': { exclude: ['tests/**'] } },
      { 'eslint:max-params': { severity: 'suggested' } },
    );
    const target = result.find((r) => r.id === 'eslint:max-params');
    expect(target?.exclude).toEqual(['tests/**']);
    expect(target?.severity).toBe('suggested');
  });
});
