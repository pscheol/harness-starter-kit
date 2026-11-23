"""정적 분석 산출물(설계 09 §3.5 · §3.9 · VQ-R8 · VQ-R19). 쓰기 실패는 경고 줄로만 남기고 판정을 바꾸지 않는다.

    .agents/reports/sarif/<runId>/<분석기>.sarif   정규화한 SARIF(최근 20회)
    .agents/reports/sarif/latest                  마지막 실행(심볼릭 링크, 안 되면 복사)
    .agents/reports/findings-latest.json          발견 목록(/hx-scan · 기준선 갱신 입력)
    .agents/reports/quality-gate-last.json        게이트 판정
    .agents/reports/metrics/latest.json · <YYYY-MM-DD>.jsonl
"""

import json
import os
import shutil
from pathlib import Path

from harness.quality_config import SEVERITIES
from harness.sarif.sarif_io import dumps, write_atomic

REPORTS = ".agents/reports"
KEEP_RUNS = 20
FINDING_LIMIT = 5000
PUBLIC_KEYS = ("analyzer", "category", "ruleId", "path", "startLine", "endLine", "severity", "level", "message", "fingerprint", "new", "accepted", "properties", "locations")


def run_id_of(context, sarif_root):
    short = (context["head"]["sha"] or "0000000")[:7]
    base = f"{context['level']}-{context['at'].strftime('%Y%m%d%H%M%S')}-{short}"
    candidate, number = base, 2
    while (sarif_root / candidate).exists():
        candidate, number = f"{base}-{number}", number + 1
    return candidate


def point_latest(sarif_root, run_id):
    latest = sarif_root / "latest"
    temporary = sarif_root / f".latest-{os.getpid()}"
    try:
        if temporary.is_symlink() or temporary.exists():
            temporary.unlink()
        temporary.symlink_to(run_id, target_is_directory=True)
        if latest.is_dir() and not latest.is_symlink():
            shutil.rmtree(latest)
        os.replace(temporary, latest)
    except OSError:
        if latest.is_symlink():
            latest.unlink()
        elif latest.exists():
            shutil.rmtree(latest)
        shutil.copytree(sarif_root / run_id, latest)


def prune(sarif_root):
    runs = sorted((path for path in sarif_root.iterdir() if path.is_dir() and not path.is_symlink() and path.name != "latest" and not path.name.startswith(".")), key=lambda path: path.stat().st_mtime)
    for path in runs[:-KEEP_RUNS]:
        shutil.rmtree(path, ignore_errors=True)


def by_severity(findings):
    table = {severity: 0 for severity in SEVERITIES}
    for finding in findings:
        table[finding["severity"]] += 1
    return table


def analyzer_metrics(outcomes, findings):
    table = {}
    for outcome in outcomes:
        mine = [finding for finding in findings if finding["analyzer"] == outcome["id"]]
        table[outcome["id"]] = {
            "status": outcome["status"], "total": len(mine), "new": sum(finding["new"] for finding in mine),
            "bySeverity": by_severity(mine), "seconds": float(outcome.get("seconds") or 0.0),
        }
    return table


def property_of(outcomes, category, key):
    values = [outcome.get("properties", {}).get(key) for outcome in outcomes if outcome.get("category") == category and outcome["status"] == "ran"]
    values = [value for value in values if isinstance(value, (int, float))]
    return max(values) if values else None


def metrics_record(context, outcomes, findings, gate):
    complexity = [finding for finding in findings if finding.get("category") == "complexity"]
    ccns = [(finding.get("properties") or {}).get("ccn") for finding in complexity]
    max_ccn = property_of(outcomes, "complexity", "maxCcn")
    if max_ccn is None and any(isinstance(value, int) for value in ccns):
        max_ccn = max(value for value in ccns if isinstance(value, int))
    repo_percent = property_of(outcomes, "duplication", "percentage")
    return {
        "schema": "harness-kit.metrics/v1",
        "at": context["at"].isoformat(timespec="seconds"),
        "level": context["level"],
        "head": (context["head"]["sha"] or "")[:7] or None,
        "branch": context["head"]["branch"],
        "analyzers": analyzer_metrics(outcomes, findings),
        "duplication": {"newCodePercent": gate["values"]["newCodePercent"], "repoPercent": round(repo_percent, 2) if repo_percent is not None else None},
        "complexity": {"functionsOverCcn": len(complexity), "newOrWorsened": gate["values"]["newOrWorsened"], "maxCcn": max_ccn},
        "coverage": None,
        "gate": gate["status"],
        "seconds": context["seconds"],
    }


def public(finding):
    return {key: finding[key] for key in PUBLIC_KEYS if key in finding and finding[key] not in (None, {}, [])} | {"new": finding["new"], "accepted": finding["accepted"]}


def findings_record(context, run_id, outcomes, findings, metrics):
    ordered = sorted(findings, key=lambda finding: (not finding["new"], finding["path"], finding["startLine"], finding["ruleId"]))
    analyzers = {}
    for outcome in outcomes:
        entry = {key: outcome[key] for key in ("status", "tool", "version", "seconds", "reason", "exitCode") if outcome.get(key) is not None}
        entry.update({"total": metrics["analyzers"][outcome["id"]]["total"], "new": metrics["analyzers"][outcome["id"]]["new"]})
        analyzers[outcome["id"]] = entry
    for name in context["untriggered"]:
        analyzers[name] = {"status": "not-triggered"}
    return {
        "schema": "harness-kit.findings/v1", "runId": run_id, "level": context["level"],
        "head": context["head"]["sha"], "branch": context["head"]["branch"], "dirty": context["head"]["dirty"],
        "base": context["reference"], "at": metrics["at"], "judgedBy": context["judgedBy"],
        "analyzers": analyzers,
        "metrics": {"repoPercent": metrics["duplication"]["repoPercent"], "functionsOverCcn": metrics["complexity"]["functionsOverCcn"]},
        "findings": [public(finding) for finding in ordered[:FINDING_LIMIT]],
        "truncated": len(ordered) > FINDING_LIMIT,
    }


def gate_record(context, gate):
    return {
        "schema": "harness-kit.quality-gate-result/v1", "level": context["level"], "head": (context["head"]["sha"] or "")[:7] or None,
        "base": context["reference"], "status": gate["status"], "mode": gate["mode"], "judgedBy": context["judgedBy"],
        "bootstrap": context["bootstrap"], "checks": gate["checks"], "incomplete": gate["incomplete"],
    }


def write_outputs(root, context, outcomes, findings, gate):
    """(경고 줄, runId)."""
    reports = Path(root) / REPORTS
    sarif_root = reports / "sarif"
    try:
        sarif_root.mkdir(parents=True, exist_ok=True)
        ignore = reports / ".gitignore"
        if not ignore.exists():
            ignore.write_text("*\n", encoding="utf-8")
        run_id = run_id_of(context, sarif_root)
        (sarif_root / run_id).mkdir()
        for outcome in outcomes:
            if outcome.get("normalized") is not None:
                write_atomic(sarif_root / run_id / f"{outcome['id']}.sarif", dumps(outcome.pop("normalized")))
        point_latest(sarif_root, run_id)
        prune(sarif_root)
        metrics = metrics_record(context, outcomes, findings, gate)
        write_atomic(reports / "findings-latest.json", dumps(findings_record(context, run_id, outcomes, findings, metrics)))
        write_atomic(reports / "quality-gate-last.json", dumps(gate_record(context, gate)))
        write_atomic(reports / "metrics/latest.json", dumps(metrics))
        with open(reports / "metrics" / f"{context['at'].strftime('%Y-%m-%d')}.jsonl", "a", encoding="utf-8") as handle:
            handle.write(json.dumps(metrics, ensure_ascii=False) + "\n")
    except OSError as error:
        return [f"⚠ 분석 결과를 쓰지 못했다: {error}"], None
    return [], run_id
