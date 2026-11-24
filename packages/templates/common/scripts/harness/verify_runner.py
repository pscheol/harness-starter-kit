"""단위별 잠금과 시간 제한을 적용해 선택한 명령을 실행한다."""

import fcntl
import os
import re
import subprocess
import sys
import time
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path

ZERO_TESTS = re.compile(r"Ran 0 tests|collected 0 items|no tests ran|# tests 0|Tests\s+0\b|\b0 passed\b", re.IGNORECASE)
TESTING_KINDS = {"test", "gate"}


def acquire_locks(paths, timeout, stack):
    for path in paths:
        descriptor = os.open(path, os.O_CREAT | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0), 0o600)
        handle = stack.enter_context(os.fdopen(descriptor, "a"))
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    return f"build unit lock is busy: {Path(path).name}; no commands ran"
                time.sleep(min(0.1, max(0, deadline - time.monotonic())))
    return None


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def label_of(item):
    return item.get("label") or " ".join([Path(item["arguments"][0]).name, *item["arguments"][1:3]])[:80]


def run_command(index, item, environment, timeout):
    started, clock = now_iso(), time.monotonic()
    outcome = {"index": index, "kind": item["kind"], "unit": item["unit"], "label": label_of(item), "started_at": started}
    try:
        result = subprocess.run(
            item["arguments"],
            cwd=item["cwd"],
            env={**environment, **item.get("env", {})},
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        outcome.update(exit_code=result.returncode, output=(result.stdout + result.stderr)[-12000:])
    except subprocess.TimeoutExpired:
        outcome.update(exit_code=124, output=f"command timeout after {timeout}s")
    except OSError as error:
        outcome.update(exit_code=127, output=str(error))
    outcome["duration_ms"] = int((time.monotonic() - clock) * 1000)
    return outcome


def progress(item):
    """게이트 위임은 오래 걸린다 — 어느 하네스를 도는지 stderr 에 한 줄 남긴다."""
    if item["kind"] == "gate":
        print(f"▶ {item.get('label') or item['unit']}", file=sys.stderr, flush=True)


def execute_plan(plan, timeout, lock_timeout, budget=None):
    if plan["status"] == "noop":
        return plan, 0
    if plan["incomplete"] or plan.get("unverified"):
        return {**plan, "status": "incomplete"}, 2
    results, failures, tests, incomplete, skipped, unverified = [], 0, 0, [], [], []
    environment = {
        **os.environ,
        "PYTHONDONTWRITEBYTECODE": "1",
        "UV_NO_SYNC": "1",
        "UV_OFFLINE": "1",
    }
    for skipped_unit in plan.get("skippedUnits", []):
        print(f"↷ {skipped_unit['id']} 건너뜀 — 변경 없음", file=sys.stderr, flush=True)
    clock = time.monotonic()
    with ExitStack() as stack:
        busy = acquire_locks(plan["locks"], lock_timeout, stack)
        if busy:
            return {**plan, "status": "incomplete", "incomplete": [busy]}, 2
        for index, item in enumerate(plan["commands"]):
            if budget is not None and time.monotonic() - clock >= budget:
                skipped.append(f"{item['unit']} {item['kind']} {label_of(item)}: budget {budget:g}s exceeded; not run")
                continue
            progress(item)
            outcome = run_command(index, item, environment, timeout)
            if item["kind"] != "diagnostic":
                failures += outcome["exit_code"] != 0
            tests += item["kind"] in TESTING_KINDS
            if item["kind"] == "test" and outcome["exit_code"] == 0 and ZERO_TESTS.search(outcome["output"]):
                if item.get("widenedFiles"):
                    # 넓힌 모듈 시험이 0개를 돌았다 — 그 파일들은 검증되지 않았다(R3.2).
                    unverified.extend({"file": relative, "reason": "zero-tests"} for relative in item["widenedFiles"])
                else:
                    incomplete.append(f"{item['unit']}: zero tests executed; select --tests <test-file> or add a test")
            results.append(outcome)
    summary = {"results": results, "test_commands": tests, "skipped": plan.get("skipped", []) + skipped}
    if unverified and not failures:
        return {**plan, **summary, "status": "incomplete", "unverified": plan.get("unverified", []) + unverified}, 2
    if skipped and not failures:
        return {**plan, **summary, "status": "incomplete"}, 2
    if incomplete and not failures:
        return {**plan, **summary, "status": "incomplete", "incomplete": incomplete}, 2
    if plan.get("scope", plan["level"]) == "L1" and tests == 0 and not failures:
        return {**plan, **summary, "status": "incomplete", "incomplete": ["changed code executed no tests; select --tests <test-file> or add a test"]}, 2
    return {
        **plan,
        **summary,
        "status": "failed" if failures else "passed",
        "commands_passed": sum(result["exit_code"] == 0 for result in results),
        "commands_failed": failures,
    }, 1 if failures else 0
