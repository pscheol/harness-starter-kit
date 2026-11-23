#!/usr/bin/env python3
"""열린 리뷰 지적 계산(설계 09 §3.1 끝). 대시보드 · mr 게이트 · verify.sh(affected · full)가 부른다.

    python3 scripts/harness/review_state.py <이슈 폴더> [--report <보고서>] [--json]
    python3 scripts/harness/review_state.py --all [--root <루트>] [--json]

exit: 0 열린 CRITICAL · HIGH 0 · 1 있음 · 2 보고서 없음 · 입력 오류.

닫힘 규칙: 승인 기록의 `review/F-n · risk-accepted`(마지막 판단, 승인자 approvers.mr) → 닫힘. MEDIUM · LOW 는 review.md 의
`거절 제안` 만으로 닫힘. `수용` 은 다시 돈 리뷰가 그 지문을 보고하지 않을 때 닫히므로 보고서에 있는 동안 열림이다.
보고서는 --report → <루트>/.agents/reports/review/<키>.md → 메인 worktree 의 같은 경로 → (CI) MR 요약 코멘트 순서로 찾는다.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, review_report  # noqa: E402
from harness.sdd_keys import split_folder  # noqa: E402

REPORTS = ".agents/reports/review"
SEVERITIES = review_report.SEVERITIES
BLOCKING = ("CRITICAL", "HIGH")


def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def harness_root(start):
    current = Path(start).resolve()
    for folder in (current, *current.parents):
        if (folder / ".agents/harness-kit.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return None


def review_rows(text):
    """review.md 표 → {ID: {severity, fp, action}}. 머리 줄 · 구분 줄은 뺀다."""
    rows = {}
    for line in (text or "").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 4 or not cells[0].startswith("F-"):
            continue
        rows[cells[0]] = {"severity": cells[1], "fp": cells[2].rstrip("…").strip(), "action": cells[3]}
    return rows


def classify(findings, rows, entries, policy):
    """보고서 발견마다 상태(open · risk-accepted · rejected · fix-required)와 열린 수."""
    result, table = [], {severity: 0 for severity in SEVERITIES}
    for item in findings:
        decision = approvals.review_decision(entries, item["id"], item["fp"], policy)
        row = rows.get(item["id"])
        row_matches = row is not None and len(row["fp"]) >= 12 and item["fp"].startswith(row["fp"])
        if decision == "risk-accepted":
            state = "risk-accepted"
        elif decision != "fix-required" and item["severity"] not in BLOCKING and row_matches and row["action"] == "거절 제안":
            state = "rejected"
        else:
            state = "fix-required" if decision == "fix-required" else "open"
        if state in ("open", "fix-required"):
            table[item["severity"]] += 1
        result.append({"id": item["id"], "severity": item["severity"], "fp": item["fp"], "state": state})
    return result, table


def main_worktree(root):
    try:
        result = subprocess.run(["git", "-C", str(root), "worktree", "list", "--porcelain"], capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            return Path(line[len("worktree "):])
    return None


def prefix_of(root):
    try:
        result = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-prefix"], capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def find_report(root, key, explicit=None):
    if explicit:
        return Path(explicit) if Path(explicit).is_file() else None
    local = Path(root) / REPORTS / f"{key}.md"
    if local.is_file():
        return local
    main = main_worktree(root)
    if main:
        other = main / prefix_of(root) / REPORTS / f"{key}.md"
        if other.is_file() and other.resolve() != local.resolve():
            return other
    return None


def report_data(root, key, explicit=None, environ=None):
    """(데이터, 출처). 로컬 보고서가 없고 CI 에 MR 정보가 있으면 요약 코멘트의 review 구간을 읽는다."""
    path = find_report(root, key, explicit)
    if path is not None:
        return review_report.read_data(path.read_text(encoding="utf-8")), str(path)
    environ = os.environ if environ is None else environ
    if environ.get("CI") and not explicit:
        from harness import mr_comment

        data = mr_comment.read_review_data(environ)
        if data and data.get("issue") == key:
            return data, "mr-comment"
    return None, None


def issue_state(root, folder, report=None, environ=None):
    """이슈 하나의 열린 지적. 보고서가 없으면 None."""
    root, folder = Path(root), Path(folder)
    parts = split_folder(folder.name)
    if not parts:
        return None
    key = parts[0]
    data, source = report_data(root, key, report, environ)
    if not data:
        return None
    meta = read_json(root / ".agents/harness-kit.json")
    entries = approvals.read_entries(folder / "approvals.md")
    try:
        rows = review_rows((folder / "review.md").read_text(encoding="utf-8"))
    except OSError:
        rows = {}
    findings, table = classify(data["findings"], rows, entries, approvals.policy_of(meta))
    head = current_head(root)
    return {"key": key, "report": source, "head": data.get("head"), "stale": bool(head and data.get("head") and not head.startswith(str(data["head"])) and not str(data["head"]).startswith(head)),
            "open": table, "findings": findings}


def current_head(root):
    try:
        result = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() or None


def all_states(root, environ=None):
    """로컬 보고서가 있는 이슈 전부(full)."""
    from harness.sdd_issues import issue_folders

    states = []
    for folder in issue_folders(Path(root)):
        state = issue_state(root, folder, environ={} if environ is None else environ)
        if state:
            states.append(state)
    return states


def blocking_count(state):
    return sum(state["open"][severity] for severity in BLOCKING)


def main(argv=None):
    parser = argparse.ArgumentParser(description="열린 리뷰 지적")
    parser.add_argument("folder", nargs="?")
    parser.add_argument("--report")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--root")
    parser.add_argument("--json", action="store_true")
    options = parser.parse_args(argv)
    if options.all:
        root = harness_root(options.root or Path.cwd())
        if root is None:
            print("✖ 하네스 루트를 찾지 못했다", file=sys.stderr)
            return 2
        states = all_states(root)
        if options.json:
            print(json.dumps({"issues": states}, ensure_ascii=False, indent=2))
        for state in states if not options.json else ():
            print(f"{state['key']}: 열린 " + " · ".join(f"{key} {value}" for key, value in state["open"].items()))
        return 1 if any(blocking_count(state) for state in states) else 0
    if not options.folder:
        parser.error("이슈 폴더 또는 --all 을 준다")
    folder = Path(options.folder).resolve()
    root = harness_root(folder)
    if root is None or not folder.is_dir():
        print(f"✖ 이슈 폴더가 아니다: {options.folder}", file=sys.stderr)
        return 2
    state = issue_state(root, folder, options.report)
    if state is None:
        print("리뷰 보고서 없음 — /hx-review 를 먼저 돈다", file=sys.stderr)
        return 2
    if options.json:
        print(json.dumps(state, ensure_ascii=False, indent=2))
    else:
        print(f"{state['key']}: 열린 " + " · ".join(f"{key} {value}" for key, value in state["open"].items()) + (" (보고서 head 가 지금과 다르다)" if state["stale"] else ""))
        for item in state["findings"]:
            if item["state"] in ("open", "fix-required"):
                print(f"- {item['id']} · {item['severity']} · {item['state']}")
    return 1 if blocking_count(state) else 0


if __name__ == "__main__":
    sys.exit(main())
