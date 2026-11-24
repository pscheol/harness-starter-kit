#!/usr/bin/env python3
"""Intent 폴더 게이트(codebase · plans)의 승인 대상 파일과 앞 조건(설계 08 §3.6 표 · §3.13, HK-19 design §5 · §7).

    python3 scripts/harness/intent_gate.py <Intent 키|폴더> codebase|plans [--json]

관리 페이지 승인 API(=knots-sync approve)가 부른다. 출력 {gate, folder, files[{name, path}], reasons[], stale[]}.
reasons 가 있으면 422 gate_precondition, stale 이 있으면 422 model_stale(codebase 만). 모델을 부르지 않는다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import intent as intents  # noqa: E402
from harness import plan_check, wireframe_check  # noqa: E402
from harness.codebase_check import run_gate as codebase_gate  # noqa: E402


def plans_gate(root: Path, target: str) -> dict:
    folder = intents.find_folder(root, target)
    rel = folder.relative_to(root).as_posix()
    plans = folder / "plans"
    files = [{"name": f"plans/{p}", "path": f"{rel}/plans/{p}"} for p in intents.PLAN_FILES if (plans / p).is_file()]
    screens = sorted((plans / "screens").glob("*.html")) if (plans / "screens").is_dir() else []
    files += [{"name": f"plans/screens/{s.name}", "path": f"{rel}/plans/screens/{s.name}"} for s in screens if not s.name.startswith("_")]
    reasons = [] if files else ["plans/ 에 기획물이 없다 — /kns-plans 로 만든다"]
    reasons += plan_check.problems(plans) if plans.is_dir() else []
    reasons += [p for s in screens if not s.name.startswith("_") for p in wireframe_check.problems(s)]
    qpath = folder / "questions.md"
    if qpath.is_file():
        open_q = [q["id"] for q in intents.parse_questions(qpath.read_text(encoding="utf-8"))["questions"] if q["answer"] is None and q["gate"] == "plans"]
        if open_q:
            reasons.append(f"막는 게이트가 plans 인 열린 질문 {len(open_q)}건({', '.join(open_q)})")
    return {"reasons": reasons, "stale": [], "files": files, "folder": rel}


def run(root: Path, target: str, gate: str) -> dict:
    r = codebase_gate(root, target) if gate == "codebase" else plans_gate(root, target)
    return {"gate": gate, **r}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="intent_gate.py", description=__doc__)
    parser.add_argument("target")
    parser.add_argument("gate", choices=("codebase", "plans"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    r = run(intents.harness_root(Path.cwd()), args.target, args.gate)
    if args.json:
        print(json.dumps(r, ensure_ascii=False))
    else:
        for f in r["files"]:
            print(f"· {f['path']}")
        for line in r["reasons"] + [f"오래됨: {s['path']} — {s['reason']}" for s in r["stale"]]:
            print(f"✖ {line}")
    return 0 if not r["reasons"] and not r["stale"] else 1


if __name__ == "__main__":
    sys.exit(main())
