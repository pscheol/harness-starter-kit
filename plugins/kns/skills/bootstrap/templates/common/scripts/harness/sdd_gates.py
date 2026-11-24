#!/usr/bin/env python3
"""이슈 게이트 조건(설계 09 §3.8 표의 requirements · design · tasks · mr · done). 판정 원본이고 approve.py · 훅 · fast 가 부른다.

    python3 scripts/harness/sdd_gates.py check <이슈키> [--json]     게이트마다 통과 · 안 된 이유 · 앞 조건
    python3 scripts/harness/sdd_gates.py check --all                 이슈 폴더 전부(JSON, 관리 페이지)

codebase · intent · plans 게이트는 intent_gate.py, deploy 는 deploy_gate.py 다. risk: high 이슈의 design · mr 은 서로 다른 승인자 2명(DS-R26). 머리에 `legacy` 가 있는 문서(옮긴 옛 이슈)는
기록 없이 머리 값으로 통과한다. 승인 sha 는 approvals.approval_sha(머리 status · state 줄을 뺀 sha256)다.
"""

import argparse
import fnmatch
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals, rollout  # noqa: E402
from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402
from harness.sdd_keys import split_folder  # noqa: E402

ISSUE_GATES = ("requirements", "design", "tasks", "mr", "done")
DOC_FILES = {"requirements": "requirements.md", "design": "design.md", "tasks": "tasks.md"}
CLARIFY = "[NEEDS CLARIFICATION"
VERIFY_RECORD = ".agents/state/verify-last.json"
GATE_RESULT = ".agents/reports/quality-gate-last.json"


def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def git(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def harness_root(start):
    """README §10: 위로 올라가며 .agents/knots-sync.json · .agents/harness.json 이 있는 가장 가까운 폴더."""
    current = Path(start).resolve()
    for folder in (current, *current.parents):
        if (folder / ".agents/knots-sync.json").is_file() or (folder / ".agents/harness.json").is_file():
            return folder
    return None


class Issue:
    """이슈 폴더 하나와 그 승인 기록 · 설정."""

    def __init__(self, root, folder):
        self.root = Path(root)
        self.folder = Path(folder)
        self.key = (split_folder(self.folder.name) or (self.folder.name,))[0]
        self.meta = read_json(self.root / ".agents/knots-sync.json")
        self.policy = approvals.policy_of(self.meta)
        self.entries = approvals.read_entries(self.folder / "approvals.md")
        self.memo = {}
        self._risk = None

    @property
    def risk(self):
        """문서 머리 risk 중 가장 높은 값(이슈는 올릴 수만 있다). mr 은 diff 가 risk.highPaths 에 걸리면 high(08 §3.15 기계 하한)."""
        if self._risk is None:
            values = [(self.doc(gate)[1] or {}).get("risk") for gate in DOC_FILES]
            self._risk = "high" if "high" in values else "medium" if "medium" in values else "low"
        return self._risk

    def need(self, gate):
        risk = self.risk
        if gate == "mr" and risk != "high" and self.touches_high_paths():
            risk = "high"
        return approvals.need_of(self.meta, risk, gate)

    def touches_high_paths(self):
        conf = self.meta.get("risk") if isinstance(self.meta.get("risk"), dict) else {}
        patterns = [p for p in conf.get("highPaths") or [] if isinstance(p, str)]
        if not patterns:
            return False
        names = (git(self.root, "diff", "--name-only", f"{self.base}...HEAD") or "").splitlines()
        return any(fnmatch.fnmatch(name, pattern) for name in names for pattern in patterns)

    @property
    def base(self):
        git_section = self.meta.get("git") if isinstance(self.meta.get("git"), dict) else {}
        return str(git_section.get("base") or "develop")

    def doc(self, gate):
        """(경로, 머리, 바이트). 없으면 머리 None."""
        path = self.folder / DOC_FILES[gate]
        try:
            data = path.read_bytes()
        except OSError:
            return path, None, None
        try:
            fields = parse_frontmatter(data.decode("utf-8")) or {}
        except ValueError:
            fields = {}
        return path, fields, data


def doc_reasons(issue, gate, own):
    """문서 게이트의 안 된 이유. own=False 면 그 게이트 자체의 기록 · 머리는 보지 않는다(앞 조건만)."""
    _, fields, data = issue.doc(gate)
    if fields is None:
        return [f"{DOC_FILES[gate]} 가 없다"]
    reasons = []
    if CLARIFY in data.decode("utf-8", "replace"):
        reasons.append(f"{DOC_FILES[gate]} 에 {CLARIFY} 가 남았다")
    if not own:
        return reasons
    if fields.get("legacy"):
        if gate != "tasks" and fields.get("status") != "approved":
            reasons.append(f"{DOC_FILES[gate]} 머리 status 가 approved 가 아니다")
        return reasons
    if gate != "tasks" and fields.get("status") != "approved":
        reasons.append(f"{DOC_FILES[gate]} 머리 status 가 approved 가 아니다({fields.get('status') or '없음'})")
    sha = approvals.approval_sha(data)
    state = approvals.approval_state(issue.entries, gate, sha, issue.policy, issue.need(gate))
    if gate == "tasks" and state == "stale":
        state = "valid"
    if state != "valid":
        reasons.append(f"{gate} 승인 기록이 {STATE_WORDS[state]}")
    return reasons


STATE_WORDS = {"none": "없다", "stale": "지금 내용과 다르다(stale)", "invalid": "승인자 목록 밖이다(invalid)",
               "partial": "서로 다른 승인자가 모자란다(risk: high 는 2명, DS-R26)"}


def passed(issue, gate):
    if gate not in issue.memo:
        issue.memo[gate] = not (preconditions(issue, gate) + own_reasons(issue, gate))
    return issue.memo[gate]


def previous_gate(gate):
    order = ISSUE_GATES[: ISSUE_GATES.index(gate)]
    return order[-1] if order else None


def head_sha(root):
    value = git(root, "rev-parse", "HEAD")
    return value.strip() if value else None


def verify_reasons(issue):
    record = read_json(issue.root / VERIFY_RECORD)
    head = head_sha(issue.root)
    record_head = record.get("head") if isinstance(record.get("head"), dict) else {}
    if record.get("level") != "affected" or record.get("status") != "passed" or not head or record_head.get("sha") != head or record_head.get("dirty"):
        return ["같은 HEAD · 깨끗한 트리의 affected 검증 통과 기록이 없다 — bash scripts/verify.sh --affected"]
    gate = read_json(issue.root / GATE_RESULT)
    if gate.get("head") and head.startswith(str(gate["head"])) and gate.get("status") == "failed":
        return ["품질 게이트가 failed 다(.agents/reports/quality-gate-last.json)"]
    return []


def review_reasons(issue):
    from harness import review_state

    state = review_state.issue_state(issue.root, issue.folder)
    if state is None:
        return []
    open_counts = state["open"]
    blocking = [f"{severity} {open_counts[severity]}" for severity in ("CRITICAL", "HIGH") if open_counts.get(severity)]
    return [f"열린 리뷰 지적 {' · '.join(blocking)}(review_state.py)"] if blocking else []


def merged_reasons(issue):
    prefix = (git(issue.root, "rev-parse", "--show-prefix") or "").strip()
    relative = issue.folder.resolve().relative_to(issue.root.resolve()).as_posix()
    for ref in (f"origin/{issue.base}", issue.base):
        text = git(issue.root, "show", f"{ref}:{prefix}{relative}/approvals.md")
        if text is None:
            continue
        entries = approvals.parse(text)["entries"]
        if approvals.approval_state(entries, "mr", None, issue.policy) == "valid":
            return []
        return [f"{ref} 에 이 이슈의 mr 승인이 없다(병합 전)"]
    return [f"base({issue.base}) 에 이 이슈가 병합되지 않았다"]


def rollout_reasons(issue):
    """design §13 "배포 · 롤백" 이 차 있는가(설계 14 DO-R1, rollout.py). 옛 템플릿 design 은 건너뛴다."""
    data = issue.doc("design")[2]
    if data is None:
        return []
    return [f"design §13: {problem}" for problem in rollout.problems(data.decode("utf-8", "replace"))]


def preconditions(issue, gate):
    """그 게이트를 승인하기 전에 맞아야 하는 조건(자기 기록 제외)."""
    reasons = []
    before = previous_gate(gate)
    if gate == "done":
        state = approvals.approval_state(issue.entries, "mr", None, issue.policy, issue.need("mr"))
        if state != "valid":
            reasons.append(f"mr 승인 기록이 {STATE_WORDS[state]}")
        return reasons + merged_reasons(issue)
    if before and not passed(issue, before):
        first = (preconditions(issue, before) + own_reasons(issue, before))[:1]
        reasons.append(f"{before} 게이트를 통과하지 않았다" + (f": {first[0]}" if first else ""))
    if gate in DOC_FILES:
        reasons += doc_reasons(issue, gate, own=False)
    if gate == "design":
        reasons += rollout_reasons(issue)
    if gate == "mr":
        reasons += verify_reasons(issue) + review_reasons(issue)
    return reasons


def own_reasons(issue, gate):
    if gate in DOC_FILES:
        return [reason for reason in doc_reasons(issue, gate, own=True) if CLARIFY not in reason]
    state = approvals.approval_state(issue.entries, gate, None, issue.policy, issue.need(gate))
    return [] if state == "valid" else [f"{gate} 승인 기록이 {STATE_WORDS[state]}"]


def evaluate(issue, gate):
    before = preconditions(issue, gate)
    reasons = before + own_reasons(issue, gate)
    sha = None
    if gate in DOC_FILES:
        data = issue.doc(gate)[2]
        sha = approvals.approval_sha(data) if data is not None else None
    state = approvals.approval_state(issue.entries, gate, sha if gate != "tasks" else None, issue.policy, issue.need(gate))
    return {"gate": gate, "passed": not reasons, "reasons": reasons, "preconditions": before, "approval": state, "need": issue.need(gate)}


def all_results(root):
    """이슈 폴더 전부의 게이트 판정(관리 페이지 · `check --all`). 폴더를 읽지 못하면 그 이슈의 error 다."""
    from harness.sdd_issues import issue_folders

    out = []
    for folder in issue_folders(Path(root)):
        parts = split_folder(folder.name)
        if not parts:
            continue
        try:
            issue = Issue(root, folder)
            out.append({"key": parts[0], "folder": folder.relative_to(root).as_posix(), "gates": [evaluate(issue, gate) for gate in ISSUE_GATES]})
        except (OSError, ValueError) as error:
            out.append({"key": parts[0], "folder": folder.relative_to(root).as_posix(), "gates": [], "error": str(error)})
    return out


def done_approved(root, folder):
    """`done · approved` 기록이 유효한가(VQ-R13)."""
    issue = Issue(root, folder)
    return approvals.approval_state(issue.entries, "done", None, issue.policy) == "valid"


def main(argv=None):
    parser = argparse.ArgumentParser(description="이슈 게이트 조건")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check")
    check.add_argument("key", nargs="?")
    check.add_argument("--all", action="store_true", help="이슈 폴더 전부(--json 과 같이)")
    check.add_argument("--json", action="store_true")
    check.add_argument("--root")
    options = parser.parse_args(argv)
    from harness.sdd_issues import find_issue

    root = harness_root(options.root or Path.cwd())
    if root is None:
        print("✖ 하네스 루트(.agents/knots-sync.json)를 찾지 못했다", file=sys.stderr)
        return 2
    if options.all:
        print(json.dumps({"issues": all_results(root)}, ensure_ascii=False, indent=2))
        return 0
    if not options.key:
        print("✖ check <이슈키> 또는 check --all", file=sys.stderr)
        return 2
    try:
        folder = find_issue(root, options.key)
    except ValueError as error:
        print(f"✖ {error}", file=sys.stderr)
        return 2
    issue = Issue(root, folder)
    results = [evaluate(issue, gate) for gate in ISSUE_GATES]
    if options.json:
        print(json.dumps({"key": options.key, "folder": folder.relative_to(root).as_posix(), "gates": results}, ensure_ascii=False, indent=2))
    else:
        for result in results:
            mark = "✔" if result["passed"] else "·"
            print(f"{mark} {result['gate']}" + ("" if result["passed"] else f" — {'; '.join(result['reasons'][:3])}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
