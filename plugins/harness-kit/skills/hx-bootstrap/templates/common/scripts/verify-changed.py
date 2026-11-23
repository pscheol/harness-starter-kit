#!/usr/bin/env python3
"""명시한 변경 파일 또는 Git 변경에 필요한 검증만 선택한다.

레벨(설계 01 §3.0): changed(기본) — 바뀐 파일과 연결된 테스트. affected — 바뀐 파일이 속한 모듈과
그 모듈을 쓰는 모듈의 검사. 변경 집합은 merge-base(HEAD, origin/<git.base>) 이후 커밋 + 작업 트리다.
"""

import argparse
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from harness.verify_affected import affected_plan
from harness.verify_changes import changed_files, expand_gitlink_files, resolve_base, session_files
from harness.verify_paths import safe_file, units_for
from harness.verify_planner import verification_plan
from harness.verify_runner import execute_plan
from harness.verify_summary import summary_text

DEFAULT_TIMEOUT = {"changed": 300, "affected": 900}
DEFAULT_BUDGET = {"changed": None, "affected": 1200}


def uses_explicit_change_scope(options):
    return any((options.files, options.session))


def uses_gitlink_refs(options):
    return any((options.gitlink_base, options.gitlink_head))


def parse_options():
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
    parser.add_argument("--level", choices=("changed", "affected"), default="changed", help="검증 레벨(기본 changed)")
    parser.add_argument("--base", help="Git 비교 기준 ref; dirty 변경도 포함(affected 기본은 origin/<git.base>)")
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
    parser.add_argument("--timeout", type=float, help="명령별 시간 제한(초; changed 300 · affected 900)")
    parser.add_argument("--budget", type=float, help="전체 시간 상한(초; affected 1200). 넘으면 남은 명령을 돌리지 않는다")
    parser.add_argument(
        "--lock-timeout",
        type=float,
        default=5,
        help="동일 단위 검증 잠금 대기 제한(초)",
    )
    options = parser.parse_args()
    options.timeout = DEFAULT_TIMEOUT[options.level] if options.timeout is None else options.timeout
    options.budget = DEFAULT_BUDGET[options.level] if options.budget is None else options.budget
    return options


def validate(root, options):
    if not (root / ".agents/harness.json").is_file():
        raise ValueError("harness manifest is missing; use a deployed scripts/verify-changed.py")
    limits = [options.timeout, options.lock_timeout, *([options.budget] if options.budget is not None else [])]
    if not all(math.isfinite(value) for value in limits) or options.timeout <= 0 or options.lock_timeout < 0 or (options.budget is not None and options.budget <= 0):
        raise ValueError("timeout and budget must be positive and lock-timeout must be nonnegative")
    if options.base and uses_explicit_change_scope(options):
        raise ValueError("--base cannot be combined with --files or --session")
    if uses_gitlink_refs(options) and not options.files:
        raise ValueError("gitlink refs require --files")


def selected_files(root, options):
    """(변경 파일, base). affected 의 Git 변경은 merge-base 이후 커밋과 작업 트리를 합친다."""
    if options.files is not None:
        return expand_gitlink_files(root, options.files, options.gitlink_base, options.gitlink_head), None
    if options.session:
        return session_files(root, options.session), None
    if options.level == "affected":
        base = resolve_base(root, options.base)
        return changed_files(root, base["mergeBase"]), base
    return changed_files(root, options.base), None


def build_plan(root, options):
    selected, base = selected_files(root, options)
    files = sorted({safe_file(root, path).relative_to(root).as_posix() for path in selected})
    tests = [safe_file(root, path, must_exist=True) for path in options.tests]
    if options.level == "affected":
        return affected_plan(root, files, tests, units_for(root), base)
    return verification_plan(root, files, tests, units_for(root))


def main():
    options = parse_options()
    root = Path(__file__).resolve().parents[1]
    try:
        validate(root, options)
        plan = build_plan(root, options)
        if options.plan:
            print(json.dumps(plan, ensure_ascii=False, indent=2))
            return 0
        result, exit_code = execute_plan(plan, options.timeout, options.lock_timeout, options.budget)
        print(summary_text(result) if options.summary else json.dumps(result, ensure_ascii=False, indent=2))
        return exit_code
    except (ValueError, OSError) as error:
        failure = {"status": "incomplete", "level": options.level, "error": str(error), "test_commands": 0}
        print(summary_text(failure) if options.summary else json.dumps(failure, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
