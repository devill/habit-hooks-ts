# Mapper

`habit-mapper` is the last stage: it **routes each smell to a guide, renders
it, and sets the exit code**. It reads `{smell, details}` JSONL on stdin,
groups by smell, and resolves each group to one guide.

Everything tool- and language-specific was already resolved upstream into a
[smell key](smell-vocabulary.md), so the mapper is a pure single-smell
function: `smell → guide`.

## Routing

For each smell group the mapper resolves, in order:

1. the smell's `guide` override from config, if set;
2. `guides/<smell>.md` — rendered as a template;
3. `guides/<smell>` script — executed.

Guide files resolve across the override chain (project before package, language
before generic — see [architecture.md](architecture.md)). The first existing
match wins; a `.md` is rendered, anything else is executed (see
[guide.md](guide.md)).

Severity comes from the smell's config entry, else the
[catalogue](smell-vocabulary.md) default.

## Totality

Every smell resolves to *something*. A smell with routing (a known severity)
but no guide file falls back to the generic `uncoached.md` body and keeps its
severity. A smell with **no** routing at all (truly unknown, e.g. an ESLint
rule with no mapping) lands in the uncoached bucket — surfaced, never
escalating the exit code. Nothing is silently dropped.

## Exit code

| Situation                                      | Exit code                 |
|------------------------------------------------|---------------------------|
| No issues                                      | 0                         |
| Only `suggested` smells                        | 0                         |
| Any `enforced` smell with an unresolved issue  | 1                         |
| A guide script exits 0                         | does not block on its own |
| A guide script fails to spawn / times out      | 1 (always blocks)         |

A clean run prints the pass banner and a reminder that structural checks are not
a substitute for a correctness/design review.

Whatever invokes `habit-mapper` — an agent loop, a git hook, CI — decides what a
non-zero exit means.
