#!/usr/bin/env python3
"""승인 기록 덧붙이기 전용(VQ-R14) · 새 기록 형식 · 에이전트의 새 기록 · done 승인 없는 완료(VQ-R13) 검사. 설계 09 §3.8.

    python3 scripts/harness/approvals_guard.py pre-commit    색인(HEAD → 색인). git pre-commit 이 검증 게이트 앞에서 부른다
    python3 scripts/harness/approvals_guard.py check         작업 트리(base merge-base → 작업 트리). fast 가 base_errors 로 부른다

덧붙이기 검사는 사람에게도 적용한다. 에이전트 규칙(새 기록의 기록 ID 가 로컬 approvals-log.jsonl 에 있어야 한다)은 환경 표지가
있을 때만 적용한다. 옮긴 옛 이슈(머리 `legacy`)와 base 에서 이미 completed 였던 tasks 는 보지 않는다. 문제가 없으면 출력이 없다.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness import approvals  # noqa: E402
from harness.agent_session import env_marker  # noqa: E402
from harness.sdd_frontmatter import parse as parse_frontmatter  # noqa: E402
from harness.sdd_keys import split_folder  # noqa: E402

APPROVALS = ":(glob)**/approvals.md"
TASKS = ":(glob).agents/docs/issues/*/tasks.md"
LOG = ".agents/state/approvals-log.jsonl"
HOW = "승인은 사람이 python3 scripts/harness/approve.py · 관리 페이지 · Jira · AI-DLC 로 한다"


def git(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.decode("utf-8", "replace") if result.returncode == 0 else None


def show(root, spec):
    """`<ref>:<경로>` 또는 `:<경로>`(색인)의 내용. 없으면 None."""
    return git(root, "show", spec)


def name_status(root, *arguments):
    """git diff --name-status -z 결과 → [(상태, 옛 경로, 새 경로)]."""
    output = git(root, "diff", "--relative", "--name-status", "-z", "-M", *arguments)
    if not output:
        return []
    parts, items, index = output.split("\0"), [], 0
    while index < len(parts) and parts[index]:
        status = parts[index]
        if status[:1] in ("R", "C"):
            items.append((status[:1], parts[index + 1], parts[index + 2]))
            index += 3
        else:
            items.append((status[:1], parts[index + 1], parts[index + 1]))
            index += 2
    return items


def removed_lines(root, *arguments):
    """git diff -U0 의 `-` 줄(바뀌거나 지운 기존 줄)."""
    output = git(root, "diff", "--relative", "-M", "-U0", "--no-color", *arguments) or ""
    return [line[1:] for line in output.splitlines() if line.startswith("-") and not line.startswith("---")]


def line_count(text):
    return len(text.split("\n")) if text else 0


def logged_ids(root):
    try:
        lines = (Path(root) / LOG).read_text(encoding="utf-8").splitlines()
    except OSError:
        return set()
    ids = set()
    for line in lines:
        try:
            ids.add(json.loads(line).get("entryId"))
        except (ValueError, AttributeError):
            continue
    return ids


def policy(root):
    try:
        meta = json.loads((Path(root) / ".agents/knots-sync.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        meta = {}
    return approvals.policy_of(meta)


def new_entry_errors(path, old_text, new_text, agent, ids):
    """old 뒤에 덧붙인 기록의 형식 오류와 에이전트 규칙 위반."""
    errors, start = [], line_count(old_text)
    parsed = approvals.parse(new_text or "")
    for error in parsed["errors"]:
        if error["line"] > start:
            errors.append(f"{path}:{error['line']}: 새 승인 기록 형식 오류 {error['code']}")
    for entry in parsed["entries"]:
        if entry["line"] <= start:
            continue
        if entry["errors"]:
            errors.append(f"{path}:{entry['line']}: 새 승인 기록 형식 오류 {', '.join(entry['errors'])}")
        elif agent and entry["entryId"] not in ids:
            errors.append(f"{path}:{entry['line']}: 에이전트 세션의 새 승인 기록 {entry['entryId']} 가 {LOG} 에 없다 — {HOW}")
    return errors


def append_only_errors(root, changes, old_ref, new_text_of, diff_arguments, agent):
    errors, ids = [], logged_ids(root) if agent else set()
    for status, old, new in changes:
        if status == "D":
            errors.append(f"{old}: approvals.md 를 지웠다 — 승인 기록은 지우지 않는다(VQ-R14)")
            continue
        removed = removed_lines(root, *diff_arguments, "--", *sorted({old, new}))
        if removed:
            errors.append(f"{new}: 기존 줄을 바꾸거나 지웠다(덧붙이기만 한다, VQ-R14): -{removed[0][:100]}")
            continue
        old_text = show(root, f"{old_ref}:./{old}") if status != "A" else None
        errors += new_entry_errors(new, old_text, new_text_of(new), agent, ids)
    return errors


def state_of(text):
    """(state, legacy 여부). 머리가 없거나 틀리면 (None, False)."""
    try:
        fields = parse_frontmatter(text or "") or {}
    except ValueError:
        return None, False
    return fields.get("state"), bool(fields.get("legacy"))


def completion_errors(root, paths, before_of, after_of, approvals_of):
    """tasks.md 가 completed 로 바뀌었는데 유효한 done 기록이 없으면 오류(VQ-R13)."""
    errors, rules = [], policy(root)
    for path in sorted(set(paths)):
        state, legacy = state_of(after_of(path))
        if state != "completed" or legacy:
            continue
        before, _ = state_of(before_of(path))
        if before == "completed":
            continue
        folder = str(Path(path).parent.as_posix())
        entries = approvals.parse(approvals_of(f"{folder}/approvals.md") or "")["entries"]
        if approvals.approval_state(entries, "done", None, rules) != "valid":
            key = (split_folder(Path(folder).name) or (Path(folder).name,))[0]
            errors.append(f"{path}: state: completed 인데 유효한 done 승인 기록이 없다(VQ-R13) — 사람이 python3 scripts/harness/approve.py {key} done")
    return errors


# ── pre-commit(HEAD → 색인) ──────────────────────────────────────────────────
def staged_errors(root, environ=None):
    environ = os.environ if environ is None else environ
    agent = env_marker(environ) is not None
    has_head = git(root, "rev-parse", "--verify", "--quiet", "HEAD") is not None
    if has_head:
        changes = name_status(root, "--cached", "--", APPROVALS)
        tasks = [new for status, _, new in name_status(root, "--cached", "--", TASKS) if status != "D"]
    else:
        changes = [("A", path, path) for path in staged_paths(root, APPROVALS)]
        tasks = staged_paths(root, TASKS)
    errors = append_only_errors(root, changes, "HEAD", lambda path: show(root, f":./{path}"), ["--cached"], agent)
    errors += completion_errors(root, tasks, lambda path: show(root, f"HEAD:./{path}") if has_head else None,
                                lambda path: show(root, f":./{path}"), lambda path: show(root, f":./{path}"))
    return errors


def staged_paths(root, pathspec):
    output = git(root, "diff", "--cached", "--relative", "--name-only", "-z", "--", pathspec) or ""
    return [path for path in output.split("\0") if path]


# ── fast(base merge-base → 작업 트리) ────────────────────────────────────────
def base_reference(root):
    """(merge-base, 이름) 또는 (None, None). KNS_BASE_REF → origin/<git.base>."""
    try:
        meta = json.loads((Path(root) / ".agents/knots-sync.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        meta = {}
    base = str(((meta.get("git") or {}) if isinstance(meta.get("git"), dict) else {}).get("base") or "develop")
    for ref in (os.environ.get("KNS_BASE_REF"), f"origin/{base}"):
        if not ref:
            continue
        merge_base = (git(root, "merge-base", ref, "HEAD") or "").strip()
        if merge_base:
            return merge_base, ref
    return None, None


def working(root, path):
    try:
        return (Path(root) / path).read_text(encoding="utf-8")
    except OSError:
        return None


def base_errors(root):
    """fast 검사. base 가 없으면 HEAD 대비(커밋 안 한 변경)만 본다. git 이 없거나 HEAD 가 없으면 건너뛴다."""
    if git(root, "rev-parse", "--verify", "--quiet", "HEAD") is None:
        return []
    reference, _ = base_reference(root)
    reference = reference or "HEAD"
    changes = name_status(root, reference, "--", APPROVALS)
    untracked = [path for path in (git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", APPROVALS) or "").split("\0") if path]
    changes += [("A", path, path) for path in untracked]
    errors = append_only_errors(root, changes, reference, lambda path: working(root, path), [reference], agent=False)
    tracked = [new for status, _, new in name_status(root, reference, "--", TASKS) if status != "D"]
    tracked += [path for path in (git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", TASKS) or "").split("\0") if path]
    errors += completion_errors(root, tracked, lambda path: show(root, f"{reference}:./{path}"), lambda path: working(root, path),
                                lambda path: working(root, path))
    return errors


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv not in (["pre-commit"], ["check"]):
        print("사용법: approvals_guard.py pre-commit | check", file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parents[2]
    errors = staged_errors(root) if argv == ["pre-commit"] else base_errors(root)
    if errors:
        print("\n".join(f"✖ {error}" for error in errors[:20]), file=sys.stderr)
        print(f"✖ 승인 기록 검사 실패 {len(errors)}건 — {HOW}. 채팅에서 한 말은 승인이 아니다", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
