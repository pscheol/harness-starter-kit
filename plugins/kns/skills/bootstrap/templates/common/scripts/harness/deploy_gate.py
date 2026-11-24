"""`deploy` 게이트 조건 D1~D7 판정과 승인 기록 쓰기(설계 14 §3.4, DO-R4 ~ DO-R6). 표준 라이브러리만 쓴다.

판정 원본은 이 파일 하나다. `deploy.py check` · `approve.py`(터미널) · 관리 페이지 승인 API(`deploy.py check --json`)가 같이 쓴다.
승인은 포함 이슈의 `approvals.md` 마다 같은 내용으로 덧붙인다. 승인 대상은 배포 기록 계획 구간의 sha256 이다.
"""

import json
import re
from pathlib import Path

from harness import approvals, deploy_config, deploy_record, rollout, sdd_gates
from harness.sdd_issues import find_issue

REPORTS = ".agents/reports/deploy"
MIN_WAIVER = 10
CONDITIONS = {"D1": "포함 이슈", "D2": "계획 승인", "D3": "롤백", "D4": "CI", "D5": "점검표", "D6": "승인자", "D7": "검증 환경"}


def same_sha(left, right):
    left, right = (left or "").lower(), (right or "").lower()
    return bool(left) and bool(right) and (left.startswith(right) or right.startswith(left))


def issue_of(root, key):
    return sdd_gates.Issue(root, find_issue(root, key))


def design_text(issue):
    data = issue.doc("design")[2]
    return data.decode("utf-8", "replace") if data is not None else ""


def d1(root, record):
    out = []
    for key in record.issues:
        try:
            if not sdd_gates.passed(issue_of(root, key), "done"):
                out.append(f"{key}: done 게이트를 통과하지 않았다")
        except ValueError as error:
            out.append(f"{key}: {error}")
    return out


def d2(root, record):
    out = []
    shas = record.design_shas()
    for key in record.issues:
        try:
            issue = issue_of(root, key)
        except ValueError as error:
            out.append(f"{key}: {error}")
            continue
        _, fields, data = issue.doc("design")
        if data is None:
            out.append(f"{key}: design.md 가 없다")
            continue
        sha = approvals.approval_sha(data)
        state = approvals.approval_state(issue.entries, "design", sha, issue.policy, issue.need("design"))
        if (fields or {}).get("status") != "approved" or state != "valid":
            out.append(f"{key}: design 승인이 valid 가 아니다({state})")
        text = data.decode("utf-8", "replace")
        out += [f"{key}: {problem}" for problem in rollout.problems(text) if problem.startswith(("§13.1", "§13.2"))]
        current = rollout.section_sha(text)
        recorded = shas.get(key)
        if recorded not in (None, "—", "-") and current and not same_sha(current, recorded):
            out.append(f"{key}: 기록 §1 의 design §13 sha({recorded})가 지금({current})과 다르다 — deploy plan 을 다시 만든다")
    return out


def waiver_ok(record, waiver):
    return bool(waiver) and len(waiver.strip()) >= MIN_WAIVER and record.risk != "high"


def d3(root, record, waiver):
    test = record.rollback_test()
    config, _ = deploy_config.read(root)
    kind = deploy_config.env_kind(config, test["env"]) if test["env"] else None
    if test["status"] == "passed" and kind == "verification":
        return []
    if waiver_ok(record, waiver):
        return []
    why = "시험 결과가 없다(시험: none)" if test["status"] != "passed" else f"근거 실행의 환경({test['env']})이 verification 종류가 아니다"
    if record.risk == "high":
        return [f"{why} — risk: high 는 롤백 시험 면제가 없다"]
    return [f"{why} — 승인자가 면제 사유({MIN_WAIVER}자 이상)를 넣을 때만 승인한다"]


def d4(record):
    sha = record.commit.get("sha")
    check = record.verification()
    out = []
    if check["full"]["status"] != "passed":
        out.append("기록 §6 에 full: passed 가 없다")
    elif not same_sha(check["full"]["sha"], sha):
        out.append(f"full 실행의 sha({check['full']['sha']})가 기록 commit.sha({sha})와 다르다")
    if check["gate"]["status"] != "passed":
        out.append("기록 §6 에 quality-gate: passed 가 없다")
    elif not same_sha(check["gate"]["sha"], sha):
        out.append(f"품질 게이트 실행의 sha({check['gate']['sha']})가 기록 commit.sha({sha})와 다르다")
    return out


def d5(record):
    rows = record.checklist()
    if not rows:
        return ["기록 §5 점검표가 비었다"]
    out = []
    for name, key, state in rows:
        ok = state == "체크" or (state.startswith("해당 없음:") and state.split(":", 1)[1].strip() not in ("", "<이유>"))
        if not ok:
            out.append(f"{key} · {name}: 체크도 '해당 없음: <이유>'도 없다")
    return out


def auto_verify_result(root, sha):
    for path in sorted((Path(root) / REPORTS).glob("auto-verify-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and same_sha(data.get("sha"), sha):
            return data
    return None


def d7(root, record):
    config, _ = deploy_config.read(root)
    if not deploy_config.auto_verify(config)["enabled"]:
        return []
    sha = record.commit.get("sha")
    result = auto_verify_result(root, sha)
    if result is None:
        return [f"자동 검증 배포 결과(auto-verify-{str(sha)[:7]}.json)가 없다"]
    return [] if result.get("status") == "passed" else [f"자동 검증 배포가 {result.get('status')} 다"]


def approval_summary(root, record):
    """포함 이슈별 deploy 승인 상태와 이 계획 sha 로 승인한 사람. 모든 이슈가 valid 일 때만 'valid'."""
    sha = record.sha
    states, people = [], set()
    waivers = []
    for key in record.issues:
        try:
            issue = issue_of(root, key)
        except ValueError:
            states.append("none")
            continue
        need = approvals.need_of(issue.meta, record.risk, "deploy")
        states.append(approvals.approval_state(issue.entries, "deploy", sha, issue.policy, need))
        people |= approvals.approvers_of(issue.entries, "deploy", sha)
        waivers += [entry["rollbackWaiver"] for entry in issue.entries
                    if entry["valid"] and entry["gate"] == "deploy" and entry["decision"] == "approved"
                    and entry["target"] and entry["target"]["sha256"] == sha and entry.get("rollbackWaiver")]
    if not states:
        state = "none"
    elif all(item == "valid" for item in states):
        state = "valid"
    else:
        order = ("stale", "invalid", "partial", "none")
        state = next((item for item in order if item in states), "none")
    return {"state": state, "approvers": sorted(people), "waivers": waivers}


def d6(root, record):
    summary = approval_summary(root, record)
    if summary["state"] == "valid":
        return []
    words = {"none": "deploy 승인 기록이 없다", "stale": "승인 sha 불일치 — 승인 뒤 계획 구간이 바뀌었다(다시 승인한다)",
             "invalid": "승인자가 approvers.deploy 밖이다", "partial": "risk: high 는 서로 다른 승인자 2명이 같은 계획 sha 를 승인해야 한다"}
    return [words[summary["state"]]]


def check(root, record, require_approved=False, waive=None):
    """{ok, id, risk, planSha256, conditions: [{id, name, ok, reasons}], failed, approval}."""
    root = Path(root)
    summary = approval_summary(root, record)
    waiver = waive
    if require_approved and not waiver:
        waiver = next((item for item in summary["waivers"] if len(item.strip()) >= MIN_WAIVER), None)
    reasons = {"D1": d1(root, record), "D2": d2(root, record), "D3": d3(root, record, waiver), "D4": d4(record), "D5": d5(record), "D7": d7(root, record)}
    reasons["D6"] = d6(root, record) if require_approved else []
    if record.sha is None:
        reasons["D2"].append("기록에 계획 구간(PLAN:BEGIN ~ PLAN:END)이 없다")
    conditions = [{"id": name, "name": CONDITIONS[name], "ok": not reasons[name], "reasons": reasons[name]} for name in CONDITIONS]
    failed = [item["id"] for item in conditions if not item["ok"]]
    return {"ok": not failed, "id": record.id, "env": record.env, "risk": record.risk, "planSha256": record.sha, "issues": record.issues,
            "rollbackWaived": bool(waiver) and bool(d3(root, record, None)), "conditions": conditions, "failed": failed, "approval": summary}


def lines(result):
    out = []
    for item in result["conditions"]:
        if not item["ok"]:
            out += [f"{item['id']} {item['name']}: {reason}" for reason in item["reasons"]]
    return out


def approval_entry(record, approver, phrase, at, path, entry_id, waiver=None):
    target = {"name": f"{deploy_record.DEPLOYS}/{record.id}.md#PLAN", "sha256": record.sha, "fingerprint": None, "head": None}
    return {"at": at, "gate": "deploy", "decision": "approved", "approver": approver, "target": target, "phrase": phrase, "path": path,
            "entryId": entry_id, "ruleCandidate": False, "rollbackWaiver": " ".join(waiver.split()) if waiver else None}


def waiver_text(waiver):
    return re.sub(r"\s+", " ", waiver or "").strip()
