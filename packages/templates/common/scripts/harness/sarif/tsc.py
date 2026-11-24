#!/usr/bin/env python3
"""TypeScript `tsc --noEmit --pretty false` 출력 → SARIF 2.1.0(설계 09 §3.5).

    python3 scripts/harness/sarif/tsc.py --in <tsc.txt> --out <sarif>

`파일(줄,열): error TSxxxx: 메시지` 줄마다 결과 하나(`tsc/TSxxxx`, error). 들여쓴 이어지는 줄은 앞 메시지에 붙인다.
"""

import re
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.sarif.sarif_io import document, result, run_converter  # noqa: E402

TOOL = "tsc"
LINE = re.compile(r"^(?P<file>.+?)\((?P<line>\d+),(?P<column>\d+)\): (?:error|warning) (?P<code>TS\d+): (?P<message>.*)$")


def convert(text, options):
    results = []
    for line in text.splitlines():
        match = LINE.match(line)
        if match:
            results.append(result(f"tsc/{match['code']}", "error", match["message"], match["file"], max(int(match["line"]), 1)))
        elif results and line.startswith((" ", "\t")) and line.strip():
            results[-1]["message"]["text"] += " " + line.strip()
    return document(TOOL, results, "https://www.typescriptlang.org")


if __name__ == "__main__":
    sys.exit(run_converter(convert, sys.argv[1:]))
