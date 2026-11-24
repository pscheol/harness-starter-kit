#!/usr/bin/env python3
"""`/hx-specify --from-unit` 의 결정적 부분(설계 08 §3.7 · DS-R9~R13, HK-19 design §6).

    python3 scripts/harness/from_unit.py <Intent 키>/<U-n> [--key <작업 항목 키>] [--dry-run]

1. intent 게이트(flow.gates 에 있으면 승인 기록 필요) 2. Unit 에 이슈가 있으면 그 경로 3. 의존 Unit 의 이슈가 먼저
4. 키(jira 모듈이면 --key, 아니면 new-feature.sh --next) 5. requirements 를 Intent 에서 채운다(FROM-UNIT 구간 · 머리)
6. units.json 의 Unit.issue. 글 다듬기는 스킬 단계에서 설계 세션이 한다. 모델을 부르지 않는다.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import intent as intents  # noqa: E402
from harness.sdd_frontmatter import parse as parse_frontmatter, update as update_frontmatter  # noqa: E402
from harness.sdd_issues import find_issue  # noqa: E402

BEGIN = "<!-- FROM-UNIT:BEGIN"
END = "<!-- FROM-UNIT:END -->"
CREATED = re.compile(r"생성 완료: (\S+)")


class Stop(Exception):
    """멈추고 이유를 낸다(exit 3)."""


def story_blocks(text: str) -> dict[str, list[str]]:
    """intent.md §6 의 ### S-<n> 블록(제목 줄 포함)."""
    out: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        m = intents.STORY.match(line)
        if m:
            current = m[2]
            out[current] = [line]
        elif line.startswith("## ") or line.startswith("### "):
            current = None
        elif current is not None:
            out[current].append(line)
    return out


def rows_with(text: str, section: str, ids: list[str]) -> list[str]:
    lines = intents.sections(text).get(section, [])
    return [line for line in lines if line.strip().startswith("|") and any(re.search(rf"\b{re.escape(i)}\b", line) for i in ids)]


def keep_rows(folder: Path) -> list[str]:
    path = folder / "current-state.md"
    if not path.is_file():
        return []
    out, inside = [], False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = line.startswith("## 3.")
            continue
        if inside and re.match(r"^\|\s*KEEP-\d+", line):
            out.append(line)
    return out


def link_of(folder: Path) -> dict | None:
    """AI-DLC 를 켠 Intent(intent.json 만 있음, 08 §3.10)의 링크. 그 밖이면 None."""
    if (folder / "intent.md").is_file():
        return None
    data = intents.read_json(folder / "intent.json")
    return data if isinstance(data, dict) else None


def block(folder: Path, intent_text: str, unit: dict, units: dict[str, dict], key_of: dict[str, str], link: dict | None = None) -> str:
    head = parse_frontmatter(intent_text) or {}
    titles: dict[str, str] = {}
    if link is not None:
        head = {"title": link.get("title") or ""}
        titles = {s["id"]: s.get("title") or "" for s in link.get("stories") or [] if isinstance(s, dict) and isinstance(s.get("id"), str)}
    ikey = intents.FOLDER.match(folder.name)[1]
    stories = story_blocks(intent_text)
    lines = [f"{BEGIN} — /hx-specify --from-unit 가 {ikey}/{unit['id']} 에서 옮겼다. 다듬은 뒤에도 ID 는 지우지 않는다 -->", "",
             "## Intent 에서 옮긴 것", "",
             f"- Intent: {ikey} {head.get('title', '')} · `{folder.name}` · Unit: {unit['id']} {unit.get('title') or unit.get('name')} · kind {unit.get('kind')} · area {unit.get('area')}", ""]
    goal = [l for l in intents.sections(intent_text).get("1", []) if l.strip() and not l.startswith("(")]
    if goal:
        lines += ["### 목표(Intent §1)", "", *goal, ""]
    lines += ["### 스토리(US-n 은 이 이슈 번호, 괄호는 Intent ID)", ""]
    for n, sid in enumerate(unit.get("stories") or [], 1):
        body = stories.get(sid, [f"### {sid} {titles.get(sid, '')}".rstrip()])
        title = body[0].split(sid, 1)[-1].strip(" ~")
        lines.append(f"#### US-{n} ({sid}) {title}")
        lines += [l for l in body[1:] if l.strip()]
        lines.append("")
    acs = [(sid, l) for sid in unit.get("stories") or [] for l in stories.get(sid, []) if re.match(rf"^- {re.escape(sid)}\.AC-\d+:", l)]
    if acs:
        lines += ["### 수용 기준(R 번호 ↔ Intent AC)", ""]
        for n, (sid, l) in enumerate(acs, 1):
            ac_id, ears = l[2:].split(":", 1)
            lines.append(f"- R{n} ({ac_id.strip()}): {ears.strip()}")
        lines.append("")
    nfr = rows_with(intent_text, "7", unit.get("nfr") or [])
    if nfr:
        lines += ["### NFR", "", "| ID | 항목 | 기준(숫자) | 관련 스토리 |", "|---|---|---|---|", *nfr, ""]
    risks = rows_with(intent_text, "8", unit.get("risks") or [])
    if risks:
        lines += ["### 위험", "", "| ID | 위험 | 가능성 | 영향 | 대응 | 담당 직무 |", "|---|---|---|---|---|---|", *risks, ""]
    if unit.get("consumes"):
        lines += ["### 의존 계약", ""]
        for dep in unit.get("dependsOn") or []:
            du = units.get(dep, {})
            if du.get("kind") == "contract":
                lines.append(f"- {key_of.get(dep, dep)} ({dep} {du.get('title') or ''}) — {', '.join(c for c in unit['consumes'] if c in (du.get('provides') or []))} · design §6 계약 절")
        lines.append("")
    others = [f"- {s} → {uid} 에서 다룬다" for uid, u in units.items() if uid != unit["id"] and u.get("planned", True) is not False for s in u.get("stories") or []]
    out_scope = [l for l in intents.sections(intent_text).get("2", []) if l.strip() and not l.startswith("(")]
    if out_scope or others:
        lines += ["### 범위 밖", "", *out_scope, *others, ""]
    keeps = keep_rows(folder)
    if keeps:
        lines += ["### 바뀌면 안 되는 동작(current-state §3)", "", "| ID | 동작 | 근거 | 지금 있는 시험 |", "|---|---|---|---|", *keeps, ""]
    if unit.get("kind") == "contract":
        lines += ["> 계약 Unit — design 의 §6 계약 절이 필수다. 이 계약을 쓰는 Unit 의 /hx-plan 은 이 이슈 design 승인 뒤에 한다.", ""]
    lines.append(END)
    return "\n".join(lines)


def run_from_unit(root: Path, target: str, key: str | None, dry_run: bool) -> dict:
    if "/" not in target:
        raise Stop("인자는 <Intent 키>/<U-n> 이다(예: INT-7/U-2)")
    ikey, uid = target.split("/", 1)
    folder = intents.find_folder(root, ikey)
    meta = intents.meta_of(root)
    gates = intents.gates_of(meta)
    notes = []
    if "intent" in gates:
        target_doc = folder / "intent.md" if (folder / "intent.md").is_file() else folder / "intent.json"
        if intents.gate_state(folder, "intent", target_doc, meta) != "valid":
            raise Stop(f"{ikey} 의 intent 게이트 승인이 없다(또는 승인 뒤 바뀌었다) — 사람이 관리 페이지 · harness-kit approve 로 승인한 뒤 다시(DS-R9)")
    else:
        notes.append("intent 게이트 없음 — 승인 검사를 건너뛴다")
    data = intents.read_json(folder / "units.json")
    if not isinstance(data, dict):
        raise Stop("units.json 이 없다 — /hx-intent 로 분해를 먼저 한다")
    units = {u["id"]: u for u in data.get("units") or [] if isinstance(u, dict) and isinstance(u.get("id"), str)}
    unit = units.get(uid)
    if not unit or unit.get("planned", True) is False:
        raise Stop(f"{ikey} 에 계획된 Unit {uid} 가 없다")
    if unit.get("issue"):
        try:
            path = find_issue(root, unit["issue"]).relative_to(root).as_posix()
        except ValueError:
            path = f"(이 체크아웃에 폴더 없음 — 이슈 {unit['issue']})"
        return {"action": "existing", "issue": unit["issue"], "path": path, "notes": notes}
    waiting = [d for d in unit.get("dependsOn") or [] if d in units and not units[d].get("issue")]
    if waiting:
        names = ", ".join(f"{d}({units[d].get('kind')})" for d in waiting)
        raise Stop(f"{names} 부터 — 의존 Unit 의 이슈를 먼저 만든다")
    modules = meta.get("modules") or []
    if "jira-workflow" in modules and not key:
        raise Stop("jira-workflow 모듈이 켜져 있다 — Jira 작업 항목을 만든 뒤 그 키를 --key 로 준다(DS-R13)")
    name, area = unit.get("name") or "", unit.get("area") or ""
    if dry_run:
        return {"action": "dry-run", "would": f"new-feature.sh {key or '--next'} {name} --area {area} --type feat", "notes": notes}
    args = ["bash", "scripts/new-feature.sh", key or "--next", name, "--area", area, "--type", "feat"]
    r = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise Stop(f"new-feature.sh 실패: {(r.stderr or r.stdout).strip().splitlines()[-1] if (r.stderr or r.stdout).strip() else r.returncode}")
    m = CREATED.search(r.stdout)
    if not m:
        raise Stop(f"new-feature.sh 출력에서 만든 경로를 찾지 못했다: {r.stdout.strip()[:200]}")
    req = root / m[1]
    issue_folder = req.parent if req.name == "requirements.md" else req
    req = issue_folder / "requirements.md"
    issue_key = intents.FOLDER.match(issue_folder.name)[1]
    link = link_of(folder)
    intent_text = "" if link is not None else (folder / "intent.md").read_text(encoding="utf-8")
    ihead = parse_frontmatter(intent_text) or {}
    key_of = {u: units[u].get("issue") for u in units if units[u].get("issue")}
    deps = [key_of[d] for d in unit.get("dependsOn") or [] if d in key_of]
    text = req.read_text(encoding="utf-8")
    text = update_frontmatter(text, {"intent": ikey, "unit": uid, "dependsOn": "[" + ", ".join(deps) + "]", "profile": str(ihead.get("profile") or ""), "risk": str(ihead.get("risk") or "")})
    lines = text.split("\n")
    at = next((i + 1 for i, l in enumerate(lines) if l.startswith("# ")), len(lines))
    text = "\n".join(lines[:at] + ["", block(folder, intent_text, unit, units, key_of, link), ""] + lines[at:])
    req.write_text(text, encoding="utf-8")
    unit["issue"] = issue_key
    (folder / "units.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"action": "created", "issue": issue_key, "path": req.relative_to(root).as_posix(), "branch": f"feat/{issue_folder.name}", "notes": notes}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="from_unit.py", description=__doc__)
    parser.add_argument("target")
    parser.add_argument("--key")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path.cwd())
    try:
        r = run_from_unit(root, args.target, args.key, args.dry_run)
    except Stop as stop:
        print(json.dumps({"error": str(stop)}, ensure_ascii=False) if args.json else f"✖ {stop}", file=sys.stdout if args.json else sys.stderr)
        return 3
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for n in r.get("notes", []):
            print(f"· {n}")
        if r["action"] == "existing":
            print(f"이미 있다: {r['issue']} — {r['path']}")
        elif r["action"] == "dry-run":
            print(f"(dry-run) {r['would']}")
        else:
            print(f"✔ {r['issue']} — {r['path']}\n다음: 브랜치 {r['branch']} · requirements 를 다듬고 사람 승인")
    return 0


if __name__ == "__main__":
    sys.exit(main())
