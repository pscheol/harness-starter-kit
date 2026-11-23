#!/usr/bin/env python3
"""명시한 변경 파일 또는 Git 변경에 필요한 검증만 선택한다."""

import argparse
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from harness.verify_changes import changed_files, expand_gitlink_files, session_files
from harness.verify_paths import safe_file, units_for
from harness.verify_planner import verification_plan
from harness.verify_runner import execute_plan
from harness.verify_summary import summary_text


def uses_explicit_change_scope(options):
    return any((options.files, options.session))


def uses_gitlink_refs(options):
    return any((options.gitlink_base, options.gitlink_head))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument(
        "--files",
        nargs="+",
        action="extend",
        help="하네스 상대 파일 경로; 다른 세션 변경 제외",
    )
    selection.add_argument("--session", help="session-coordination.py가 기록한 세션 ID")
    parser.add_argument(
        "--tests",
        nargs="+",
        action="extend",
        default=[],
        help="추론 대신 지정할 개별 테스트 파일",
    )
    parser.add_argument("--base", help="Git 비교 기준 ref; dirty 변경도 포함")
    parser.add_argument(
        "--gitlink-base",
        help="--files의 submodule 이전 포인터를 읽을 root ref (기본 HEAD)",
    )
    parser.add_argument(
        "--gitlink-head",
        help="--files의 submodule 새 포인터를 읽을 root ref (기본 Git index)",
    )
    parser.add_argument(
        "--plan",
        action="store_true",
        help="명령·건너뛴 항목만 JSON으로 출력; 실행하지 않음",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="JSON 대신 상태·미완료·실패 명령 끝부분만 짧게 출력(Stop hook 용)",
    )
    parser.add_argument("--timeout", type=float, default=300, help="명령별 시간 제한(초)")
    parser.add_argument(
        "--lock-timeout",
        type=float,
        default=5,
        help="동일 단위 검증 잠금 대기 제한(초)",
    )
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        if not (root / ".agents/harness.json").is_file():
            raise ValueError("harness manifest is missing; use a deployed scripts/verify-changed.py")
        if not math.isfinite(options.timeout) or not math.isfinite(options.lock_timeout) or options.timeout <= 0 or options.lock_timeout < 0:
            raise ValueError("timeout must be positive and lock-timeout must be nonnegative")
        if options.base and uses_explicit_change_scope(options):
            raise ValueError("--base cannot be combined with --files or --session")
        if uses_gitlink_refs(options) and not options.files:
            raise ValueError("gitlink refs require --files")
        selected = options.files
        if selected is not None:
            selected = expand_gitlink_files(root, selected, options.gitlink_base, options.gitlink_head)
        if options.session:
            selected = session_files(root, options.session)
        if selected is None:
            selected = changed_files(root, options.base)
        files = sorted({safe_file(root, path).relative_to(root).as_posix() for path in selected})
        tests = [safe_file(root, path, must_exist=True) for path in options.tests]
        plan = verification_plan(root, files, tests, units_for(root))
        if options.plan:
            print(json.dumps(plan, ensure_ascii=False, indent=2))
            return 0
        result, exit_code = execute_plan(plan, options.timeout, options.lock_timeout)
        print(summary_text(result) if options.summary else json.dumps(result, ensure_ascii=False, indent=2))
        return exit_code
    except (ValueError, OSError) as error:
        failure = {"status": "incomplete", "error": str(error), "test_commands": 0}
        print(summary_text(failure) if options.summary else json.dumps(failure, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
