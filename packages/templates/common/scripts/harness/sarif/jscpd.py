#!/usr/bin/env python3
"""jscpd JSON 보고서(`jscpd-report.json`) → SARIF 2.1.0(설계 09 §3.5).

    python3 scripts/harness/sarif/jscpd.py --in <jscpd-report.json> --out <sarif>

중복 쌍마다 결과 하나(`jscpd/duplicate`, warning, 위치 2개). 전체 중복률은 runs[0].properties 에 남긴다.
"""

import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from harness.sarif.sarif_io import InputError, document, result, run_converter  # noqa: E402

TOOL = "jscpd"


def fragment(side):
    if not isinstance(side, dict) or not isinstance(side.get("name"), str):
        raise InputError("duplicates[] 의 firstFile · secondFile 에 name 이 없다")
    start = int(side.get("start") or (side.get("startLoc") or {}).get("line") or 1)
    end = int(side.get("end") or (side.get("endLoc") or {}).get("line") or start)
    return side["name"], max(start, 1), max(end, start, 1)


def convert(text, options):
    try:
        report = json.loads(text)
        duplicates = report.get("duplicates", [])
        if not isinstance(duplicates, list):
            raise TypeError("duplicates 가 목록이 아니다")
        results = []
        for item in duplicates:
            primary, other = fragment(item.get("firstFile")), fragment(item.get("secondFile"))
            lines, tokens = int(item.get("lines") or primary[2] - primary[1] + 1), int(item.get("tokens") or 0)
            message = f"중복 {lines}줄: {other[0]}:{other[1]}-{other[2]} 과 같다"
            properties = {"lines": lines, "tokens": tokens, "format": str(item.get("format") or "")}
            results.append(result("jscpd/duplicate", "warning", message, primary[0], primary[1], primary[2], extra=[other], properties=properties))
        total = (report.get("statistics") or {}).get("total") or {}
    except (ValueError, TypeError, AttributeError) as error:
        raise InputError(f"jscpd 보고서 형식이 아니다: {error}") from error
    properties = {key: total[key] for key in ("lines", "duplicatedLines", "percentage") if key in total}
    return document(TOOL, results, "https://github.com/kucherenko/jscpd", properties or None)


if __name__ == "__main__":
    sys.exit(run_converter(convert, sys.argv[1:]))
