#!/usr/bin/env python3
"""훅 입력에서 쓰는 경로를 뽑는다(HK-24 design §5). session-context.py · protect_generated.py · sync-projection.sh 가 같이 쓴다.

    python3 scripts/hooks/hook_paths.py --root <하네스 루트> < 훅 입력    # 루트 상대 경로를 한 줄씩

경로 키 여섯(Claude · Kiro)과 Codex 패치 머리줄(`*** Add|Update|Delete File|Move to:`)을 본다. 셸 명령 본문의 경로는 보지 않는다.
상대 경로는 입력의 cwd(루트 안일 때) 기준이고, 루트 밖 경로는 버린다.
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

PATH_KEYS = ("file_path", "notebook_path", "path", "targetFile", "sourcePath", "destinationPath")
PATCH_PATH = re.compile(r"^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$", re.MULTILINE)


def tool_paths(payload, root, default_dir=None):
    """root 상대 경로(정렬, 중복 없음). default_dir: cwd 가 없거나 root 밖일 때 상대 경로의 기준(기본 root)."""
    root = Path(root).resolve()
    tool_input = payload.get("tool_input", {}) if isinstance(payload, dict) else {}
    if not isinstance(tool_input, dict):
        return []
    values = [tool_input[key] for key in PATH_KEYS if isinstance(tool_input.get(key), str) and tool_input[key]]
    for key in ("command", "patch", "input"):
        if isinstance(tool_input.get(key), str):
            values.extend(PATCH_PATH.findall(tool_input[key]))
    directory_value = payload.get("cwd")
    directory = Path(directory_value) if isinstance(directory_value, str) else Path(default_dir or root)
    if not directory.is_absolute() or not directory.resolve().is_relative_to(root):
        directory = Path(default_dir or root)
    paths = []
    for value in values:
        candidate = (directory / value.strip()).resolve()
        if candidate.is_relative_to(root) and candidate != root:
            paths.append(candidate.relative_to(root).as_posix())
    return sorted(set(paths))


def read_payload():
    if sys.stdin.isatty():
        return {}
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    arguments = parser.parse_args()
    for path in tool_paths(read_payload(), arguments.root):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
