"""단위별 잠금과 시간 제한을 적용해 선택한 명령을 실행한다."""

import fcntl
import os
import re
import subprocess
import time
from contextlib import ExitStack
from pathlib import Path


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


def execute_plan(plan, timeout, lock_timeout):
    if plan["status"] == "noop":
        return plan, 0
    if plan["incomplete"]:
        return {**plan, "status": "incomplete"}, 2
    results, failures, tests, incomplete = [], 0, 0, []
    environment = {
        **os.environ,
        "PYTHONDONTWRITEBYTECODE": "1",
        "UV_NO_SYNC": "1",
        "UV_OFFLINE": "1",
    }
    with ExitStack() as stack:
        busy = acquire_locks(plan["locks"], lock_timeout, stack)
        if busy:
            return {**plan, "status": "incomplete", "incomplete": [busy]}, 2
        for item in plan["commands"]:
            try:
                result = subprocess.run(
                    item["arguments"],
                    cwd=item["cwd"],
                    env=environment,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    check=False,
                )
                outcome = {
                    "kind": item["kind"],
                    "unit": item["unit"],
                    "exit_code": result.returncode,
                    "output": (result.stdout + result.stderr)[-12000:],
                }
                if item["kind"] != "diagnostic":
                    failures += result.returncode != 0
                tests += item["kind"] == "test"
                if (
                    item["kind"] == "test"
                    and result.returncode == 0
                    and re.search(
                        r"Ran 0 tests|collected 0 items|no tests ran|# tests 0|Tests\s+0\b|\b0 passed\b",
                        outcome["output"],
                        re.IGNORECASE,
                    )
                ):
                    incomplete.append(f"{item['unit']}: zero tests executed; select --tests or opt in to full")
            except subprocess.TimeoutExpired:
                outcome = {
                    "kind": item["kind"],
                    "unit": item["unit"],
                    "exit_code": 124,
                    "output": f"command timeout after {timeout}s",
                }
                failures += item["kind"] != "diagnostic"
            except OSError as error:
                outcome = {
                    "kind": item["kind"],
                    "unit": item["unit"],
                    "exit_code": 127,
                    "output": str(error),
                }
                failures += item["kind"] != "diagnostic"
            results.append(outcome)
    if incomplete and not failures:
        return {
            **plan,
            "status": "incomplete",
            "results": results,
            "incomplete": incomplete,
            "test_commands": tests,
        }, 2
    if plan["level"] == "L1" and tests == 0 and not failures:
        return {
            **plan,
            "status": "incomplete",
            "results": results,
            "incomplete": ["changed code executed no tests; select --tests or full"],
        }, 2
    return {
        **plan,
        "status": "failed" if failures else "passed",
        "results": results,
        "test_commands": tests,
        "commands_passed": sum(result["exit_code"] == 0 for result in results),
        "commands_failed": failures,
    }, 1 if failures else 0
