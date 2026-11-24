#!/usr/bin/env python3
"""훅 입력의 cwd 로 하네스 루트를 정한다(설계 03 §3.10, HK-24 design §4). dispatch.sh 가 부른다.

    python3 scripts/hooks/hook_root.py --fallback <디스패처 루트> --hook <훅 id> < 훅 입력

표준 출력 다섯 줄: 루트 · worktree 여부(0 · 1) · 메인 루트 · 그 훅의 maxOutputBytes(없으면 0) · 이벤트 이름(입력 hook_event_name, 없으면 -).
- cwd 가 절대경로 폴더면 거기서, 아니면 fallback 에서 위로 올라가며 .agents/harness.json 이나 .agents/harness-kit.json 이 있는 첫 폴더.
- 못 찾으면 fallback 을 쓰고 stderr 에 한 줄을 남긴다. 모델을 부르지 않는다.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True

MARKERS = (".agents/harness.json", ".agents/harness-kit.json")


def read_payload():
    if sys.stdin.isatty():
        return {}
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def find_root(start):
    for folder in (start, *start.parents):
        if any((folder / marker).is_file() for marker in MARKERS):
            return folder
    return None


def git(cwd, *arguments):
    try:
        result = subprocess.run(["git", "--no-optional-locks", *arguments], cwd=cwd, capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def main_root_of(root):
    """worktree 면 (1, 메인 루트). git dir 과 common dir 이 같으면 (0, 루트)."""
    git_dir = git(root, "rev-parse", "--path-format=absolute", "--git-dir")
    common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not git_dir or not common or Path(git_dir).resolve() == Path(common).resolve():
        return 0, root
    top = git(root, "rev-parse", "--show-toplevel")
    common_path = Path(common).resolve()
    main_top = common_path.parent if common_path.name == ".git" else None
    if main_top is None or not top:
        return 1, root
    try:
        prefix = root.relative_to(Path(top).resolve())
    except ValueError:
        prefix = Path()
    return 1, (main_top / prefix).resolve()


def max_output(root, hook_id):
    try:
        data = json.loads((root / ".agents/hooks.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return 0
    hooks = data.get("hooks") if isinstance(data, dict) else None
    for hook in hooks if isinstance(hooks, list) else []:
        if isinstance(hook, dict) and hook.get("id") == hook_id:
            value = hook.get("maxOutputBytes")
            return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fallback", required=True)
    parser.add_argument("--hook", default="")
    arguments = parser.parse_args()
    fallback = Path(arguments.fallback).resolve()
    payload = read_payload()
    cwd = payload.get("cwd")
    start = Path(cwd) if isinstance(cwd, str) and cwd and Path(cwd).is_absolute() and Path(cwd).is_dir() else fallback
    root = find_root(start.resolve())
    if root is None:
        print(f"하네스 루트를 못 찾아 메인 폴더를 쓴다: {start}", file=sys.stderr)
        root = fallback
    worktree, main_root = main_root_of(root)
    event = payload.get("hook_event_name")
    event = event if isinstance(event, str) and event.replace("_", "").isalnum() else "-"
    print(root)
    print(worktree)
    print(main_root)
    print(max_output(root, arguments.hook))
    print(event)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
