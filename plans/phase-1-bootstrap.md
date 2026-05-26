# Phase 1 — Bootstrap

## Goal
Empty repo → working TypeScript ESM package with build, vitest, eslint, prettier, and a stub CLI binary that prints its version.

## Tasks
1. `git init`, set default branch `main`, add `.gitignore` (`node_modules`, `dist`, `coverage`, `.DS_Store`).
2. `package.json`:
   - `name: "habit-hooks"`, `version: "0.0.0"`, `type: "module"`, `engines.node: ">=20"`.
   - `bin: { "habit-hooks": "./dist/cli.js" }`.
   - `main: "./dist/index.js"`, `types: "./dist/index.d.ts"`.
   - `files: ["dist", "src/prompts"]` (prompts shipped as data).
   - Scripts: `build` (`tsc -p .`), `test` (`vitest run`), `test:watch` (`vitest`), `lint` (`eslint .`), `format` (`prettier -w .`), `typecheck` (`tsc --noEmit`).
3. `tsconfig.json`: strict, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `rootDir: src`, `declaration: true`, `sourceMap: true`.
4. Dev deps: `typescript`, `vitest`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `commander`.
5. `eslint.config.js` — flat config for this repo's own source (TS rules, no global ignores beyond `dist`, `coverage`).
6. `.prettierrc.json` — minimal (`singleQuote: true`, `printWidth: 100`).
7. `vitest.config.ts` — `environment: 'node'`, `include: ['src/**/*.test.ts']`.
8. `src/cli.ts`:
   - Shebang `#!/usr/bin/env node`.
   - Use `commander`; register `--version` only (reads from package.json).
   - Default action prints `habit-hooks v<version>` and exits 0.
9. `src/index.ts` — empty named export placeholder (so `main` resolves).
10. `src/cli.test.ts` — spawns built CLI with `--version`, asserts stdout matches `/^habit-hooks v0\.0\.0$/` and exit 0. Test requires `npm run build` to have run; document this in the test file or run build in a `beforeAll`.
11. First commit on `main`: `chore: bootstrap habit-hooks package`.

## Acceptance criteria (all must pass)
- `npm install` clean (no peer-dep warnings, no audit blockers).
- `npm run build` produces `dist/cli.js` with executable bit and shebang.
- `npm run typecheck` exits 0.
- `npm run lint` exits 0 with no warnings.
- `npm test` exits 0 with at least the version test passing.
- `node dist/cli.js --version` prints exactly `habit-hooks v0.0.0`.
- `git status` clean after commit.

## Out of scope
Any check logic, config loading, rule registry, git scope, baseline. Pure skeleton only.

## Notes for the executor
- Per CLAUDE.md: TDD where it adds value; the version test is enough for this phase.
- Do not add a README.
- Use `commander` rather than `node:util parseArgs` — subcommands land in later phases and commander handles them cleanly.
