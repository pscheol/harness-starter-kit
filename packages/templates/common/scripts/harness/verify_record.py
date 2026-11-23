#!/usr/bin/env python3
"""검증 실행 기록 `.agents/state/verify-last.json`(설계 01 §3.5). 쓰기 실패는 경고 한 줄만 내고 검증 결과를 바꾸지 않는다.

changed · affected 는 verify-changed.py 가 record_result() 로 쓴다. fast · full 은 verify-entry.sh 가 본문 stdout 을 흘린다:

    bash scripts/verify.sh … | python3 scripts/harness/verify_record.py --tee --level fast --root .
    python3 scripts/harness/verify_record.py --status blocked --level full --exit 3 --root .

`--tee` 는 줄을 그대로 내보내고(`::harness-exit <code>` 는 내보내지 않는다), `▶ ` 줄을 단계 시작으로,
같은 단계의 `✖ ` 줄을 단계 실패로 본다.
"""

import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "harness-kit.verify-last/v1"
RECORD = ".agents/state/verify-last.json"
MAX_BYTES = 256 * 1024
SAMPLE = 20
COMMAND_HEAD = 20
EXIT_LINE = re.compile(r"^::harness-exit (\d+)\s*$")
STEP, FAILURE = "▶ ", "✖ "
PYTEST_PASSED = re.compile(r"\b(\d+) passed\b")
PYTEST_FAILED = re.compile(r"\b(\d+) failed\b")
UNITTEST_RAN = re.compile(r"\bRan (\d+) tests?\b")
UNITTEST_FAILED = re.compile(r"\b(?:failures|errors)=(\d+)")


def iso(moment):
    return datetime.fromtimestamp(moment, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_id(moment):
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(moment)) + "-" + secrets.token_hex(2)


def harness_name(environment):
    """에이전트 환경 표지로 하네스를 정한다. Codex · Kiro · Cursor 표지는 설계 01 §6 확인 전 값이다."""
    if environment.get("CI"):
        return "ci"
    if environment.get("CLAUDECODE") == "1":
        return "claude"
    if any(key.startswith("CODEX_") for key in environment):
        return "codex"
    if any("KIRO" in key for key in environment):
        return "kiro"
    if environment.get("CURSOR_AGENT"):
        return "cursor"
    return "human"


def trigger_name(environment):
    return environment.get("HARNESS_VERIFY_TRIGGER") or ("ci" if environment.get("CI") else "cli")


def git_text(root, *arguments):
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def head_of(root):
    branch = git_text(root, "rev-parse", "--abbrev-ref", "HEAD")
    status = git_text(root, "status", "--porcelain", "--", ".", ":(exclude).agents/state")
    return {
        "branch": None if branch in (None, "HEAD") else branch,
        "sha": git_text(root, "rev-parse", "HEAD"),
        "dirty": bool(status) if status is not None else None,
    }


def new_record(root, level, started, finished, status, exit_code, environment=None):
    environment = os.environ if environment is None else environment
    return {
        "schema": SCHEMA,
        "runId": run_id(started),
        "level": level,
        "trigger": trigger_name(environment),
        "harness": harness_name(environment),
        "sessionId": environment.get("HARNESS_SESSION_ID") or None,
        "root": str(root),
        "base": None,
        "head": head_of(root),
        "startedAt": iso(started),
        "finishedAt": iso(finished),
        "durationMs": int((finished - started) * 1000),
        "status": status,
        "exitCode": exit_code,
        "files": {"count": 0, "sample": []},
        "units": [],
        "skippedUnits": [],
        "steps": [],
        "widened": [],
        "unverified": [],
        "recommendations": [],
        "previous": {},
    }


def test_counts(output):
    """출력에서 셀 수 있을 때만 {"run", "failed"}(pytest · unittest)."""
    text = output or ""
    passed, failed = PYTEST_PASSED.findall(text), PYTEST_FAILED.findall(text)
    if passed or failed:
        failures = int(failed[-1]) if failed else 0
        return {"run": (int(passed[-1]) if passed else 0) + failures, "failed": failures}
    ran = UNITTEST_RAN.findall(text)
    if ran:
        return {"run": int(ran[-1]), "failed": sum(int(count) for count in UNITTEST_FAILED.findall(text))}
    return None


def relative_folder(path, root):
    try:
        return Path(path).relative_to(root).as_posix() or "."
    except ValueError:
        return str(path)


def result_steps(result, root):
    commands = result.get("commands", [])
    steps = []
    for number, outcome in enumerate(result.get("results", []), 1):
        planned = commands[outcome["index"]] if 0 <= outcome.get("index", -1) < len(commands) else {}
        step = {
            "id": number,
            "unit": outcome.get("unit"),
            "kind": outcome.get("kind"),
            "label": outcome.get("label"),
            "command": planned.get("arguments"),
            "cwd": relative_folder(planned.get("cwd", root), root),
            "startedAt": outcome.get("started_at"),
            "durationMs": outcome.get("duration_ms", 0),
            "exitCode": outcome.get("exit_code"),
            "status": "passed" if outcome.get("exit_code") == 0 else "failed",
        }
        counts = test_counts(outcome.get("output")) if outcome.get("kind") == "test" else None
        if counts:
            step["tests"] = counts
        steps.append(step)
    return steps


def result_units(result, root):
    units = {}
    for module in result.get("modules", []):
        reason = "build-contract" if module.get("widened") else ("changed+dependents" if module["selected"] != module["changed"] else "changed")
        entry = units.setdefault(module["unit"], {"id": module["unit"], "modules": [], "reason": reason})
        entry["stack"] = module["stack"]
        entry["modules"] = sorted(set(entry["modules"]) | set(module["selected"]))
    for planned in result.get("commands", []):
        if planned["kind"] == "gate":
            units[planned["unit"]] = {"id": planned["unit"], "reason": "gate", "lastRun": relative_folder(Path(planned["cwd"]) / RECORD, root)}
        else:
            units.setdefault(planned["unit"], {"id": planned["unit"], "reason": "changed"})
    return list(units.values())


def record_result(root, result, level, started, exit_code, session=None):
    """verify-changed.py 실행 결과 → 기록."""
    record = new_record(root, level, started, time.time(), result.get("status", "incomplete"), exit_code)
    files = result.get("files", [])
    record.update({
        "sessionId": session or record["sessionId"],
        "base": result.get("base"),
        "files": {"count": len(files), "sample": files[:SAMPLE]},
        "units": result_units(result, root),
        "skippedUnits": result.get("skippedUnits", []),
        "steps": result_steps(result, root),
        "widened": result.get("widened", []),
        "unverified": result.get("unverified", []),
        "recommendations": result.get("recommendations", []),
    })
    if result.get("error"):
        record["error"] = result["error"]
    if result.get("incomplete"):
        record["incomplete"] = result["incomplete"][:SAMPLE]
    return record


def previous_runs(path):
    """직전 파일의 레벨별 요약에 직전 실행을 덮어 넣는다."""
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(old, dict):
        return {}
    runs = dict(old["previous"]) if isinstance(old.get("previous"), dict) else {}
    if old.get("level") and old.get("runId"):
        runs[old["level"]] = {key: old.get(key) for key in ("runId", "status", "finishedAt", "durationMs")}
    return runs


def fit(record):
    """256KB 를 넘으면 명령 인자를 줄이고, 그래도 넘으면 단계를 앞에서부터 남긴다."""
    text = json.dumps(record, ensure_ascii=False, indent=2)
    if len(text.encode()) <= MAX_BYTES:
        return text
    record = {**record, "truncated": True}
    record["steps"] = [{**step, "command": step["command"][:COMMAND_HEAD] if isinstance(step.get("command"), list) else step.get("command")} for step in record.get("steps", [])]
    while True:
        text = json.dumps(record, ensure_ascii=False, indent=2)
        if len(text.encode()) <= MAX_BYTES or not record["steps"]:
            return text
        record["steps"] = record["steps"][: len(record["steps"]) // 2]


def write_record(root, record, stream=None):
    """원자적으로 쓴다(같은 폴더의 임시 파일 → rename). 실패하면 경고만 낸다."""
    path = Path(root) / RECORD
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        ignore = path.parent / ".gitignore"
        if not ignore.exists():
            ignore.write_text("*\n", encoding="utf-8")
        text = fit({**record, "previous": previous_runs(path)})
        descriptor, temporary = tempfile.mkstemp(prefix=".verify-last.", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(text + "\n")
            os.replace(temporary, path)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        return True
    except OSError as error:
        print(f"⚠ 검증 기록을 쓰지 못했다: {path}: {error}", file=stream or sys.stderr)
        return False


class Steps:
    """본문 출력의 `▶ ` · `✖ ` 줄로 단계를 센다."""

    def __init__(self):
        self.items, self.current = [], None

    def close(self, moment):
        if self.current is not None and "durationMs" not in self.current:
            self.current["durationMs"] = int((moment - self.current.pop("_start")) * 1000)

    def line(self, text, moment):
        if text.startswith(STEP):
            self.close(moment)
            self.current = {"label": text[len(STEP):].strip(), "_start": moment, "startedAt": iso(moment), "failed": False}
            self.items.append(self.current)
        elif text.startswith(FAILURE):
            if self.current is None:
                self.line(STEP + "(첫 단계 전)", moment)
            self.current["failed"] = True

    def records(self, unit):
        return [
            {
                "id": number, "unit": unit, "kind": "step", "label": step["label"], "command": None, "cwd": ".",
                "startedAt": step["startedAt"], "durationMs": step["durationMs"],
                "exitCode": 1 if step["failed"] else 0, "status": "failed" if step["failed"] else "passed",
            }
            for number, step in enumerate(self.items, 1)
        ]


def unit_id(root):
    try:
        return json.loads((Path(root) / ".agents/harness.json").read_text(encoding="utf-8")).get("unit")
    except (OSError, ValueError, AttributeError):
        return None


def tee(options):
    started, steps, exit_code = time.time(), Steps(), None
    output = sys.stdout.buffer
    for raw in sys.stdin.buffer:
        text = raw.decode("utf-8", "replace").rstrip("\r\n")
        match = EXIT_LINE.match(text)
        if match:
            exit_code = int(match.group(1))
            continue
        try:
            output.write(raw)
            output.flush()
        except BrokenPipeError:
            output = open(os.devnull, "wb")  # 받는 쪽이 닫혀도 본문이 SIGPIPE 로 죽지 않게 끝까지 읽는다
        steps.line(text, time.time())
    finished = time.time()
    steps.close(finished)
    status = "incomplete" if exit_code is None else ("passed" if exit_code == 0 else "failed")
    record = new_record(options.root, options.level, started, finished, status, exit_code)
    record["steps"] = steps.records(unit_id(options.root))
    record["units"] = [{"id": unit_id(options.root), "reason": options.level}]
    write_record(options.root, record)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, required=True, help="하네스 루트")
    parser.add_argument("--level", choices=("fast", "changed", "affected", "full"), required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--tee", action="store_true", help="stdin 을 그대로 내보내며 단계를 기록한다")
    mode.add_argument("--status", choices=("blocked", "incomplete"), help="실행 없이 상태만 기록한다")
    parser.add_argument("--exit", type=int, default=None, help="--status 와 함께 쓰는 exit code")
    options = parser.parse_args()
    options.root = options.root.resolve()
    if options.tee:
        return tee(options)
    moment = time.time()
    write_record(options.root, new_record(options.root, options.level, moment, moment, options.status, options.exit))
    return 0


if __name__ == "__main__":
    sys.exit(main())
