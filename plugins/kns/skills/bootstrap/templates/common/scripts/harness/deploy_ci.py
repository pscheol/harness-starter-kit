"""`deploy record --from-ci` — CI 산출물에서 배포 기록 §4 시험 줄과 §6 검증 줄을 채운다(설계 14 §3.3).

산출물: `verify-last.json`(.agents/state) · `quality-gate-last.json`(.agents/reports) · `auto-verify-<sha>.json` · `rollback-test-<sha>.json`(.agents/reports/deploy).
인자가 폴더면 그 안에서, 파일이면 그 파일 하나를, 파이프라인 URL 이면 이 체크아웃의 기본 자리(CI 가 내려받아 둔 산출물)를 읽고 URL 을 근거로 적는다.
산출물의 head 가 기록 commit.sha 와 다르면 두 sha 를 보이고 거부한다.
"""

import json
import re
from pathlib import Path

from harness import deploy_gate, deploy_record

DEFAULTS = {"verify": ".agents/state/verify-last.json", "gate": ".agents/reports/quality-gate-last.json"}
URL = re.compile(r"^https?://\S+$")


class CiError(Exception):
    pass


def read(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def collect(root, source):
    """(verify, gate, auto 목록, 롤백 시험 목록, 근거). 없는 것은 None 또는 빈 목록."""
    root = Path(root)
    evidence = source if URL.match(source) else None
    base = root if evidence else Path(source)
    if not evidence and not base.exists():
        raise CiError(f"산출물이 없다: {source}")
    if evidence or base.is_dir():
        folder = base if base.is_dir() else root

        def pick(name, fallback):
            return next((p for p in (folder / name, root / fallback) if p.is_file()), None)

        verify = pick("verify-last.json", DEFAULTS["verify"])
        gate = pick("quality-gate-last.json", DEFAULTS["gate"])
        reports = root / deploy_gate.REPORTS
        autos = sorted([*folder.glob("auto-verify-*.json"), *reports.glob("auto-verify-*.json")])
        tests = sorted([*folder.glob("rollback-test-*.json"), *reports.glob("rollback-test-*.json")])
        return verify, gate, autos, tests, evidence or str(base)
    name = base.name
    verify = base if name == "verify-last.json" else None
    gate = base if name == "quality-gate-last.json" else None
    autos = [base] if name.startswith("auto-verify-") else []
    tests = [base] if name.startswith("rollback-test-") else []
    return verify, gate, autos, tests, str(base)


def fill(root, record_path, source):
    """기록 §4 · §6 을 고친다. 고친 줄 목록을 돌려준다."""
    record = deploy_record.load(record_path)
    sha = record.commit.get("sha") or ""
    verify, gate, autos, tests, evidence = collect(root, source)
    state = {"text": record.path.read_text(encoding="utf-8")}
    changed = []

    def put(prefix, line):
        updated = deploy_record.set_plan_line(state["text"], prefix, line)
        if updated is None:
            raise CiError(f"기록 계획 구간에 '{prefix}' 줄이 없다")
        state["text"] = updated
        changed.append(line)

    def need_same(label, head):
        if not deploy_gate.same_sha(head, sha):
            raise CiError(f"{label} 의 head({head})가 기록 commit.sha({sha})와 다르다 — 거부한다")

    if verify is not None:
        data = read(verify) or {}
        head = (data.get("head") or {}).get("sha") if isinstance(data.get("head"), dict) else None
        need_same(Path(verify).name, head)
        if data.get("level") == "full":
            put("- full:", f"- full: {data.get('status') or 'unknown'} · sha {str(head)[:12]} · {evidence}")
    if gate is not None:
        data = read(gate) or {}
        head = str(data.get("head") or "")
        need_same(Path(gate).name, head)
        put("- quality-gate:", f"- quality-gate: {data.get('status') or 'unknown'} · sha {head[:12]}")
    for path in [*tests, *autos]:
        data = read(path) or {}
        if not deploy_gate.same_sha(data.get("sha"), sha):
            continue
        result = data.get("status") if path in tests else (data.get("rollbackTest") or {}).get("status")
        if result:
            put("- 시험:", f"- 시험: {result} · env {data.get('env') or 'verify'} · {data.get('pipeline') or evidence} · {data.get('finishedAt') or ''}".rstrip(" ·"))
            break
    record.path.write_text(state["text"], encoding="utf-8")
    return changed
