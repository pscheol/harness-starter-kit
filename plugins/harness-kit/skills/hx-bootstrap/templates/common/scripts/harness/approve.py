#!/usr/bin/env python3
"""사람 터미널 승인(설계 09 §3.8 · VQ-R15, 06 §3.7 형식). Node 가 없는 리포의 승인 경로 `terminal` 이다.

    python3 scripts/harness/approve.py <이슈키> <게이트> --phrase "<문구>" [--changes-requested [--rule-candidate]]
    python3 scripts/harness/approve.py <이슈키> review/F-<n> (--risk-accepted | --fix-required) --phrase "<문구>"

게이트: requirements · design · tasks · mr · done · review/F-<n>.
exit: 0 기록함 · 1 조건 · 확인 실패 · 2 사용법 · 3 에이전트 세션 또는 TTY 아님.
채팅에서 한 말은 승인이 아니다. 이 명령은 사람이 자기 터미널에서 이슈 키를 직접 입력해야 기록한다. 커밋은 사람이 한다.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, review_state, sdd_gates  # noqa: E402
from harness.agent_session import agent_session  # noqa: E402
from harness.sdd_frontmatter import update as update_frontmatter  # noqa: E402
from harness.sdd_issues import find_issue  # noqa: E402

REVIEW = re.compile(r"^review/(F-\d+)$")
BRANCH_KEY = re.compile(r"(?:^|/)([A-Z][A-Z0-9]{1,9}-[0-9]+)-")
LOG = ".agents/state/approvals-log.jsonl"
LATER = {"codebase": "HK-19", "intent": "HK-19", "plans": "HK-19", "deploy": "HK-21"}


class Refusal(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def git(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def parse_options(argv):
    parser = argparse.ArgumentParser(description="사람 터미널 승인(approvals.md 에 덧붙인다)")
    parser.add_argument("key")
    parser.add_argument("gate")
    parser.add_argument("--phrase", required=True, help="승인하며 남길 문구(기록일 뿐 승인 여부를 정하지 않는다)")
    decision = parser.add_mutually_exclusive_group()
    decision.add_argument("--changes-requested", action="store_true")
    decision.add_argument("--risk-accepted", action="store_true")
    decision.add_argument("--fix-required", action="store_true")
    parser.add_argument("--rule-candidate", action="store_true")
    options = parser.parse_args(argv)
    review = REVIEW.match(options.gate)
    if review:
        if not (options.risk_accepted or options.fix_required):
            parser.error("review/F-n 은 --risk-accepted 또는 --fix-required 를 준다")
        options.decision = "risk-accepted" if options.risk_accepted else "fix-required"
    else:
        if options.risk_accepted or options.fix_required:
            parser.error("--risk-accepted · --fix-required 는 review/F-n 에만 쓴다")
        options.decision = "changes-requested" if options.changes_requested else "approved"
    if options.rule_candidate and options.decision != "changes-requested":
        parser.error("--rule-candidate 는 --changes-requested 와 같이 쓴다")
    if not options.phrase.strip():
        parser.error("--phrase 가 비었다")
    return options


def refuse_agents():
    """에이전트 세션 · TTY 아님은 exit 3. 둘 다면 두 이유를 모두 적는다."""
    reasons = []
    marker = agent_session()
    if marker:
        reasons.append(f"에이전트 세션에서는 승인하지 못한다(판정: {marker}). 사람이 자기 터미널에서 실행한다")
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        reasons.append("TTY 가 아니다 — 사람이 터미널에서 직접 실행하고 이슈 키를 입력한다")
    if reasons:
        raise Refusal("\n  ".join(reasons), 3)


def locate(key):
    root = sdd_gates.harness_root(Path.cwd())
    if root is None:
        raise Refusal("하네스 루트(.agents/harness-kit.json)를 찾지 못했다", 2)
    try:
        folder = find_issue(root, key)
    except ValueError as error:
        raise Refusal(str(error), 2) from error
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD")
    other = BRANCH_KEY.search(branch or "")
    if other and other.group(1) != key:
        raise Refusal(f"이 체크아웃은 다른 이슈({other.group(1)}) 브랜치다: {branch} — {key} 의 worktree 에서 실행한다", 2)
    return root, folder, branch


def check_gate(issue, gate):
    if REVIEW.match(gate) or gate in sdd_gates.ISSUE_GATES:
        return
    if gate in LATER:
        raise Refusal(f"{gate} 게이트 승인은 이 판에 없다({LATER[gate]})", 2)
    raise Refusal(f"모르는 게이트: {gate} (requirements · design · tasks · mr · done · review/F-n)", 2)


def document_target(issue, gate, decision):
    path, fields, data = issue.doc(gate)
    if fields is None:
        raise Refusal(f"{path.name} 가 없다", 1)
    if not fields:
        raise Refusal(f"{path.name} 머리(---)를 읽지 못했다", 1)
    sha = approvals.approval_sha(data)
    status = fields.get("status")
    state = approvals.approval_state(issue.entries, gate, sha, issue.policy)
    if decision == "approved" and state == "valid":
        raise Refusal(f"{gate}: 이미 같은 내용(sha {sha[:12]})으로 승인한 기록이 있다", 1)
    if gate != "tasks" and status not in ("draft", "in-review", "approved"):
        raise Refusal(f"{path.name} 머리 status 가 {status or '없음'} 이다(draft · in-review 만 승인한다)", 1)
    if decision == "approved" and sdd_gates.CLARIFY in data.decode("utf-8", "replace"):
        raise Refusal(f"{path.name} 에 {sdd_gates.CLARIFY} 가 남았다 — /hx-clarify 로 먼저 푼다", 1)
    return {"name": path.name, "sha256": sha, "fingerprint": None, "head": None}, path


def review_target(root, issue, gate):
    finding_id = REVIEW.match(gate).group(1)
    data, _ = review_state.report_data(root, issue.key)
    if not data:
        raise Refusal(f"리뷰 보고서가 없다(.agents/reports/review/{issue.key}.md)", 1)
    item = next((entry for entry in data["findings"] if entry["id"] == finding_id), None)
    if item is None:
        raise Refusal(f"보고서에 {finding_id} 가 없다", 1)
    return {"name": f".agents/reports/review/{issue.key}.md", "sha256": None, "fingerprint": item["fp"], "head": None}, item


def approver_of(root, gate, policy):
    email = git(root, "config", "user.email")
    if not email:
        raise Refusal("git config user.email 이 비었다 — 승인자는 이 컴퓨터의 git 사용자다", 2)
    name = git(root, "config", "user.name") or None
    policy_gate = "mr" if REVIEW.match(gate) else gate
    if not approvals.allowed(email, policy_gate, policy):
        raise Refusal(f"{email} 은 {policy_gate} 게이트 승인자 목록(approvers.{policy_gate})에 없다", 1)
    group = None
    for item in (policy.get("approvers") or {}).get(policy_gate) or ():
        if "@" not in item and email.lower() in {member.lower() for member in (policy.get("groups") or {}).get(item) or ()}:
            group = item
            break
    return {"email": email, "name": name, "group": group}


def confirm(key, summary):
    print("\n".join(summary))
    try:
        typed = input("확인하려면 이슈 키를 입력한다: ").strip()
    except EOFError:
        typed = ""
    if typed != key:
        raise Refusal("입력한 키가 다르다 — 기록하지 않았다", 1)


def write_all(root, folder, issue, entry, doc_path):
    """approvals.md 덧붙이기 → 문서 머리 → 로컬 기록. 뒤 쓰기가 실패하면 앞 파일을 원래 바이트로 되돌린다."""
    target = folder / "approvals.md"
    original = target.read_bytes() if target.exists() else None
    current = original.decode("utf-8") if original is not None else None
    approvals.atomic_write(target, approvals.appended_text(current, issue.key, entry).encode("utf-8"))
    doc_original = None
    try:
        if doc_path is not None and entry["decision"] == "approved":
            doc_original = doc_path.read_bytes()
            approvals.atomic_write(doc_path, update_frontmatter(doc_original.decode("utf-8"), {"status": "approved"}).encode("utf-8"))
        log = root / LOG
        log.parent.mkdir(parents=True, exist_ok=True)
        if not (log.parent / ".gitignore").exists():
            (log.parent / ".gitignore").write_text("*\n", encoding="utf-8")
        record = {"entryId": entry["entryId"], "target": folder.relative_to(root).as_posix(), "gate": entry["gate"],
                  "sha256": entry["target"].get("sha256") or entry["target"].get("fingerprint") or entry["target"].get("head"),
                  "at": entry["at"], "path": "terminal"}
        with open(log, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as error:
        if doc_original is not None:
            approvals.atomic_write(doc_path, doc_original)
        if original is None:
            target.unlink(missing_ok=True)
        else:
            approvals.atomic_write(target, original)
        raise Refusal(f"기록을 쓰지 못해 되돌렸다: {error}", 1) from error


def run(options):
    refuse_agents()
    root, folder, branch = locate(options.key)
    issue = sdd_gates.Issue(root, folder)
    check_gate(issue, options.gate)
    doc_path, item = None, None
    if options.gate in sdd_gates.DOC_FILES:
        target, doc_path = document_target(issue, options.gate, options.decision)
    elif REVIEW.match(options.gate):
        target, item = review_target(root, issue, options.gate)
    else:
        head = git(root, "rev-parse", "HEAD")
        target = {"name": branch or "HEAD", "sha256": None, "fingerprint": None, "head": head or None}
    if options.decision == "approved":
        reasons = sdd_gates.preconditions(issue, options.gate)
        if reasons:
            raise Refusal(f"{options.gate} 게이트 조건이 맞지 않는다:\n" + "\n".join(f"  - {reason}" for reason in reasons), 1)
    approver = approver_of(root, options.gate, issue.policy)
    entry = {"at": approvals.now_text(), "gate": options.gate, "decision": options.decision, "approver": approver, "target": target,
             "phrase": options.phrase, "path": "terminal", "entryId": approvals.new_entry_id(), "ruleCandidate": options.rule_candidate}
    shown = target.get("sha256") or target.get("fingerprint") or target.get("head") or ""
    summary = [f"승인: {options.key} · {options.gate} · {options.decision}",
               f"- 대상: {target['name']}" + (f" · {shown[:12]}" if shown else ""),
               f"- 승인자: {approver['email']}" + (f" · 그룹: {approver['group']}" if approver["group"] else ""),
               f"- 문구: \"{' '.join(options.phrase.split())}\""]
    if item:
        summary.append(f"- 지적: {item['id']} · {item['severity']} · {item.get('title', '')[:80]}")
    confirm(options.key, summary)
    write_all(root, folder, issue, entry, doc_path)
    relative = (folder / "approvals.md").relative_to(root).as_posix()
    print(f"기록: {relative} · 기록 ID {entry['entryId']}")
    print(f"커밋은 사람이 한다: git add {relative}" + (f" {doc_path.relative_to(root).as_posix()}" if doc_path is not None and options.decision == "approved" else ""))
    return 0


def main(argv=None):
    options = parse_options(argv)
    try:
        return run(options)
    except Refusal as refusal:
        print(f"✖ {refusal}", file=sys.stderr)
        return refusal.code


if __name__ == "__main__":
    sys.exit(main())
