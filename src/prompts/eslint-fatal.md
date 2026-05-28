A "fatal" message means ESLint could not analyze the file at all — a parse error, an unresolvable config, or a plugin that threw. There is no rule judgement here; the linter never got far enough to make one.

Common causes: a real syntax error in the file; a missing or misnamed `tsconfig.json`; typescript-eslint requiring an explicit `tsconfigRootDir` when sample / fixture folders create multiple candidate roots; a plugin whose major version no longer matches its peers; a config file that imports a module that fails to load.

How to diagnose: re-run the failing file directly with `npx eslint <file>` to see the full stack — the JSON output strips it. If the file lives under a fixtures, samples, or vendored folder, check `eslint.config.*`'s `ignores` list; analysing those paths is almost never what you want. For typescript-eslint, set `languageOptions.parserOptions.tsconfigRootDir` (often `import.meta.dirname`) so the parser stops guessing.

Do not silence this with `eslint-disable` or by removing the file from the lint set. A fatal means broken analysis, not a style smell — every other rule is also unchecked for that file until you fix it.
