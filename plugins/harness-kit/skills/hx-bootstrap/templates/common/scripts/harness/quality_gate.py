"""품질 게이트 판정(설계 09 §3.6) — 새 문제 · 의존성 · 새 코드 중복률 · 복잡도(new-or-worsened) · required 분석기 · 열린 리뷰 지적.

`enforceAt` 레벨이고 기준선이 있으면 위반이 failed, 아니면 warned 다. CI 에서 미완료 분석기가 있으면 failed(VQ-R7).
"""

from harness.quality_config import SEVERITIES

RANK = {severity: index for index, severity in enumerate(reversed(SEVERITIES))}
INCOMPLETE = {"timeout"}
REQUIRED_INCOMPLETE = {"missing", "old", "error"}
REASONS = {"missing": "not-installed", "old": "version-too-old", "timeout": "timeout"}
ITEM_LIMIT = 20


def blocks_completion(outcome):
    """시간 초과는 모든 분석기, 설치 안 됨 · 낮은 판 · 결과 없음은 required 분석기만 미완료다(VQ-R7)."""
    if outcome["status"] in INCOMPLETE:
        return True
    return bool(outcome.get("required")) and outcome["status"] in REQUIRED_INCOMPLETE


def incomplete_of(outcomes):
    items = []
    for outcome in outcomes:
        if blocks_completion(outcome):
            items.append({"analyzer": outcome["id"], "reason": outcome.get("reason") or REASONS.get(outcome["status"], outcome["status"])})
    return items


def limited(check_id, value, limit, items=None, **extra):
    status = "reported" if limit is None else ("failed" if value > limit else "passed")
    check = {"id": check_id, "value": value, "limit": limit, "status": status, **extra}
    if items is not None:
        check["items"] = items[:ITEM_LIMIT]
    return check


def skipped(check_id, reason):
    return {"id": check_id, "status": "skipped", "reason": reason}


def ran(outcomes, category):
    return any(outcome["status"] == "ran" and outcome.get("category") == category for outcome in outcomes)


def new_issue_checks(config, new):
    checks = []
    for severity in SEVERITIES:
        items = [f"{finding['analyzer']}:{finding['fingerprint']}" for finding in new if finding["severity"] == severity]
        checks.append(limited(f"newIssues.{severity}", len(items), config["newIssues"].get(severity), items))
    return checks


def dependency_check(config, new):
    threshold = config["dependencies"].get("blockAtSeverity")
    if threshold is None:
        return skipped("dependencies.blockAtSeverity", "off")
    items = [f"{finding['analyzer']}:{finding['fingerprint']}" for finding in new if finding.get("category") == "dependency" and RANK[finding["severity"]] >= RANK[threshold]]
    return limited("dependencies.blockAtSeverity", len(items), 0, items, severity=threshold)


def spans(finding):
    yield finding["path"], finding["startLine"], finding["endLine"]
    for other in finding.get("locations", []):
        yield other["path"], other["startLine"], other["endLine"]


def duplication_check(config, findings, outcomes, changed):
    """새 코드 중복률 = 바뀐 줄 중 중복 조각 안 줄 ÷ 바뀐 줄 × 100. (검사, 값)."""
    check_id, rules = "duplication.newCodeMaxPercent", config["duplication"]
    if not ran(outcomes, "duplication"):
        return skipped(check_id, "no-analyzer"), None
    total = sum(len(lines) for lines in changed.values())
    if total < rules["minChangedLines"]:
        return {**skipped(check_id, "too-few-changed-lines"), "changedLines": total}, None
    covered = set()
    for finding in findings:
        if finding.get("category") != "duplication":
            continue
        for path, start, end in spans(finding):
            covered.update((path, line) for line in changed.get(path, ()) if start <= line <= end)
    percent = round(len(covered) * 100 / total, 1)
    return limited(check_id, percent, rules["newCodeMaxPercent"], changedLines=total, duplicatedLines=len(covered)), percent


def complexity_check(config, findings, outcomes, changed):
    """바뀐 줄과 겹치는 함수 중 기준을 넘고, 기준선에 없거나 CCN 이 늘어난 것. (검사, 위반 수)."""
    check_id, limit = "complexity.functionMaxCcn", config["complexity"]["functionMaxCcn"]
    if not ran(outcomes, "complexity"):
        return skipped(check_id, "no-analyzer"), None
    items = []
    for finding in findings:
        ccn = (finding.get("properties") or {}).get("ccn")
        if finding.get("category") != "complexity" or not isinstance(ccn, int) or ccn <= limit or finding.get("accepted"):
            continue
        touched = any(finding["startLine"] <= line <= finding["endLine"] for line in changed.get(finding["path"], ()))
        worsened = finding.get("new") or ccn > finding.get("baselineCcn", ccn)
        if touched and worsened:
            items.append(f"{finding['path']}:{(finding.get('properties') or {}).get('function', '?')} ccn {ccn}")
    return limited(check_id, len(items), 0, items, functionMaxCcn=limit), len(items)


def mode_of(config, level, has_baseline):
    if level in config["enforceAt"]:
        return "enforce" if has_baseline else "warn-no-baseline"
    if level in config["warnAt"]:
        return "warn" if has_baseline else "warn-no-baseline"
    return "report"


def review_checks(config, states):
    """열린 리뷰 지적(설계 09 §3.6 review.openMax · VQ-R4). states 는 review_state 결과 목록(없으면 skipped)."""
    if not states:
        return [skipped("review.openMax", "no-review")]
    limits = (config.get("review") or {}).get("openMax") or {}
    checks = []
    for severity in ("CRITICAL", "HIGH"):
        items = [f"{state['key']}:{item['id']}" for state in states for item in state["findings"]
                 if item["severity"] == severity and item["state"] in ("open", "fix-required")]
        checks.append(limited(f"review.openMax.{severity}", len(items), limits.get(severity), items))
    return checks


def review_status(config, level, checks):
    """리뷰 위반은 기준선과 상관없이 enforceAt 에서 failed, warnAt 에서 warned, 그 밖은 보고만 한다."""
    failed = [check for check in checks if check["status"] == "failed"]
    if level in config["enforceAt"]:
        return bool(failed)
    for check in failed:
        check["status"] = "warned" if level in config["warnAt"] else "reported"
    return False


def evaluate(config, level, findings, outcomes, changed, has_baseline, in_ci, review=None):
    """게이트 결과 {status, mode, checks, incomplete, values}. review 는 review_state 결과 목록."""
    new = [finding for finding in findings if finding.get("new")]
    checks = new_issue_checks(config, new)
    checks.append(dependency_check(config, new))
    duplication, percent = duplication_check(config, findings, outcomes, changed)
    complexity, worsened = complexity_check(config, findings, outcomes, changed)
    checks.extend([duplication, complexity, skipped("coverage.newCodeMinPercent", "no-calculator")])
    reviews = review_checks(config, review)
    incomplete = incomplete_of(outcomes)
    if in_ci:
        checks.append(limited("analyzers.required", len(incomplete), 0, [item["analyzer"] for item in incomplete]))
    mode = mode_of(config, level, has_baseline)
    violations = [check for check in checks if check["status"] == "failed" and check["id"] != "analyzers.required"]
    if mode != "enforce":
        for check in violations:
            check["status"] = "warned"
    review_failed = review_status(config, level, reviews)
    review_warned = any(check["status"] == "warned" for check in reviews)
    checks.extend(reviews)
    if (in_ci and incomplete) or review_failed:
        status = "failed"
    elif violations and mode == "enforce":
        status = "failed"
    elif incomplete:
        status = "incomplete"
    elif violations or review_warned:
        status = "warned"
    else:
        status = "passed"
    return {"status": status, "mode": mode, "checks": checks, "incomplete": incomplete, "values": {"newCodePercent": percent, "newOrWorsened": worsened}}
