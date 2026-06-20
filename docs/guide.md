# Guide

A guide **coaches the fix for one smell**. It is the authored content
`habit-mapper` renders for a smell group — a markdown template or a script.
Guides live in a plugin's `guides/` dir and resolve across the override chain
(see [architecture.md](architecture.md)).

A guide is generic unless it needs language-specific wording; most smells share
one generic prompt.

## `guides/<smell>.md` — a template

Rendered against all of the smell's issues, the result is emitted for the agent
to act on. The template owns presentation — including grouping, so each smell
groups the way that suits it (`oversized-function` by file, `duplicated-code` by
block, `primitive-obsession` by data structure across files).

Templates are [Nunjucks](https://mozilla.github.io/nunjucks/), rendered once per
smell with:

```ts
{
  smell: string;     // the smell key
  issues: Issue[];   // every issue for this smell, each with its details bag
}
```

Grouping (`{% for %}`, `groupby`), filtering, and counts are the template's job,
using the fields the sensor put in each issue's `details`. A plain markdown file
with no interpolation is the degenerate case. Templates may `{% include %}`
partials from the same override chain.

## `guides/<smell>` — a script

Any non-`.md` file named after the smell is run instead of rendered. It receives
the smell's issues as a JSON array on **stdin** and runs once per smell.

- It may fix the issues, or just produce smarter output than a template could.
- Its **exit code** drives pass/fail: `0` does not block; non-zero contributes
  exit 1 for an `enforced` smell.
- A spawn or timeout failure always blocks the run, regardless of severity.
- Its stdout/stderr is shown to the agent.

## Authoring

Keep prompts short and outcome-focused (the `habit-hooks-prompting` skill's ROSE
pattern). A project overrides a shipped guide by dropping its own
`guides/<smell>.md` in `.habit-hooks/` — the update path never clobbers it.
