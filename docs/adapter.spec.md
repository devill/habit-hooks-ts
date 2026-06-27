# Habit Adapter

`habit-adapter` maps a tool's native JSON (stdin) into a `{smell, details}` JSON
array, driven by a sensor spec's mapping block. The raw rule is kept in
`details.source` as `<sensor>:<raw>`; `map` rewrites it to a canonical smell.
See [sensors.md](sensors.md) for the mapping fields.

```bash
habit-adapter() { ../../habit-adapter; }
```

## Flat tools

### A flat list of issues maps line by line 🟡

Ruff emits a flat JSON array, so `items = "[]"` reads it directly.

📄ruff.toml
```toml
command  = "ruff check --output-format json ${files}"
produces = ["too-many-parameters"]
items    = "[]"
fields   = { smell = "code", file = "filename", line = "location.row", column = "location.column", message = "message" }
map      = { PLR0913 = "too-many-parameters" }
```

⌨️
```json
[
  {
    "code": "PLR0913",
    "filename": "src/billing.py",
    "location": { "row": 2, "column": 1 },
    "message": "Too many arguments in function definition"
  }
]
```

```bash
habit-adapter --spec ruff.toml
```

🖥️ ✅
```text
[{"smell":"too-many-parameters","details":{"file":"src/billing.py","line":2,"column":1,"message":"Too many arguments in function definition","source":"ruff:PLR0913"}}]
```

## Nested tools

### An outer group with inner issues flattens to one line each 🟡

ESLint emits one entry per file with a `messages` array, so `group` reads the
outer entry and `items` the inner one.

📄eslint.toml
```toml
command  = "eslint -f json ${files}"
produces = ["too-many-parameters"]
group    = "[]"
items    = "messages[]"
fields   = { smell = "ruleId", file = "group.filePath", line = "line", column = "column", message = "message" }
map      = { max-params = "too-many-parameters" }
```

⌨️
```json
[
  {
    "filePath": "src/billing.ts",
    "messages": [
      { "ruleId": "max-params", "line": 2, "column": 22, "message": "Too many parameters (4)" }
    ]
  }
]
```

```bash
habit-adapter --spec eslint.toml
```

🖥️ ✅
```text
[{"smell":"too-many-parameters","details":{"file":"src/billing.ts","line":2,"column":22,"message":"Too many parameters (4)","source":"eslint:max-params"}}]
```
