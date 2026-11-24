#!/usr/bin/env python3
"""불변식 · 바뀌면 안 되는 동작의 근거와 시험 연결(설계 08 §3.16 · DS-R27 · DS-R28, HK-19 design §11).

    python3 scripts/harness/invariants.py <이슈 폴더|키> [--json]

| 검사 | 실패 조건 | 심각도 |
|---|---|---|
| INV → 시험 | design §4.5 의 INV-n 이 §11 · §12 어디에도 없거나, tasks 에 INV-n 을 단 작업(T###)이 없다 | HIGH |
| KEEP → 시험 | requirements 의 KEEP-n 을 단 작업이 tasks 에 없다 | HIGH |
| 근거 없는 불변식 | INV-n 근거 칸이 비었거나 requirements · Intent 에 없는 ID 를 가리킨다 | MEDIUM |
| 답 없는 엣지 질문 | 엣지 케이스 질문 표의 답 · 출처 칸이 비었다 | HIGH |

/kns-analyze 가 이 결과를 보고서에 옮긴다. 읽기만 한다. 모델을 부르지 않는다. HIGH 나 MEDIUM 이 있으면 exit 1.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402

INV = re.compile(r"\bINV-\d+\b")
KEEP = re.compile(r"\bKEEP-\d+\b")
BASIS = re.compile(r"\b(?:R\d+(?:\.\d+)*|NFR-\d+|KEEP-\d+|Q-\d+|D-\d+|S-\d+\.AC-\d+)\b")
TASK_LINE = re.compile(r"^\s*-\s*\[[ xX]\]\s*T\d{3,}")
NOT_APPLICABLE = re.compile(r"해당 없음\s*:")


def section(text: str, start: re.Pattern, stop: re.Pattern) -> list[str]:
    out, inside = [], False
    for line in text.splitlines():
        if start.match(line):
            inside = True
            continue
        if inside and stop.match(line):
            break
        if inside:
            out.append(line)
    return out


def table(lines: list[str], title: str) -> list[list[str]]:
    rows, inside, seen = [], False, 0
    for line in lines:
        if line.startswith("#### "):
            inside = line[5:].strip().startswith(title)
            seen = 0
            continue
        if not inside or not line.strip().startswith("|"):
            continue
        seen += 1
        if seen <= 2:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if any(cells):
            rows.append(cells)
    return rows


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def intent_text(root: Path, folder: Path) -> str:
    head = parse_frontmatter(read(folder / "requirements.md")) or {}
    key = head.get("intent")
    base = root / ".agents/docs/intents"
    if not key or not base.is_dir():
        return ""
    found = [d for d in base.iterdir() if d.is_dir() and d.name.startswith(f"{key}-")]
    return read(found[0] / "intent.md") if found else ""


def analyze(root: Path, folder: Path) -> dict:
    design, requirements, tasks = read(folder / "design.md"), read(folder / "requirements.md"), read(folder / "tasks.md")
    known = requirements + "\n" + intent_text(root, folder)
    task_lines = [line for line in tasks.splitlines() if TASK_LINE.match(line)]
    findings: list[dict] = []
    domain = section(design, re.compile(r"^### 4\.5 "), re.compile(r"^#{2,3} "))
    skip = any(NOT_APPLICABLE.search(line) for line in domain[:6])
    covered = "\n".join(section(design, re.compile(r"^## 11\. "), re.compile(r"^## 13\. ")))
    invariants = [] if skip else [r for r in table(domain, "불변식") if INV.fullmatch(r[0])]
    for row in invariants:
        inv = row[0]
        basis = row[2] if len(row) > 2 else ""
        refs = BASIS.findall(basis)
        if not refs:
            findings.append({"severity": "MEDIUM", "check": "근거 없는 불변식", "id": inv, "message": f"{inv} 근거 칸에 R# · NFR-# · KEEP-# · Q-# 가 없다"})
        else:
            missing = [r for r in refs if not re.search(rf"\b{re.escape(r)}\b", known)]
            if missing:
                findings.append({"severity": "MEDIUM", "check": "근거 없는 불변식", "id": inv, "message": f"{inv} 근거 {', '.join(missing)} 가 requirements · Intent 에 없다"})
        in_design = re.search(rf"\b{inv}\b", covered) is not None
        in_tasks = any(re.search(rf"\b{inv}\b", line) for line in task_lines)
        if not (in_design and in_tasks):
            where = " · ".join(w for w, ok in (("design §11 · §12", in_design), ("tasks 시험 작업", in_tasks)) if not ok)
            findings.append({"severity": "HIGH", "check": "INV → 시험", "id": inv, "message": f"{inv} 가 {where} 에 없다"})
    keeps = sorted(set(KEEP.findall(requirements)), key=lambda k: int(k.split("-")[1]))
    for keep in keeps:
        if not any(re.search(rf"\b{keep}\b", line) for line in task_lines):
            findings.append({"severity": "HIGH", "check": "KEEP → 시험", "id": keep, "message": f"{keep} 를 단 시험 작업(T###)이 tasks 에 없다"})
    for row in [] if skip else table(domain, "엣지 케이스 질문"):
        if len(row) >= 3 and not row[2]:
            findings.append({"severity": "HIGH", "check": "답 없는 엣지 질문", "id": row[0], "message": f"{row[0]} 의 답 · 출처 칸이 비었다"})
    return {"folder": folder.relative_to(root).as_posix() if folder.is_relative_to(root) else str(folder), "notApplicable": skip,
            "invariants": [r[0] for r in invariants], "keeps": keeps, "findings": findings}


def locate(root: Path, target: str) -> Path:
    p = Path(target)
    if (root / p / "design.md").is_file() or (root / p / "requirements.md").is_file():
        return (root / p).resolve()
    base = root / ".agents/docs/issues"
    found = [d for d in base.iterdir() if d.is_dir() and d.name.startswith(f"{target}-")] if base.is_dir() else []
    if len(found) != 1:
        raise SystemExit(f"이슈 폴더를 못 찾았다(또는 둘 이상이다): {target}")
    return found[0]


def harness_root(start: Path) -> Path:
    for folder in (start.resolve(), *start.resolve().parents):
        if (folder / ".agents/knots-sync.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return start.resolve()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="invariants.py", description=__doc__)
    parser.add_argument("target")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = harness_root(Path.cwd())
    r = analyze(root, locate(root, args.target))
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for f in r["findings"]:
            print(f"{f['severity']} · {f['check']} · {f['id']} — {f['message']}")
        print(f"불변식 {len(r['invariants'])} · KEEP {len(r['keeps'])} · 지적 {len(r['findings'])}" + (" (§4.5 해당 없음)" if r["notApplicable"] else ""))
    return 1 if r["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
