#!/usr/bin/env python3
"""lizard `--csv` → SARIF 2.1.0(설계 09 §3.5).

    python3 scripts/harness/sarif/lizard.py --in <lizard.csv> --out <sarif> --threshold 15

열: NLOC, CCN, token, PARAM, length, location, file, function, long_name, start, end. 머리 줄은 있어도 없어도 된다.
CCN 이 기준을 넘는 함수마다 결과 하나(`lizard/ccn`, warning). 함수 수 · 최대 CCN 은 runs[0].properties 에 남긴다.
"""

import csv
import io
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.sarif.sarif_io import InputError, document, result, run_converter  # noqa: E402

TOOL = "lizard"
COLUMNS = 11
DEFAULT_THRESHOLD = 15


def rows(text):
    parsed = []
    for number, row in enumerate(csv.reader(io.StringIO(text)), 1):
        if not row or not any(cell.strip() for cell in row):
            continue
        if number == 1 and row[0].strip() == "NLOC":
            continue
        if len(row) < COLUMNS:
            raise InputError(f"lizard CSV {number}번 줄의 열이 {len(row)}개다({COLUMNS}개 필요)")
        try:
            parsed.append({
                "nloc": int(row[0]), "ccn": int(row[1]), "file": row[6], "function": row[7],
                "start": int(row[9]), "end": int(row[10]),
            })
        except ValueError as error:
            raise InputError(f"lizard CSV {number}번 줄: {error}") from error
    return parsed


def convert(text, options):
    threshold = int(options.threshold) if options.threshold is not None else DEFAULT_THRESHOLD
    functions = rows(text)
    over = [item for item in functions if item["ccn"] > threshold]
    results = [
        result(
            "lizard/ccn", "warning", f"함수 {item['function']} 의 순환 복잡도 {item['ccn']} > {threshold}",
            item["file"], max(item["start"], 1), max(item["end"], item["start"], 1),
            properties={"ccn": item["ccn"], "nloc": item["nloc"], "function": item["function"]},
        )
        for item in over
    ]
    properties = {"functions": len(functions), "maxCcn": max((item["ccn"] for item in functions), default=0), "overThreshold": len(over), "threshold": threshold}
    return document(TOOL, results, "https://github.com/terryyin/lizard", properties)


if __name__ == "__main__":
    sys.exit(run_converter(convert, sys.argv[1:]))
