#!/usr/bin/env python3
"""다른 세션의 검증 본문을 보존하면서 공통 변경 검증 진입을 설치한다."""

import argparse
import hashlib
import json
from pathlib import Path

from sync_safety import SafetyError, atomic_write, deployment_lock, file_state, load_snapshot, validate_path


START = "# BEGIN HARNESS VERIFICATION ENTRY"
END = "# END HARNESS VERIFICATION ENTRY"
ENTRY = START + '\n. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-entry.sh"\n' + END + "\n"


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def planned_entry(text):
    if START in text:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError("불완전한 검증 진입 블록")
        return text
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        if line.startswith("set -"):
            return "".join([*lines[:index + 1], "\n", ENTRY, *lines[index + 1:]])
    raise ValueError("shell 옵션 선언을 찾을 수 없음")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--baseline", type=Path, required=True)
    arguments = parser.parse_args()
    root = arguments.repo.resolve()
    baseline = load_snapshot(arguments.baseline)
    units = json.loads((root / "tools/harness/units.json").read_text())["units"]
    plans = []
    for unit in units:
        relative = (Path(unit["path"]) / "scripts/verify.sh").as_posix()
        if Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise ValueError(f"안전한 검증 경로가 아님: {relative}")
        path = root / relative
        validate_path(root, path)
        if path.is_symlink() or not path.resolve().is_relative_to(root) or not path.is_file():
            raise ValueError(f"안전한 검증 파일이 아님: {relative}")
        original = path.read_text()
        updated = planned_entry(original)
        if original == updated:
            continue
        expected = baseline.get(relative)
        if not expected or file_state(root, relative) != expected:
            raise ValueError(f"다른 세션의 변경 또는 기준선 없음: {relative}")
        plans.append((relative, expected, updated))
    with deployment_lock(root):
        for relative, expected, updated in plans:
            if file_state(root, relative) != expected:
                raise ValueError(f"설치 직전 변경: {relative}")
        for relative, expected, updated in plans:
            atomic_write(root, relative, updated, expected["mode"], expected)
            print(f"검증 진입 설치: {relative}")
    print(f"검증 진입 {len(plans)}개 갱신; 기존 fast/full 본문 보존")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, SafetyError) as error:
        print(f"검증 진입 설치 실패: {error}")
        raise SystemExit(2)
