"""Run the jscpd CLI and print ``duplicated-code`` findings.

jscpd writes its result to a report file rather than stdout, and exits non-zero
when duplication crosses its configured threshold. This wrapper runs it against a
temp report, reads that report regardless of the exit code, and shapes each clone
into a finding.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    return parser.parse_args(argv)


def scan_paths(config: str) -> list[str]:
    return json.loads(Path(config).read_text())["path"]


def run_jscpd(paths: list[str], config: str, output: Path) -> None:
    command = ["jscpd", "--reporters", "json", "--output", str(output), "--config", config]
    subprocess.run([*command, *paths], capture_output=True, text=True)


def occurrence(side: dict) -> dict:
    return {
        "key": side["name"],
        "details": {
            "file": side["name"],
            "startLine": side["start"],
            "endLine": side["end"],
            "source": "jscpd:duplication",
        },
    }


def clone_finding(clone: dict) -> dict:
    return {
        "smell": "duplicated-code",
        "details": {"lines": clone["lines"], "tokens": clone["tokens"]},
        "issues": [occurrence(clone["firstFile"]), occurrence(clone["secondFile"])],
    }


def findings(report: Path) -> list[dict]:
    if not report.is_file():
        return []
    clones = json.loads(report.read_text())["duplicates"]
    return [clone_finding(clone) for clone in clones]


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp)
        run_jscpd(scan_paths(args.config), args.config, output)
        print(json.dumps(findings(output / "jscpd-report.json")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
