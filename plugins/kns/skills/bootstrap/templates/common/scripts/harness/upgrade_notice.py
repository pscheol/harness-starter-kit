#!/usr/bin/env python3
"""업그레이드 공지(설계 03 §3.11, HK-24 design §7). update.sh 가 킷 판을 불러 쓴다. CLI core/notice.ts 와 같은 바이트를 낸다.

    python3 upgrade_notice.py --upgrade-md <킷 UPGRADE.md> --from <이전 판> --to <새 판> --today YYYY-MM-DD --root <대상> [--dry-run]

표준 출력: write · delete · keep-human · none 중 하나. 모을 절이 있으면 킷 공지를 새로 쓰고, 없으면 만료된 킷 공지만 지운다.
사람이 만든 공지(머리에 kitFrom · kitTo 가 없는 파일)는 건드리지 않는다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.dont_write_bytecode = True

NOTICE_REL = ".agents/harness-upgrade-notice.md"
NOTICE_DAYS = 30
SECTION_LIMIT = 800
CORE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")
HEADING = re.compile(r"^## +(\S+)\s*$")


def core_version(v: str) -> tuple[int, int, int] | None:
    m = CORE.match(v.strip())
    return (int(m[1]), int(m[2]), int(m[3])) if m else None


def trim_blank(lines: list[str]) -> list[str]:
    a, b = 0, len(lines)
    while a < b and lines[a].strip() == "":
        a += 1
    while b > a and lines[b - 1].strip() == "":
        b -= 1
    return lines[a:b]


def upgrade_sections(text: str) -> list[tuple[str, list[str]]]:
    out: list[tuple[str, list[str]]] = []
    for line in text.replace("\r\n", "\n").split("\n"):
        h = HEADING.match(line)
        if h:
            out.append((h[1], []))
        elif out:
            out[-1][1].append(line)
    return [(v, trim_blank(body)) for v, body in out]


def add_days(day: str, n: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=n)).isoformat()


def is_kit_notice(text: str) -> bool:
    lines = text.replace("\r\n", "\n").split("\n")
    if not lines or lines[0].strip() != "---":
        return False
    end = lines.index("---", 1) if "---" in lines[1:] else -1
    head = lines[1:end] if end > 0 else []
    return any(l.startswith("kitFrom:") for l in head) and any(l.startswith("kitTo:") for l in head)


def notice_expired(text: str, today: str) -> bool:
    m = re.search(r"^expires:\s*(\S+)", text, re.M)
    return bool(m and m[1] < today)


def plan_notice(upgrade_text: str | None, frm: str, to: str, today: str, existing: str | None) -> tuple[str, str | None]:
    f, t = core_version(frm), core_version(to)
    sections = []
    if upgrade_text is not None and f and t:
        for v, body in upgrade_sections(upgrade_text):
            c = core_version(v)
            if c is not None and f < c <= t:
                sections.append((c, body))
        sections.sort(key=lambda s: s[0])
    kit = existing is not None and is_kit_notice(existing)
    if not sections:
        return ("delete" if kit and notice_expired(existing, today) else "none"), None
    if existing is not None and not kit:
        return "keep-human", None
    body = [line for _, lines in sections for line in lines]
    text = "\n".join(["---", f"kitFrom: {frm}", f"kitTo: {to}", f"date: {today}", f"expires: {add_days(today, NOTICE_DAYS)}", "---",
                      f"# 하네스 업데이트 {frm} → {to}", "", *body, ""])
    return "write", text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="upgrade_notice.py", description="업그레이드 공지 쓰기")
    parser.add_argument("--upgrade-md", required=True)
    parser.add_argument("--from", dest="frm", required=True)
    parser.add_argument("--to", required=True)
    parser.add_argument("--today", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    md = Path(args.upgrade_md)
    path = Path(args.root) / NOTICE_REL
    existing = path.read_text(encoding="utf-8") if path.is_file() else None
    action, text = plan_notice(md.read_text(encoding="utf-8") if md.is_file() else None, args.frm, args.to, args.today, existing)
    if not args.dry_run:
        if action == "write" and text is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(f".{path.name}.hk-tmp")
            tmp.write_text(text, encoding="utf-8")
            tmp.replace(path)
        elif action == "delete":
            path.unlink(missing_ok=True)
    print(action)
    return 0


if __name__ == "__main__":
    sys.exit(main())
