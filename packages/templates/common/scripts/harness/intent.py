#!/usr/bin/env python3
"""Intent 폴더 — 키 · 새로 만들기 · 다음 단계 판정 · 검사 · backlog 생성 구간(설계 08 §3.1~§3.5 · §3.8, HK-19 design §3).

    python3 scripts/harness/intent.py key
    python3 scripts/harness/intent.py new "<요약>" --name <kebab> [--kind feature]
    python3 scripts/harness/intent.py next <키|폴더> [--json]
    python3 scripts/harness/intent.py check <폴더> [--json]
    python3 scripts/harness/intent.py backlog <폴더>

판정 · 검사는 파일 상태만 본다. 모델을 부르지 않는다. 설계 세션(/hx-intent)이 next 가 정한 단계만 한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402
from harness.sdd_keys import name_problems  # noqa: E402

INTENTS = ".agents/docs/intents"
TEMPLATES = ".agents/docs/_spec-templates/intent"
PLANS_TEMPLATES = ".agents/docs/_spec-templates/plans"
FOLDER = re.compile(r"^([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-(.+)$")
INT_KEY = re.compile(r"^INT-([1-9][0-9]{0,5})$")
QUESTION_HEAD = re.compile(r"^## (Q-\d+) · (범위|보안|개인정보|UX|기술|운영) · 답할 직무: ([a-z][a-z0-9-]*)(?: · 막는 게이트: ([a-z]+))?$")
OPTION = re.compile(r"^- ([A-D])\. (.+?) — 영향: (.+)$")
RECOMMEND = re.compile(r"^- 권장: ([A-D]) — 근거: (.+)$")
ANSWER = re.compile(r"^- 답:(.*)$")
STORY = re.compile(r"^### (~~)?(S-\d+)(~~)?(?:\s+(.*))?$")
DOMAIN = re.compile(r"^- 도메인:\s*([a-z0-9-]+)")
CATEGORY = {"범위": 0, "보안": 1, "개인정보": 1, "UX": 2, "기술": 3, "운영": 4}
KINDS = ("product", "feature", "change", "refactor")
RE_KINDS = ("feature", "change", "refactor")
STATUSES = ("draft", "in-review", "approved", "superseded")
UNIT_KINDS = ("contract", "feature", "integration")
UNIT_ID = re.compile(r"^U-\d+$")
KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
THRESHOLDS = {"stories": 5, "domains": 2, "userTypes": 3, "integrations": 3}
DEFAULT_GATES = ["codebase", "intent", "plans", "requirements", "design", "tasks", "mr", "done", "deploy"]
OPEN_LIMIT = 5
BACKLOG_BEGIN = "<!-- BACKLOG:BEGIN"
BACKLOG_END = "<!-- BACKLOG:END -->"
PLAN_FILES = ("requirements-doc.md", "screens/index.md", "design-plan.md", "backlog.md")


# ── 읽기 ─────────────────────────────────────────────────────────────────────


def harness_root(start: Path) -> Path:
    for folder in (start.resolve(), *start.resolve().parents):
        if (folder / ".agents/harness-kit.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return start.resolve()


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def meta_of(root: Path) -> dict:
    data = read_json(root / ".agents/harness-kit.json")
    return data if isinstance(data, dict) else {}


def gates_of(meta: dict) -> list[str]:
    flow = meta.get("flow") if isinstance(meta.get("flow"), dict) else {}
    gates = flow.get("gates")
    return [g for g in gates if isinstance(g, str)] if isinstance(gates, list) else list(DEFAULT_GATES)


def sha(path: Path) -> str | None:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def front(path: Path) -> dict:
    try:
        return parse_frontmatter(path.read_text(encoding="utf-8")) or {}
    except (OSError, ValueError):
        return {}


def find_folder(root: Path, target: str) -> Path:
    p = Path(target)
    if (root / p / "intent.md").is_file() or (root / p / "intent.json").is_file():
        return (root / p).resolve()
    if p.is_absolute() and p.is_dir():
        return p.resolve()
    base = root / INTENTS
    found = [d for d in sorted(base.iterdir()) if d.is_dir() and FOLDER.match(d.name) and FOLDER.match(d.name)[1] == target] if base.is_dir() else []
    if len(found) != 1:
        raise SystemExit(f"Intent 를 못 찾았다(또는 둘 이상이다): {target}")
    return found[0]


def parse_questions(text: str) -> dict:
    """questions.md → 머리 · 질문 목록 · 형식 문제(설계 08 §3.3)."""
    head = parse_frontmatter(text) or {}
    questions, problems, current = [], [], None
    for number, line in enumerate(text.splitlines(), 1):
        if line.startswith("## "):
            m = QUESTION_HEAD.match(line)
            if not m:
                problems.append(f"questions.md:{number}: 질문 제목 형식이 아니다 — ## Q-<n> · <분류> · 답할 직무: <그룹> · 막는 게이트: <게이트>")
                current = None
                continue
            current = {"id": m[1], "category": m[2], "role": m[3], "gate": m[4], "options": [], "recommend": [], "answer": None, "line": number}
            questions.append(current)
            continue
        if current is None:
            continue
        if (m := OPTION.match(line)):
            current["options"].append(m[1])
        elif (m := RECOMMEND.match(line)):
            current["recommend"].append(m[1])
        elif (m := ANSWER.match(line)):
            current["answer"] = m[1].strip() or None
    return {"head": head, "questions": questions, "problems": problems}


def question_problems(doc: dict) -> list[str]:
    out = list(doc["problems"])
    ids = [q["id"] for q in doc["questions"]]
    for q in doc["questions"]:
        where = f"questions.md:{q['line']} {q['id']}"
        if len(q["options"]) < 2 or len(q["options"]) > 4:
            out.append(f"{where}: 선택지는 2~4개다(지금 {len(q['options'])}개)")
        if len(q["options"]) != len(set(q["options"])):
            out.append(f"{where}: 선택지 글자가 겹친다")
        if len(q["recommend"]) != 1:
            out.append(f"{where}: 권장 줄은 정확히 1개다(지금 {len(q['recommend'])}개)")
        elif q["recommend"][0] not in q["options"]:
            out.append(f"{where}: 권장 {q['recommend'][0]} 가 선택지에 없다")
    if len(ids) != len(set(ids)):
        out.append("questions.md: 질문 번호가 겹친다")
    open_q = [q for q in doc["questions"] if q["answer"] is None]
    if len(open_q) > OPEN_LIMIT:
        out.append(f"questions.md: 열린 질문은 한 회차 {OPEN_LIMIT}개까지다(지금 {len(open_q)}개)")
    order = [CATEGORY[q["category"]] for q in open_q]
    if order != sorted(order):
        out.append("questions.md: 열린 질문은 범위 > 보안 · 개인정보 > UX > 기술 > 운영 순서로 놓는다")
    return out


def sections(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        m = re.match(r"^## (\d+)\. ", line)
        if m:
            current = m[1]
            out[current] = []
        elif current is not None:
            out[current].append(line)
    return out


def table_rows(lines: list[str]) -> list[list[str]]:
    rows = [line for line in lines if line.strip().startswith("|")]
    body = [r for r in rows[1:] if not re.match(r"^\|\s*-", r.strip())] if rows else []
    return [[c.strip() for c in r.strip().strip("|").split("|")] for r in body if r.strip().strip("|").strip()]


def stories_of(text: str) -> list[dict]:
    out, current = [], None
    for line in text.splitlines():
        m = STORY.match(line)
        if m:
            current = {"id": m[2], "removed": bool(m[1] and m[3]), "domain": None}
            out.append(current)
        elif current is not None and (d := DOMAIN.match(line)):
            current["domain"] = d[1]
        elif line.startswith("## "):
            current = None
    return out


def counts_of(intent_text: str) -> dict:
    sec = sections(intent_text)
    live = [s for s in stories_of(intent_text) if not s["removed"]]
    return {
        "stories": len(live),
        "domains": len({s["domain"] for s in live if s["domain"]}),
        "userTypes": len(table_rows(sec.get("5", []))),
        "integrations": len(table_rows(sec.get("9", []))),
    }


def split_reasons(c: dict) -> list[str]:
    return [f"{k}>={v}" for k, v in THRESHOLDS.items() if c[k] >= v]


# ── 검사 ─────────────────────────────────────────────────────────────────────


def cycle_of(units: dict[str, dict]) -> list[str] | None:
    state: dict[str, int] = {}
    stack: list[str] = []

    def visit(u: str) -> list[str] | None:
        state[u] = 1
        stack.append(u)
        for d in units[u].get("dependsOn") or []:
            if d not in units:
                continue
            if state.get(d) == 1:
                return stack[stack.index(d):] + [d]
            if state.get(d) is None and (found := visit(d)):
                return found
        stack.pop()
        state[u] = 2
        return None

    for u in units:
        if state.get(u) is None and (found := visit(u)):
            return found
    return None


def aidlc_stories(folder: Path) -> list[str] | None:
    """AI-DLC 를 켠 Intent(intent.json 만 있음)의 스토리 ID. 그 밖이면 None(10 §3.2 어댑터가 intent.json 에 적는다)."""
    if not ((folder / "intent.json").is_file() and not (folder / "intent.md").is_file()):
        return None
    link = read_json(folder / "intent.json")
    items = link.get("stories") if isinstance(link, dict) and isinstance(link.get("stories"), list) else []
    return [s["id"] for s in items if isinstance(s, dict) and isinstance(s.get("id"), str)]


def units_problems(folder: Path, data, intent_text: str, key: str) -> list[str]:
    out: list[str] = []
    if not isinstance(data, dict) or data.get("schema") != "harness-kit.units/v1":
        return ["units.json: schema 는 harness-kit.units/v1"]
    if (data.get("intent") or {}).get("key") != key:
        out.append(f"units.json: intent.key 가 폴더 키 {key} 와 다르다")
    units = data.get("units") if isinstance(data.get("units"), list) else []
    seen: dict[str, dict] = {}
    for u in units:
        uid = u.get("id") if isinstance(u, dict) else None
        if not isinstance(uid, str) or not UNIT_ID.match(uid):
            out.append(f"units.json: Unit id 는 U-<n>: {uid!r}")
            continue
        if uid in seen:
            out.append(f"units.json: {uid} 가 두 번 나온다")
        seen[uid] = u
        if u.get("kind") not in UNIT_KINDS:
            out.append(f"units.json: {uid} kind 는 contract · feature · integration")
        if not isinstance(u.get("area"), str) or not KEBAB.match(u.get("area") or ""):
            out.append(f"units.json: {uid} area 는 영문 kebab-case")
    planned = {k: v for k, v in seen.items() if v.get("planned", True) is not False}
    for uid, u in planned.items():
        for d in u.get("dependsOn") or []:
            if d not in seen:
                out.append(f"units.json: {uid} 가 없는 Unit {d} 에 의존한다")
            elif d not in planned:
                out.append(f"units.json: {uid} 가 계획에서 뺀 Unit {d} 에 의존한다")
            elif u.get("kind") == "contract" and seen[d].get("kind") == "feature":
                out.append(f"units.json: 계약 Unit {uid} 는 기능 Unit {d} 에 의존하지 않는다")
        # DS-R6: 받는 계약은 그 계약을 주는 contract Unit 에 의존해야 한다
        for c in u.get("consumes") or []:
            providers = [p for p, pu in planned.items() if c in (pu.get("provides") or [])]
            if not providers:
                out.append(f"units.json: {uid} 가 받는 {c} 를 주는 Unit 이 없다")
            elif not any(planned[p].get("kind") == "contract" for p in providers):
                out.append(f"units.json: {c} 는 kind: contract Unit 이 준다(DS-R6)")
            elif not any(p in (u.get("dependsOn") or []) for p in providers):
                out.append(f"units.json: {uid} 는 {c} 를 주는 계약 Unit {providers[0]} 를 dependsOn 에 넣는다(DS-R6)")
    cyc = cycle_of(planned)
    if cyc:
        out.append("units.json: 의존 고리 " + " → ".join(cyc) + "(DS-R7)")
    # DS-R8: 스토리 배정
    external = aidlc_stories(folder)
    live = external if external is not None else [s["id"] for s in stories_of(intent_text) if not s["removed"]]
    where: dict[str, list[str]] = {}
    for uid, u in planned.items():
        for s in u.get("stories") or []:
            where.setdefault(s, []).append(uid)
    unassigned = {x.get("story"): x.get("reason") for x in data.get("unassigned") or [] if isinstance(x, dict)}
    for s in live:
        units_of = where.get(s, [])
        if len(units_of) > 1:
            out.append(f"units.json: 스토리 {s} 가 Unit 여럿에 있다({', '.join(units_of)}) — 하나에만 둔다(DS-R8)")
        if not units_of and s not in unassigned:
            out.append(f"units.json: 스토리 {s} 가 어느 Unit 에도 없다 — Unit 에 두거나 unassigned 에 이유와 함께(DS-R8)")
        if not units_of and s in unassigned and not unassigned[s]:
            out.append(f"units.json: unassigned {s} 에 이유가 없다")
    for s in where:
        if s not in live:
            out.append(f"units.json: 없는(또는 뺀) 스토리 {s} 가 Unit 에 있다")
    if external is not None:
        return out  # DS-R5 분해 판정은 AI-DLC 가 한다(intent.md 가 없다)
    # DS-R5: 분해 판정
    c = counts_of(intent_text)
    reasons = split_reasons(c)
    dec = data.get("decomposition") if isinstance(data.get("decomposition"), dict) else {}
    if dec and bool(dec.get("split")) != bool(reasons):
        out.append(f"units.json: decomposition.split 이 {bool(reasons)} 여야 한다(기준 {', '.join(reasons) or '없음'}, DS-R5)")
    if not reasons and len(planned) > 1:
        out.append("units.json: 나누는 기준에 하나도 맞지 않으면 Unit 은 하나다(DS-R5)")
    table = {r[0]: r[1] for r in table_rows(sections(intent_text).get("10", [])) if len(r) >= 2}
    for label, k in (("스토리", "stories"), ("도메인", "domains"), ("사용자 유형", "userTypes"), ("외부 통합", "integrations")):
        if label in table and table[label] != str(c[k]):
            out.append(f"intent.md §10: {label} 값 {table[label]} 이 실제 {c[k]} 와 다르다(DS-R5)")
    return out


def check(folder: Path) -> dict:
    root = harness_root(folder)
    m = FOLDER.match(folder.name)
    problems: list[str] = []
    notes: list[str] = []
    if not m:
        return {"ok": False, "problems": [f"폴더 이름은 <Intent 키>-<이름>: {folder.name}"], "notes": []}
    key = m[1]
    if (folder / "intent.json").is_file() and not (folder / "intent.md").is_file():
        notes.append("intent.json(AI-DLC) — 문서 검사는 AI-DLC 가 맡는다. units.json 만 본다")
        intent_text = ""
    else:
        try:
            intent_text = (folder / "intent.md").read_text(encoding="utf-8")
        except OSError:
            return {"ok": False, "problems": ["intent.md 가 없다"], "notes": []}
        head = parse_frontmatter(intent_text) or {}
        if head.get("id") != key:
            problems.append(f"intent.md: id {head.get('id')!r} 가 폴더 키 {key} 와 다르다")
        if head.get("status") not in STATUSES:
            problems.append(f"intent.md: status 는 {' · '.join(STATUSES)}")
        if head.get("kind") not in KINDS:
            problems.append(f"intent.md: kind 는 {' · '.join(KINDS)}")
        if head.get("risk") not in ("low", "medium", "high"):
            problems.append("intent.md: risk 는 low · medium · high")
        for number, line in enumerate(intent_text.splitlines(), 1):
            if "[NEEDS CLARIFICATION" in line:
                notes.append(f"intent.md:{number}: [NEEDS CLARIFICATION — intent 게이트 앞 조건")
    qpath = folder / "questions.md"
    if qpath.is_file():
        problems += question_problems(parse_questions(qpath.read_text(encoding="utf-8")))
    if (folder / "units.json").is_file():
        problems += units_problems(folder, read_json(folder / "units.json"), intent_text, key)
    return {"ok": not problems, "folder": str(folder.relative_to(root)) if folder.is_relative_to(root) else str(folder), "problems": problems, "notes": notes}


# ── 다음 단계(08 §3.1 표, DS-R2) ─────────────────────────────────────────────


def gate_state(folder: Path, gate: str, target: Path, meta: dict) -> str:
    try:
        entries = approvals.parse((folder / "approvals.md").read_text(encoding="utf-8"))["entries"]
    except (OSError, ValueError, KeyError, TypeError):
        return "none"
    data = target.read_bytes() if target.is_file() else None
    return approvals.approval_state(entries, gate, approvals.approval_sha(data) if data is not None else None, approvals.policy_of(meta))


def next_step(folder: Path) -> dict:
    root = harness_root(folder)
    meta = meta_of(root)
    flow = meta.get("flow") if isinstance(meta.get("flow"), dict) else {}
    key = FOLDER.match(folder.name)[1]
    if flow.get("design") == "aidlc":
        return {"step": "aidlc", "reason": "flow.design = aidlc — 설계 단계는 /aidlc 가 맡는다. 끝나면 npx harness-kit sync aidlc", "blocking": []}
    gates = gates_of(meta)
    intent_path = folder / "intent.md"
    head = front(intent_path)
    kind = head.get("kind")
    text = intent_path.read_text(encoding="utf-8") if intent_path.is_file() else ""
    qtext = (folder / "questions.md").read_text(encoding="utf-8") if (folder / "questions.md").is_file() else ""
    qdoc = parse_questions(qtext)
    open_by_gate: dict[str, list[str]] = {}
    for q in qdoc["questions"]:
        if q["answer"] is None:
            open_by_gate.setdefault(q["gate"] or "-", []).append(q["id"])
    stories = [s for s in stories_of(text) if not s["removed"]]
    if kind in RE_KINDS:
        cs = folder / "current-state.md"
        if not cs.is_file():
            return {"step": "reverse-engineer", "reason": "기존 코드 위의 일이다 — codebase 모델과 current-state.md 를 먼저 만든다(DS-R20)", "blocking": []}
        if "codebase" in gates and gate_state(folder, "codebase", cs, meta) != "valid":
            if open_by_gate.get("codebase"):
                return {"step": "answers-wait", "reason": f"질문 {len(open_by_gate['codebase'])}건 답 대기(막는 게이트 codebase)", "blocking": open_by_gate["codebase"]}
            return {"step": "codebase-approval-wait", "reason": "codebase 게이트 승인 대기 — current-state.md 를 in-review 로 올린다. 스토리를 쓰지 않는다(DS-R21)", "blocking": []}
    if open_by_gate.get("intent"):
        return {"step": "answers-wait", "reason": f"질문 {len(open_by_gate['intent'])}건 답 대기(막는 게이트 intent) — 관리 페이지 질문 화면 · harness-kit answer", "blocking": open_by_gate["intent"]}
    answered = [q for q in qdoc["questions"] if q["answer"]]
    qsha = hashlib.sha256(qtext.encode("utf-8")).hexdigest() if qtext else None
    if answered and head.get("answersSha256") != qsha:
        return {"step": "apply-answers", "reason": "답이 들어왔다 — intent.md 에 반영하고 머리 answersSha256 을 questions.md sha256 으로 바꾼다. 새 질문이 필요하면 다음 회차", "blocking": [], "answersSha256": qsha}
    if not stories:
        return {"step": "draft", "reason": "intent.md §1~§12 를 채우고 1회차 질문을 낸다(접수 원문 · 첨부를 근거로)", "blocking": []}
    units_path = folder / "units.json"
    if not units_path.is_file():
        return {"step": "decompose", "reason": f"분해 판정 → units.json · intent.md §10(기준 {', '.join(split_reasons(counts_of(text))) or '없음 — Unit 하나'})", "blocking": []}
    if "intent" in gates and gate_state(folder, "intent", intent_path, meta) != "valid":
        return {"step": "intent-approval-wait", "reason": "intent 게이트 승인 대기 — intent.md 를 in-review 로 올린다", "blocking": []}
    plans = folder / "plans"
    have = [p for p in PLAN_FILES if (plans / p).is_file()]
    if not have:
        return {"step": "plans", "reason": "기획물을 만든다 — /hx-plans doc · screen · design · backlog", "blocking": []}
    if "plans" in gates and gate_state(folder, "plans", plans / "screens/index.md" if (plans / "screens/index.md").is_file() else plans / have[0], meta) != "valid":
        missing = [p for p in PLAN_FILES if p not in have]
        return {"step": "plans-approval-wait", "reason": "plans 게이트 승인 대기" + (f"(아직 없는 기획물: {', '.join(missing)})" if missing else ""), "blocking": missing}
    units = (read_json(units_path) or {}).get("units") or []
    todo = sorted((u for u in units if isinstance(u, dict) and u.get("planned", True) is not False and not u.get("issue")), key=lambda u: (u.get("order") or 999, u.get("id")))
    if not todo:
        return {"step": "done", "reason": "모든 Unit 에 이슈가 있다 — 이슈 SDD 로 진행한다", "blocking": []}
    return {"step": "specify", "reason": "의존 순서로 /hx-specify --from-unit " + " · ".join(f"{key}/{u['id']}" for u in todo), "blocking": [], "units": [u["id"] for u in todo]}


# ── 키 · 새로 만들기 ─────────────────────────────────────────────────────────


def git(root: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", "--no-optional-locks", *args], cwd=root, capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout if r.returncode == 0 else None


def next_key(root: Path) -> str:
    meta = meta_of(root)
    numbers = []
    base = root / INTENTS
    if base.is_dir():
        numbers += [int(INT_KEY.match(FOLDER.match(d.name)[1])[1]) for d in base.iterdir() if FOLDER.match(d.name) and INT_KEY.match(FOLDER.match(d.name)[1])]
    branch = ((meta.get("git") or {}).get("base") if isinstance(meta.get("git"), dict) else None) or "develop"
    listed = git(root, "ls-tree", "-d", "--name-only", f"{branch}:{INTENTS}") or ""
    for name in listed.split():
        m = FOLDER.match(name)
        if m and INT_KEY.match(m[1]):
            numbers.append(int(INT_KEY.match(m[1])[1]))
    return f"INT-{max(numbers, default=0) + 1}"


def fill(text: str, values: dict) -> str:
    for k, v in values.items():
        text = text.replace("{{" + k + "}}", v)
    return text


def new_intent(root: Path, title: str, name: str, kind: str, key: str | None) -> Path:
    problems = name_problems(name)
    if problems:
        raise SystemExit(f"이름 {name!r}: " + " · ".join(problems))
    if kind not in KINDS:
        raise SystemExit(f"kind 는 {' · '.join(KINDS)}(bug 는 intake 가 이슈로 보낸다)")
    modules = meta_of(root).get("modules") or []
    if key is None and "jira-workflow" in modules:
        raise SystemExit("jira-workflow 모듈이 켜져 있다 — Intent 키는 Jira 에픽 키다. --key <에픽 키> 로 준다")
    key = key or next_key(root)
    if not FOLDER.match(f"{key}-{name}"):
        raise SystemExit(f"키 형식이 아니다: {key}")
    folder = root / INTENTS / f"{key}-{name}"
    if folder.exists():
        raise SystemExit(f"이미 있다: {folder.relative_to(root)}")
    values = {"INTENT_KEY": key, "TITLE": title.replace("\n", " ").strip(), "KIND": kind, "CREATED": date.today().isoformat()}
    folder.mkdir(parents=True)
    for template, out in (("_template.md", "intent.md"), ("questions.md", "questions.md")):
        src = root / TEMPLATES / template
        if not src.is_file():
            raise SystemExit(f"템플릿이 없다: {src.relative_to(root)} — harness-kit repair")
        (folder / out).write_text(fill(src.read_text(encoding="utf-8"), values), encoding="utf-8")
    return folder


# ── backlog 생성 구간(08 §3.8, DS-R17) ───────────────────────────────────────


def issue_stage(root: Path, key: str | None) -> str:
    if not key:
        return "백로그"
    try:
        from harness import sdd_board
        items = sdd_board.board_json(root)["issues"]
    except Exception:  # noqa: BLE001 — 보드를 못 읽으면 모름
        return "?"
    found = next((i for i in items if i["key"] == key), None)
    if not found:
        return "이슈 폴더 없음"
    if found.get("tasks"):
        return "완료" if found["tasks"] == "completed" else f"tasks {found['tasks']}"
    if found.get("design"):
        return "design 승인" if found["design"] == "approved" else f"design {found['design']}"
    return f"requirements {found.get('requirements') or '—'}"


def backlog(folder: Path) -> int:
    root = harness_root(folder)
    meta = meta_of(root)
    roles = meta.get("roles") if isinstance(meta.get("roles"), dict) else {}
    implement = (roles.get("implement") or {}).get("harness") if isinstance(roles.get("implement"), dict) else None
    data = read_json(folder / "units.json") or {}
    units = sorted((u for u in data.get("units") or [] if isinstance(u, dict) and u.get("planned", True) is not False), key=lambda u: (u.get("order") or 999, u.get("id")))
    rows = ["| 순서 | Unit | 종류 | 이슈 | 단계 | 의존 | 맡은 하네스 |", "|---|---|---|---|---|---|---|"]
    for u in units:
        rows.append(f"| {u.get('order') or '—'} | {u['id']} {u.get('title') or u.get('name') or ''} | {u.get('kind')} | {u.get('issue') or '—'} | {issue_stage(root, u.get('issue'))} | {', '.join(u.get('dependsOn') or []) or '—'} | {(implement or '—') if u.get('issue') else '—'} |")
    path = folder / "plans/backlog.md"
    if not path.is_file():
        src = root / PLANS_TEMPLATES / "backlog.md"
        if not src.is_file():
            raise SystemExit("backlog 템플릿이 없다 — harness-kit repair")
        path.parent.mkdir(parents=True, exist_ok=True)
        head = front(folder / "intent.md")
        path.write_text(fill(src.read_text(encoding="utf-8"), {"INTENT_KEY": FOLDER.match(folder.name)[1], "TITLE": str(head.get("title") or ""), "HARNESS": "template", "CREATED": date.today().isoformat()}), encoding="utf-8")
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    begin = next((i for i, l in enumerate(lines) if l.startswith(BACKLOG_BEGIN)), None)
    end = next((i for i, l in enumerate(lines) if l.startswith(BACKLOG_END)), None)
    if begin is None or end is None or end < begin:
        raise SystemExit("plans/backlog.md 에 BACKLOG:BEGIN … BACKLOG:END 구간이 없다")
    new = "\n".join(lines[: begin + 1] + rows + lines[end:])
    if new != text:
        path.write_text(new, encoding="utf-8")
    return len(rows) - 2


# ── 입구 ─────────────────────────────────────────────────────────────────────


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="intent.py", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("key")
    p = sub.add_parser("new")
    p.add_argument("title")
    p.add_argument("--name", required=True)
    p.add_argument("--kind", default="feature")
    p.add_argument("--key")
    for name in ("next", "check"):
        q = sub.add_parser(name)
        q.add_argument("target")
        q.add_argument("--json", action="store_true")
    b = sub.add_parser("backlog")
    b.add_argument("target")
    args = parser.parse_args(argv)
    root = harness_root(Path.cwd())
    if args.cmd == "key":
        print(next_key(root))
        return 0
    if args.cmd == "new":
        folder = new_intent(root, args.title, args.name, args.kind, args.key)
        print(folder.relative_to(root).as_posix())
        return 0
    folder = find_folder(root, args.target)
    if args.cmd == "next":
        r = next_step(folder)
        print(json.dumps(r, ensure_ascii=False) if args.json else f"{r['step']}: {r['reason']}")
        return 0
    if args.cmd == "check":
        r = check(folder)
        if args.json:
            print(json.dumps(r, ensure_ascii=False))
        else:
            for line in r["problems"]:
                print(f"✖ {line}")
            for line in r["notes"]:
                print(f"· {line}")
            print("Intent 검사 통과" if r["ok"] else f"Intent 검사 실패 {len(r['problems'])}건")
        return 0 if r["ok"] else 1
    print(f"backlog 생성 구간: Unit {backlog(folder)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
