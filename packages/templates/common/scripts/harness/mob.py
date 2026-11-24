#!/usr/bin/env python3
"""몹 정리(Mob Elaboration) 세션 열기 · 다음 회차 · 닫기(설계 08 §3.14 · DS-R24, HK-19 design §10).

    python3 scripts/harness/mob.py start <Intent 키> --attendees a@x,b@y [--timebox 30] [--json]
    python3 scripts/harness/mob.py next <Intent 키> [--json]
    python3 scripts/harness/mob.py close <Intent 키> [--json]      # end 도 같다
    python3 scripts/harness/mob.py status <Intent 키> [--json]

- 세션 기록은 Intent 폴더의 `mob.json` 이다(사람 · 관리 페이지만 쓴다. 에이전트는 쓰지 않는다 — protect_approvals 훅).
  설계 08 은 questions.md 머리를 적었지만, 머리 파서가 한 줄 `키: 값` 만 읽어 JSON 파일로 둔다(HK-19 design §10).
- start: 진행자는 이 컴퓨터의 git 사용자다. 열린 질문의 `답할 직무` 그룹과 approvers.intent 를 참석자가 덮지 못하면 그룹 이름을 내고 거부(exit 3).
- next: 지금 회차를 닫고 다음 회차를 연다. 설계 세션에 answers-ready 요청은 **사람이 고를 때만** 보낸다(자동 요청 없음).
- 모델을 부르지 않는다.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness import intent as intents  # noqa: E402

SCHEMA = "harness-kit.mob/v1"
EMAIL = re.compile(r"^[^\s@,]+@[^\s@,]+$")
DEFAULT_TIMEBOX = 30
DEFERRED_WARN = 4


class Stop(Exception):
    """멈추고 이유를 낸다(exit 3)."""


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def git_email(root: Path) -> str | None:
    r = subprocess.run(["git", "config", "user.email"], cwd=root, capture_output=True, text=True, check=False)
    return r.stdout.strip() or None


def read(folder: Path) -> dict | None:
    data = intents.read_json(folder / "mob.json")
    return data if isinstance(data, dict) and data.get("schema") == SCHEMA else None


def write(folder: Path, data: dict) -> None:
    (folder / "mob.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_open(session: dict | None) -> bool:
    return bool(session) and not session.get("closedAt")


def questions(folder: Path) -> dict:
    path = folder / "questions.md"
    return intents.parse_questions(path.read_text(encoding="utf-8")) if path.is_file() else {"head": {}, "questions": [], "problems": []}


def group_of(email: str, groups: dict) -> str | None:
    hits = [name for name, members in groups.items() if isinstance(members, list) and any(str(m).lower() == email.lower() for m in members)]
    return hits[0] if hits else None


def missing_groups(meta: dict, attendees: list[str], doc: dict) -> list[str]:
    """08 §3.14: 열린 질문의 답할 직무 그룹마다 1명 이상, approvers.intent 를 만족하는 1명 이상."""
    groups = meta.get("groups") if isinstance(meta.get("groups"), dict) else {}
    needed = sorted({q["role"] for q in doc["questions"] if q["answer"] is None})
    out = []
    for name in needed:
        members = groups.get(name)
        if isinstance(members, list) and not any(str(m).lower() == a.lower() for m in members for a in attendees):
            out.append(name)
    policy = approvals.policy_of(meta)
    if not any(approvals.allowed(a, "intent", policy) for a in attendees):
        out.append("approvers.intent")
    return out


def start(root: Path, target: str, attendees: list[str], timebox: int) -> dict:
    folder = intents.find_folder(root, target)
    if is_open(read(folder)):
        raise Stop("몹 세션이 이미 열려 있다 — mob close 로 닫은 뒤 연다")
    bad = [a for a in attendees if not EMAIL.match(a)]
    if not attendees or bad:
        raise Stop(f"참석자는 email 목록이다(쉼표로): {', '.join(bad) or '없음'}")
    facilitator = git_email(root)
    if not facilitator:
        raise Stop("git config user.email 이 비었다 — 진행자는 이 컴퓨터의 git 사용자다")
    meta = intents.meta_of(root)
    doc = questions(folder)
    missing = missing_groups(meta, attendees, doc)
    if missing:
        raise Stop(f"참석자가 덮지 못한 그룹: {', '.join(missing)} — 그 그룹 사람을 --attendees 에 더한다")
    groups = meta.get("groups") if isinstance(meta.get("groups"), dict) else {}
    try:
        round_no = int(doc["head"].get("round") or 1)
    except (TypeError, ValueError):
        round_no = 1
    at = now()
    session = {"schema": SCHEMA, "intent": intents.FOLDER.match(folder.name)[1], "at": at, "facilitator": facilitator,
               "attendees": [{"email": a, "group": group_of(a, groups)} for a in dict.fromkeys(attendees)],
               "timeboxMin": timebox, "rounds": [{"round": round_no, "startedAt": at, "endedAt": None}], "closedAt": None}
    write(folder, session)
    return {"action": "start", "path": f"{folder.relative_to(root).as_posix()}/mob.json", "session": session}


def minutes(r: dict) -> float | None:
    try:
        return (datetime.fromisoformat(r["endedAt"]) - datetime.fromisoformat(r["startedAt"])).total_seconds() / 60
    except (KeyError, TypeError, ValueError):
        return None


def summary(folder: Path, session: dict) -> dict:
    over = [r["round"] for r in session.get("rounds") or [] if (m := minutes(r)) is not None and m > session.get("timeboxMin", DEFAULT_TIMEBOX)]
    warnings = []
    deferred = intents.table_rows(intents.sections((folder / "intent.md").read_text(encoding="utf-8")).get("11", [])) if (folder / "intent.md").is_file() else []
    if len(deferred) >= DEFERRED_WARN:
        warnings.append(f"§11 로 미룬 결정이 {len(deferred)}건이다 — 회의가 형식만 남았는지 본다")
    text = (folder / "questions.md").read_text(encoding="utf-8") if (folder / "questions.md").is_file() else ""
    answered = [q for q in intents.parse_questions(text)["questions"] if q["answer"]]
    if answered and all(q["answer"].split(" ")[0] in q["recommend"] for q in answered) and "- 메모:" not in text and "- 의견:" not in text:
        warnings.append("답이 모두 권장안과 같고 메모 · 의견이 0건이다")
    return {"overTimebox": over, "warnings": warnings}


def advance(root: Path, target: str, close: bool) -> dict:
    folder = intents.find_folder(root, target)
    session = read(folder)
    if not is_open(session):
        raise Stop("열린 몹 세션이 없다 — mob start 로 연다")
    at = now()
    rounds = session.get("rounds") or []
    if rounds and not rounds[-1].get("endedAt"):
        rounds[-1]["endedAt"] = at
    ended = rounds[-1]["round"] if rounds else 0
    if close:
        session["closedAt"] = at
    else:
        rounds.append({"round": ended + 1, "startedAt": at, "endedAt": None})
    session["rounds"] = rounds
    write(folder, session)
    rel = folder.relative_to(root).as_posix()
    key = session["intent"]
    out = {"action": "close" if close else "next", "path": f"{rel}/mob.json", "ended": ended, "session": session, **summary(folder, session)}
    out["suggest"] = f"npx harness-kit dispatch --to {key}:design --kind answers-ready --path {rel}/questions.md"
    return out


def status(root: Path, target: str) -> dict:
    folder = intents.find_folder(root, target)
    session = read(folder)
    return {"open": is_open(session), "session": session, **(summary(folder, session) if session else {"overTimebox": [], "warnings": []})}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="mob.py", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("start")
    s.add_argument("target")
    s.add_argument("--attendees", required=True)
    s.add_argument("--timebox", type=int, default=DEFAULT_TIMEBOX)
    s.add_argument("--json", action="store_true")
    for name in ("next", "close", "end", "status"):
        q = sub.add_parser(name)
        q.add_argument("target")
        q.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path.cwd())
    try:
        if args.cmd == "start":
            r = start(root, args.target, [a.strip() for a in args.attendees.split(",") if a.strip()], max(args.timebox, 1))
        elif args.cmd == "status":
            r = status(root, args.target)
        else:
            r = advance(root, args.target, close=args.cmd in ("close", "end"))
    except Stop as stop:
        print(json.dumps({"error": str(stop)}, ensure_ascii=False) if args.json else f"✖ {stop}", file=sys.stdout if args.json else sys.stderr)
        return 3
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
        return 0
    if args.cmd == "start":
        print(f"✔ 몹 세션을 열었다: {r['path']} · 진행자 {r['session']['facilitator']} · 참석 {len(r['session']['attendees'])}명 · 회차 {r['session']['rounds'][0]['round']}")
    elif args.cmd == "status":
        print("열린 몹 세션 있음" if r["open"] else "열린 몹 세션 없음")
    else:
        print(f"✔ 회차 {r['ended']} 을 닫았다" + (" · 세션을 닫았다" if r["action"] == "close" else ""))
        print(f"설계 세션에 답 반영을 요청하려면 사람이 고른다: {r['suggest']}")
    for w in r.get("warnings", []):
        print(f"⚠ {w}")
    if r.get("overTimebox"):
        print(f"⚠ 시간 상자를 넘은 회차: {', '.join(map(str, r['overTimebox']))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
