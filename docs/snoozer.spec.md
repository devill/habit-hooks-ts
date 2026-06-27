# Snoozer

Snoozing is a **filter sensor** ([sensors.md](sensors.md)): it reads
`{smell, details}` findings as JSONL and drops the ones a project has snoozed.
A snooze is keyed by `hash(file contents) + smell`, so it lapses when the file
changes. The `snooze` / `prune` / `list` commands maintain the checked-in index.

```bash
habit-snooze() { ../../habit-snooze; }
```

## Filtering

### An unsnoozed finding passes through 🟡

With an empty index, every finding survives.

⌨️
```json
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

```bash
habit-snooze
```

🖥️ ✅
```text
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

### A snoozed finding is dropped 🟡

`snooze` records the finding against its file's hash; the filter then drops it.

📄src/x.ts
```ts
export const x = 1;
```

⌨️
```json
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

```bash
habit-snooze snooze
```

⌨️
```json
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

```bash
habit-snooze
```

🖥️ ✅
```text
```

### A snooze lapses when the file changes 🟡

Editing the file changes its hash, so the snoozed finding resurfaces.

📄src/x.ts
```ts
export const x = 1;
```

⌨️
```json
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

```bash
habit-snooze snooze
```

📄src/x.ts
```ts
export const x = 2;
```

⌨️
```json
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```

```bash
habit-snooze
```

🖥️ ✅
```text
{ "smell": "loose-equality", "details": { "file": "src/x.ts", "line": 1 } }
```
