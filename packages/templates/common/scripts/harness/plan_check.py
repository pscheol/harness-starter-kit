#!/usr/bin/env python3
"""기획물 필수 제목 · 머리 검사(설계 08 §3.8 · DS-R15, HK-19 design §7). 필수 제목 목록의 원본은 킷 템플릿의 `## ` 제목이다.

    python3 scripts/harness/plan_check.py <Intent 폴더/plans>

모델을 부르지 않는다. 빠진 제목 · 머리를 내고 exit 1.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402

TEMPLATES = ".agents/docs/_spec-templates/plans"
FILES = ("requirements-doc.md", "screens/index.md", "design-plan.md", "backlog.md")
HEAD_KEYS = ("intent", "kind", "status", "generatedWith", "generatedBy", "updated")
KINDS = {"requirements-doc.md": "requirements-doc", "screens/index.md": "screen-plan", "design-plan.md": "design-plan", "backlog.md": "backlog"}
GENERATED = re.compile(r"^(skill:[\w.:/-]+|template:plans/[\w./-]+)$")


def harness_root(start: Path) -> Path:
    for folder in (start.resolve(), *start.resolve().parents):
        if (folder / ".agents/harness-kit.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return start.resolve()


def headings(text: str) -> list[str]:
    return [line[3:].strip() for line in text.splitlines() if line.startswith("## ")]


def problems(plans: Path) -> list[str]:
    root = harness_root(plans)
    out: list[str] = []
    for rel in FILES:
        path = plans / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        try:
            head = parse_frontmatter(text) or {}
        except ValueError as error:
            out.append(f"{rel}: 머리를 읽을 수 없다({error})")
            continue
        for key in HEAD_KEYS:
            if not head.get(key):
                out.append(f"{rel}: 머리 {key} 가 없다")
        if head.get("kind") and head["kind"] != KINDS[rel]:
            out.append(f"{rel}: kind 는 {KINDS[rel]}")
        if head.get("generatedWith") and not GENERATED.match(head["generatedWith"]):
            out.append(f"{rel}: generatedWith 는 skill:<이름> 또는 template:plans/<파일>")
        template = root / TEMPLATES / rel
        if not template.is_file():
            out.append(f"{rel}: 킷 템플릿 {TEMPLATES}/{rel} 이 없다 — harness-kit repair")
            continue
        have = headings(text)
        for title in headings(template.read_text(encoding="utf-8")):
            if title not in have:
                out.append(f"{rel}: 필수 제목 '## {title}' 이 없다")
        if rel == "backlog.md" and ("<!-- BACKLOG:BEGIN" not in text or "<!-- BACKLOG:END -->" not in text):
            out.append("backlog.md: 생성 구간 BACKLOG:BEGIN … END 가 없다")
        if rel == "requirements-doc.md" and ("<!-- FROM-INTENT:BEGIN -->" not in text or "<!-- FROM-INTENT:END -->" not in text):
            out.append("requirements-doc.md: FROM-INTENT 구간이 없다")
    return out


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    found = problems(Path(args[0]))
    for line in found:
        print(f"✖ {line}")
    print("기획물 검사 통과" if not found else f"기획물 검사 실패 {len(found)}건")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
