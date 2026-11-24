#!/usr/bin/env python3
"""와이어프레임 HTML 검사(설계 08 §3.8 · DS-R16, HK-19 design §7).

    python3 scripts/harness/wireframe_check.py <SCR-*.html>…

파일 하나 · 200KB 이하 · 외부 src/href/@import/fetch/url(http) 0건 · CSP meta · 상태 넷(data-state) ·
data-el 이 같은 폴더 index.md 요소 표에 있다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

LIMIT = 200 * 1024
STATES = ("default", "empty", "loading", "error")
EXTERNAL = [
    re.compile(r"""\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?//""", re.I),
    re.compile(r"""@import\s+(?:url\()?\s*["']?(?:https?:)?//""", re.I),
    re.compile(r"""\bfetch\s*\(""", re.I),
    re.compile(r"""url\(\s*["']?(?:https?:)?//""", re.I),
    re.compile(r"""\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b"""),
]
CSP = re.compile(r"""<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+default-src 'none'""", re.I)


def elements_in_index(folder: Path) -> set[str] | None:
    index = folder / "index.md"
    if not index.is_file():
        return None
    ids = set()
    for line in index.read_text(encoding="utf-8").splitlines():
        if line.startswith("|"):
            ids.update(re.findall(r"\b(EL-[\w-]+)\b", line))
    return ids


def problems(path: Path) -> list[str]:
    out: list[str] = []
    name = path.name
    try:
        data = path.read_bytes()
    except OSError as error:
        return [f"{name}: 읽을 수 없다({error})"]
    if len(data) > LIMIT:
        out.append(f"{name}: {len(data)}바이트 — 200KB 이하")
    text = data.decode("utf-8", errors="replace")
    for pattern in EXTERNAL:
        for m in pattern.finditer(text):
            out.append(f"{name}: 외부 참조 · 네트워크 요청 '{m.group(0).strip()}'")
    if not CSP.search(text):
        out.append(f"{name}: Content-Security-Policy meta(default-src 'none') 가 없다")
    states = set(re.findall(r"""data-state=["']([a-z]+)["']""", text))
    for state in STATES:
        if state not in states:
            out.append(f"{name}: 상태 data-state=\"{state}\" 가 없다")
    els = set(re.findall(r"""data-el=["']([\w-]+)["']""", text))
    if not els:
        out.append(f"{name}: data-el 요소가 없다")
    known = elements_in_index(path.parent)
    if known is None:
        out.append(f"{name}: 같은 폴더 index.md 가 없다")
    else:
        for el in sorted(els - known):
            out.append(f"{name}: data-el {el} 가 index.md 요소 표에 없다")
    return out


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    found = [p for a in args for p in problems(Path(a))]
    for line in found:
        print(f"✖ {line}")
    print("와이어프레임 검사 통과" if not found else f"와이어프레임 검사 실패 {len(found)}건")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
