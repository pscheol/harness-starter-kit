#!/usr/bin/env python3
"""관리 페이지 `GET /ops` · `knots-sync status --ops --json` 의 data(설계 14 §3.12, DO-R16). 두 입구가 이 스크립트 하나를 부른다.

    python3 scripts/harness/ops_report.py [--today YYYY-MM-DD] [--no-metrics]
    python3 scripts/harness/ops_report.py --todo        "처리할 일"에 더할 항목만(가볍다)

배포 기록 · 운영 기록 · 장애 · 다음 Intent 후보 · 전달 지표 · 자동 검증 배포 상태 · 규칙 후보를 한 응답으로 낸다. 모델을 부르지 않고 파일을 쓰지 않는다.
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import deploy_config, deploy_gate, deploy_record, delivery_metrics, intent as intents, ops_records, rule_candidates  # noqa: E402

STALE_CANDIDATE_DAYS = rule_candidates.STALE_DAYS
WORD = re.compile(r"[0-9A-Za-z가-힣]{2,}")


def deploys(root):
    out = []
    for record in deploy_record.all_records(root):
        summary = deploy_gate.approval_summary(root, record)
        out.append({"path": record.path.relative_to(root).as_posix(), "id": record.id, "key": record.fm.get("key"), "env": record.env, "state": record.state, "issues": record.issues,
                    "risk": record.risk, "approval": summary["state"], "approvers": summary["approvers"], "rollbackTest": record.rollback_test()["status"],
                    "createdAt": record.fm.get("created"), "finishedAt": record.finished_at()})
    return out


def open_intents(root):
    out = []
    for folder in sorted((Path(root) / intents.INTENTS).glob("INT-*")):
        fm = intents.front(folder / "intent.md")
        if fm.get("status") != "superseded":
            areas = fm.get("areas") or ""
            out.append({"key": fm.get("id") or folder.name.split("-", 2)[0] + "-" + folder.name.split("-", 2)[1], "title": fm.get("title") or "", "areas": set(WORD.findall(areas))})
    return out


def overlaps(candidate, pool):
    words = set(WORD.findall(candidate["title"].lower()))
    hits = []
    for item in pool:
        if candidate["intake"] and item["key"] in candidate["intake"]:
            continue
        shared = words & set(WORD.findall(item["title"].lower()))
        if len(shared) >= 2:
            hits.append(item["key"])
    return hits


def records_part(root):
    records, incidents, candidates = [], [], []
    pool = open_intents(root)
    for record in ops_records.all_records(root):
        name = f"{ops_records.RECORDS}/{record['name']}.md"
        period = record["fm"].get("period") if isinstance(record["fm"].get("period"), dict) else {}
        records.append({"path": name, "topic": record["fm"].get("topic"), "period": {"from": period.get("from"), "to": period.get("to")},
                        "metrics": [{"id": m["id"], "metric": m["metric"], "target": m["target"], "actual": m["actual"], "verdict": m["verdict"], "source": m["source"]} for m in record["metrics"]]})
        for inc in record["incidents"]:
            incidents.append({"record": name, "id": inc["id"], "grade": inc["grade"], "date": inc["date"], "cause": inc["fields"].get("원인 배포"), "followUp": inc["fields"].get("후속 이슈") or None})
        for nx in record["candidates"]:
            held = nx["intake"].strip()
            item = {"record": name, "id": nx["id"], "title": nx["title"], "kind": nx["kind"], "evidence": [part.strip() for part in re.split(r"[,·]", nx["evidence"]) if part.strip()],
                    "intake": None if held in ops_records.EMPTY else held}
            item["overlaps"] = overlaps({"title": nx["title"], "intake": item["intake"]}, pool)
            candidates.append(item)
    return records, incidents, candidates


def auto_verify_state(root):
    config, _ = deploy_config.read(root)
    auto = deploy_config.auto_verify(config)
    last = None
    for path in sorted((Path(root) / deploy_gate.REPORTS).glob("auto-verify-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and (last is None or (int(data.get("seq") or 0), str(data.get("finishedAt"))) >= (int(last.get("seq") or 0), str(last.get("finishedAt")))):
            last = data
    if not auto["enabled"]:
        return {"enabled": False, "status": "off", "consecutiveFailures": 0, "lastPassedSha": (last or {}).get("lastPassedSha"), "lastRun": (last or {}).get("finishedAt")}
    return {"enabled": True, "status": (last or {}).get("status", "none"), "consecutiveFailures": (last or {}).get("consecutiveFailures", 0), "lastPassedSha": (last or {}).get("lastPassedSha"),
            "lastRun": (last or {}).get("finishedAt"), "reason": (last or {}).get("reason"), "maxConsecutiveFailures": auto["maxConsecutiveFailures"],
            "resume": "사람이 파이프라인을 직접 다시 돌려야 이어집니다(KNS_DEPLOY_RESUME=true 를 넣고 수동 실행)" if (last or {}).get("status") == "stopped" else None}


def delivery(root, today):
    end = today.isoformat()
    start = (datetime.fromisoformat(end) - timedelta(days=30)).strftime("%Y-%m-%d")
    _, _, data = delivery_metrics.compute(root, start, end)
    saved = delivery_metrics.read_baseline(root)
    base = (saved or {}).get("metrics")
    return {"range": data["range"], "current": data["metrics"], "baseline": base, "methodMismatch": delivery_metrics.method_mismatch(data["metrics"], base or {})}


def todo(root, today):
    """처리할 일(rank · kind · target · title · reason · since · link · mine). 관리 페이지 홈에 그대로 보이므로 글은 합니다체다."""
    out = []
    stamp = today.isoformat() + "T00:00:00+00:00"
    state = auto_verify_state(root)
    if state["status"] == "stopped":
        out.append({"rank": 1, "kind": "deploy-stopped", "target": ".", "title": f"자동 검증 배포가 멈췄습니다(연속 실패 {state['consecutiveFailures']}회)", "reason": state.get("resume") or "", "since": state.get("lastRun") or stamp, "link": "/ops", "mine": False})
    for record in deploy_record.all_records(root):
        if record.state in ("planned", "approved") and deploy_gate.approval_summary(root, record)["state"] != "valid":
            out.append({"rank": 2, "kind": "deploy-approval", "target": record.id, "title": f"{record.id} 배포 승인 대기", "reason": "승인해야 운영 배포가 진행됩니다", "since": str(record.fm.get("created") or stamp), "link": "/ops", "mine": False})
    for record in ops_records.all_records(root):
        for warning in ops_records.problems(record)[1]:
            out.append({"rank": 4, "kind": "ops-metric-miss", "target": record["name"], "title": warning.split(": ", 1)[-1], "reason": "목표에 못 미친 지표입니다. 장애나 다음 요구사항 후보로 이어 둡니다", "since": str(record["fm"].get("created") or stamp), "link": "/ops", "mine": False})
    for item in rule_candidates.summary(root, today):
        if item["status"] == "proposed" and item["ageDays"] > STALE_CANDIDATE_DAYS:
            out.append({"rank": 7, "kind": "rule-candidate-stale", "target": item["id"], "title": f"{item['id']} 규칙 후보가 {item['ageDays']}일째 결정을 기다립니다", "reason": "받아들이거나 거절합니다(터미널에서 knots-sync rules promote · reject)", "since": stamp, "link": "/ops", "mine": False})
    return out


def data(root, today=None, metrics=True):
    today = today or date.today()
    records, incidents, candidates = records_part(root)
    return {"deploys": deploys(root), "records": records, "incidents": incidents, "candidates": candidates,
            "delivery": delivery(root, today) if metrics else {"range": None, "current": {}, "baseline": None, "methodMismatch": []},
            "autoVerify": auto_verify_state(root), "ruleCandidates": rule_candidates.summary(root, today), "todo": todo(root, today)}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="ops_report.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root")
    parser.add_argument("--today")
    parser.add_argument("--no-metrics", action="store_true")
    parser.add_argument("--todo", action="store_true")
    args = parser.parse_args(argv)
    root = intents.harness_root(Path(args.root or Path.cwd()))
    today = date.fromisoformat(args.today) if args.today else date.today()
    print(json.dumps(todo(root, today) if args.todo else data(root, today, not args.no_metrics), ensure_ascii=False, indent=2, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
