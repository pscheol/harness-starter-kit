"""기준선 `.agents/quality-baseline.json` — 새 문제 판정과 갱신(설계 09 §3.5 · VQ-R9 · VQ-R10).

새 문제 = 지문(이름이 바뀐 파일이면 옛 경로 지문도)이 그 분석기의 findings 에 없고, 오늘 이후까지인 accepted 에도 없는 발견.
갱신은 사람 터미널 · CI 에서 base 브랜치 HEAD 의 full 결과로만 한다(에이전트 세션은 exit 3).
"""

import json
from datetime import date, datetime, timezone
from pathlib import Path

from harness.quality_config import BASELINE, BASELINE_SCHEMA, ConfigError, read_json
from harness.quality_git import commit_of, head_info
from harness.sarif.normalize import FINGERPRINT_NAME, fingerprint
from harness.sarif.sarif_io import dumps, write_atomic
from harness.verify_changes import git_base_name
from harness.verify_record import harness_name
from harness.verify_sources import config_path

AGENTS = {"claude", "codex", "kiro", "cursor"}
REPORTS = ".agents/reports"


def active_accepted(baseline, today):
    keys = set()
    for item in (baseline or {}).get("accepted", []):
        try:
            if date.fromisoformat(str(item.get("until"))) >= today:
                keys.add((item.get("analyzer"), item.get("fingerprint")))
        except ValueError:
            continue
    return keys


def classify(findings, baseline, renames, today):
    """발견마다 new · accepted · baselineCcn 을 더한 새 목록. 기준선이 없으면 모두 새 것이다."""
    known = (baseline or {}).get("findings") or {}
    accepted = active_accepted(baseline, today)
    classified = []
    for finding in findings:
        prints = [finding["fingerprint"]]
        old_path = renames.get(finding["path"])
        if old_path:
            prints.append(fingerprint(finding["ruleId"], old_path, finding["basisHash"], finding["ordinal"]))
        entries = known.get(finding["analyzer"]) or {}
        match = next((entries[value] for value in prints if value in entries), None)
        is_accepted = any((finding["analyzer"], value) in accepted or (None, value) in accepted for value in prints)
        extra = {"new": match is None and not is_accepted, "accepted": is_accepted}
        if isinstance(match, dict) and isinstance(match.get("ccn"), int):
            extra["baselineCcn"] = match["ccn"]
        classified.append({**finding, **extra})
    return classified


def refuse(message):
    return 1, message


def sarif_entries(run_folder):
    """정규화한 SARIF(runs 폴더) → {분석기: {지문: 항목}}. 지문 · 심각도는 정규화가 남긴 값이다."""
    entries = {}
    for path in sorted(run_folder.glob("*.sarif")):
        document = json.loads(path.read_text(encoding="utf-8"))
        table = entries.setdefault(path.stem, {})
        for run in document.get("runs", []):
            for item in run.get("results", []):
                value = (item.get("partialFingerprints") or {}).get(FINGERPRINT_NAME)
                if not value:
                    continue
                properties = item.get("properties") or {}
                location = item["locations"][0]["physicalLocation"]["artifactLocation"]["uri"]
                entry = {"ruleId": item.get("ruleId"), "path": location, "severity": properties.get("harnessKit/severity")}
                if isinstance(properties.get("ccn"), int):
                    entry["ccn"] = properties["ccn"]
                table[value] = entry
    return entries


def update(root, environ):
    """(exit code, 안내). 0 이면 기준선을 썼다."""
    # CI 표지를 빼고 본다 — 에이전트가 CI=true 를 붙여도 에이전트 세션이다.
    if harness_name({key: value for key, value in environ.items() if key != "CI"}) in AGENTS:
        return 3, "에이전트 세션에서는 기준선을 고치지 못한다. 사람 터미널이나 CI 야간 작업에서 돈다."
    latest_path = root / REPORTS / "findings-latest.json"
    if not latest_path.is_file():
        return refuse("분석 결과가 없다. base 브랜치에서 bash scripts/verify.sh --full 뒤 다시 돈다.")
    latest = json.loads(latest_path.read_text(encoding="utf-8"))
    head = head_info(root)
    base = git_base_name(root)
    if latest.get("level") != "full":
        return refuse(f"마지막 분석이 full 이 아니다({latest.get('level')}). bash scripts/verify.sh --full 뒤 다시 돈다.")
    if latest.get("head") != head["sha"] or head["dirty"]:
        return refuse("마지막 full 분석이 지금 HEAD · 작업 트리와 다르다. 커밋한 깨끗한 트리에서 full 을 다시 돈다.")
    if head["branch"] != base and head["sha"] != commit_of(root, f"origin/{base}"):
        return refuse(f"기준선은 base 브랜치({base}) HEAD 에서만 만든다. 지금: {head['branch'] or head['sha'][:7]}")
    run_folder = root / REPORTS / "sarif" / latest["runId"]
    if not run_folder.is_dir():
        return refuse(f"SARIF 폴더가 없다: {run_folder}")
    path = config_path(root, BASELINE, environ)
    try:
        previous = read_json(path) if path.is_file() else {}
    except ConfigError:
        previous = {}
    findings = {key: value for key, value in (previous.get("findings") or {}).items() if (latest["analyzers"].get(key) or {}).get("status") != "ran"}
    findings.update(sarif_entries(run_folder))
    metrics = latest.get("metrics") or {}
    baseline = {
        "schema": BASELINE_SCHEMA,
        "commit": head["sha"][:7],
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "findings": {name: dict(sorted(entries.items())) for name, entries in sorted(findings.items())},
        "metrics": {"duplicationPercent": metrics.get("repoPercent"), "functionsOverCcn": metrics.get("functionsOverCcn")},
        "accepted": previous.get("accepted", []),
    }
    write_atomic(path, dumps(baseline))
    count = sum(len(entries) for entries in baseline["findings"].values())
    return 0, f"기준선을 썼다: {Path(path).relative_to(root) if Path(path).is_relative_to(root) else path} — 분석기 {len(baseline['findings'])}개 · 문제 {count}건 · commit {baseline['commit']}. 커밋한다."
