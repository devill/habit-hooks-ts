import { RUFF_RECOMMENDED } from '../recommendations.js';

export const RUFF_CONFIG_FILENAME = 'ruff.toml';

function valueOf(key: string): number {
  const found = RUFF_RECOMMENDED.find((k) => k.key === key);
  if (found === undefined) throw new Error(`unknown ruff recommended key ${key}`);
  return found.value;
}

export const RUFF_CONFIG_TEMPLATE = `[lint.mccabe]
max-complexity = ${valueOf('max-complexity')}

[lint.pylint]
max-args = ${valueOf('max-args')}
max-statements = ${valueOf('max-statements')}
`;
