# Snoozer

`habit-snoozer` is a pure stream filter. It reads `{smell, details}` JSONL on
stdin and writes through every line **except** those a project has snoozed,
unchanged.

## The snooze index

Snoozes live in a checked-in file under `.habit-hooks/` (the baseline). Each
entry identifies a finding by a stable hash of its `file` content plus its
`smell`, so a snooze survives line-number drift but lapses when the file
changes — a snoozed smell that moves to new code resurfaces.

A line is dropped when `hash(file-contents) + smell` is present in the index.
Lines without a `file` (project-level smells) are matched on `smell` alone.

## Commands

`habit-snoozer` also owns the snooze lifecycle (the only stateful CLI):

| Command                 | Effect                                                    |
|-------------------------|----------------------------------------------------------|
| (default, stdin→stdout) | Filter: drop snoozed lines.                              |
| `snooze`                | Read findings on stdin, add them all to the index.       |
| `prune`                 | Drop index entries whose file no longer produces them.   |
| `list`                  | Print the current index.                                 |

Pruning is what keeps the baseline honest: a fixed finding's entry is reaped, so
re-introducing it later is caught.

## Why a separate stage

Snoozing is policy, not detection. Keeping it a stream filter means sensors stay
ignorant of project history, and a full unfiltered run is always one pipe away
(`habit-sensors | habit-mapper`, skipping the snoozer) for auditing what was
hidden.
