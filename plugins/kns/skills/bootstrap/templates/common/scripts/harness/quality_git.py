"""정적 분석이 쓰는 git 정보 — HEAD · 바뀐 줄 · 이름 바뀜 표 · 추적 파일(설계 09 §3.5). 작업 트리를 고치지 않는다."""

import re
import subprocess

HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")
TIMEOUT = 30


def git(root, *arguments):
    """성공하면 stdout(bytes), 실패하면 None."""
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, timeout=TIMEOUT, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def text(root, *arguments):
    output = git(root, *arguments)
    return output.decode("utf-8", "replace").strip() if output is not None else None


def head_info(root):
    branch = text(root, "rev-parse", "--abbrev-ref", "HEAD")
    status = text(root, "status", "--porcelain", "--", ".", ":(exclude).agents/state", ":(exclude).agents/reports")
    return {
        "sha": text(root, "rev-parse", "HEAD"),
        "branch": None if branch in (None, "HEAD") else branch,
        "dirty": bool(status) if status is not None else None,
    }


def commit_of(root, reference):
    if not reference or reference.startswith("-"):
        return None
    return text(root, "rev-parse", "--verify", "--quiet", "--end-of-options", reference + "^{commit}")


def changed_lines(root, reference, files):
    """{경로: 바뀐 줄 번호 집합}. reference 와 작업 트리의 diff `+` 범위, 추적하지 않는 파일은 모든 줄."""
    files = sorted(set(files))
    if not files:
        return {}
    lines = {}
    output = git(root, "diff", "-U0", "--no-color", "--no-ext-diff", "--relative", reference or "HEAD", "--", *files)
    current = None
    for raw in (output or b"").decode("utf-8", "replace").splitlines():
        if raw.startswith("+++ "):
            current = raw[6:] if raw.startswith("+++ b/") else None
            continue
        match = HUNK.match(raw)
        if match and current:
            start, count = int(match.group(1)), int(match.group(2) if match.group(2) is not None else 1)
            lines.setdefault(current, set()).update(range(start, start + count))
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", *files)
    for path in (untracked or b"").decode("utf-8", "replace").split("\0"):
        if path:
            try:
                count = len((root / path).read_text(encoding="utf-8", errors="replace").splitlines())
            except OSError:
                continue
            lines[path] = set(range(1, count + 1))
    return lines


def renamed_paths(root, commit):
    """{새 경로: 옛 경로}. commit 에서 작업 트리까지 이름이 바뀐 파일. commit 이 없으면 빈 표."""
    if not commit or commit_of(root, commit) is None:
        return {}
    output = git(root, "diff", "-M", "--name-status", "-z", "--relative", commit, "--")
    renames, fields = {}, (output or b"").decode("utf-8", "replace").split("\0")
    index = 0
    while index < len(fields) and fields[index]:
        status = fields[index]
        if status.startswith(("R", "C")) and index + 2 < len(fields):
            if status.startswith("R"):
                renames[fields[index + 2]] = fields[index + 1]
            index += 3
        else:
            index += 2
    return renames


def tracked_files(root):
    output = git(root, "ls-files", "-z")
    return [path for path in (output or b"").decode("utf-8", "replace").split("\0") if path]
