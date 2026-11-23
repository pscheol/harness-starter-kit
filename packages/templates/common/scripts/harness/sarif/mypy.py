#!/usr/bin/env python3
"""mypy `-O json`(줄마다 JSON) → SARIF 2.1.0(설계 09 §3.5).

    python3 scripts/harness/sarif/mypy.py --in <mypy.json> --out <sarif>

`ruleId: mypy/<code>`, level 은 mypy severity(error · note) 그대로다.
"""

import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.sarif.sarif_io import LEVELS, InputError, document, result, run_converter  # noqa: E402

TOOL = "mypy"


def convert(text, options):
    results = []
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
            path, start = item["file"], max(int(item.get("line") or 1), 1)
        except (ValueError, KeyError, TypeError) as error:
            raise InputError(f"mypy JSON {number}번 줄을 읽지 못했다: {error}") from error
        severity = item.get("severity") if item.get("severity") in LEVELS else "error"
        message = str(item.get("message") or "")
        if item.get("hint"):
            message += f" ({item['hint']})"
        results.append(result(f"mypy/{item.get('code') or 'misc'}", severity, message, path, start))
    return document(TOOL, results, "https://mypy-lang.org")


if __name__ == "__main__":
    sys.exit(run_converter(convert, sys.argv[1:]))
