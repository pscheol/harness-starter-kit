#!/usr/bin/env python3
"""세션 등록 훅(설계 06 §3.9, DB-R16). session-register.sh 가 부른다.

    python3 scripts/hooks/session-register.py --root <하네스 루트> [--event start|prompt|stop|end] [--harness 이름]

- 메인 폴더의 .agents/state/sessions/<세션 id>.json(0600, 폴더 0700)을 쓴다. worktree 에서 연 세션도 같은 곳이다.
- 이벤트: 훅 입력 hook_event_name(SessionStart · agentSpawn → start, UserPromptSubmit · userPromptSubmit → prompt,
  Stop · stop → stop, SessionEnd → end). prompt 는 turn: working, stop 은 idle, end 는 파일을 지운다.
- start · prompt 뒤 대기함 소비(dispatch-inbox.py). 표준 출력은 그 출력뿐이고 평소 0바이트다.
- CLAUDE_CODE_MESSAGING_TOKEN 은 저장하지 않는다. 모델을 부르지 않는다.
"""

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True

SESSION = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z")
BRANCH_KEY = re.compile(r"^(?:feat|fix|chore|docs|refactor|exp|perf)/([A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5})-")
EVENTS = {"SessionStart": "start", "agentSpawn": "start", "UserPromptSubmit": "prompt", "userPromptSubmit": "prompt",
          "Stop": "stop", "stop": "stop", "SessionEnd": "end", "sessionEnd": "end"}
HARNESSES = ("claude", "codex", "kiro", "cursor")
EXECUTABLES = {"claude": "claude", "codex": "codex", "kiro": "kiro", "kiro-cli": "kiro"}
INTERPRETERS = {"node", "nodejs", "bun", "deno"}
SCHEMA = "harness-kit.session/v1"


def read_payload():
    if sys.stdin.isatty():
        return {}
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def session_id(payload):
    candidates = [payload.get("session_id"), payload.get("sessionId")]
    candidates += [os.environ.get(name) for name in ("HARNESS_SESSION_ID", "CLAUDE_SESSION_ID", "CODEX_SESSION_ID", "KIRO_SESSION_ID")]
    return next((value for value in candidates if isinstance(value, str) and SESSION.fullmatch(value)), None)


def inbox_module():
    spec = importlib.util.spec_from_file_location("hx_dispatch_inbox", Path(__file__).with_name("dispatch-inbox.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(cwd, *arguments):
    try:
        result = subprocess.run(["git", "--no-optional-locks", *arguments], cwd=cwd, capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def harness_of(explicit):
    name = explicit or os.environ.get("HX_HARNESS") or ""
    if name in HARNESSES:
        return name
    if os.environ.get("CLAUDECODE") == "1":
        return "claude"
    if any(key.startswith("CODEX_") and key != "CODEX_HOME" for key in os.environ):
        return "codex"
    if any(key.startswith("KIRO_") and key != "KIRO_HOME" for key in os.environ):
        return "kiro"
    return "unknown"


def process_row(pid):
    try:
        row = subprocess.run(["ps", "-o", "ppid=", "-o", "comm=", "-p", str(pid)], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
        args = subprocess.run(["ps", "-o", "args=", "-p", str(pid)], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return None
    parent, _, command = row.partition(" ")
    try:
        return int(parent), command.strip(), args
    except ValueError:
        return None


def harness_process():
    """부모를 20단계까지 올라가 하네스 실행 파일(claude · codex · kiro · kiro-cli)을 찾는다. (pid, ps lstart) 또는 (None, None)."""
    current = os.getppid()
    for _ in range(20):
        if current <= 1:
            break
        row = process_row(current)
        if row is None:
            break
        parent, command, args = row
        names = {os.path.basename(command).lstrip("-")}
        tokens = args.split()
        if tokens:
            first = os.path.basename(tokens[0]).lstrip("-")
            names.add(first)
            if first in INTERPRETERS and len(tokens) > 1:
                names.add(os.path.basename(tokens[1]))
        if names & set(EXECUTABLES):
            try:
                started = subprocess.run(["ps", "-o", "lstart=", "-p", str(current)], capture_output=True, text=True, timeout=5, check=False).stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                started = None
            return current, started or None
        current = parent
    return None, None


def role_of(branch, meta, harness):
    if os.environ.get("HX_ROLE"):
        return os.environ["HX_ROLE"], "env"
    if branch and BRANCH_KEY.match(branch) and not branch.startswith("docs/"):
        return "implement", "branch"
    if branch and branch.startswith("docs/"):
        return "docs", "branch"
    roles = meta.get("roles") if isinstance(meta.get("roles"), dict) else {}
    mine = [name for name, value in roles.items() if isinstance(value, dict) and value.get("harness") == harness]
    if len(mine) == 1:
        return mine[0], "config"
    return "unknown", "none"


def issue_of(branch):
    if os.environ.get("HX_ISSUE"):
        return os.environ["HX_ISSUE"]
    match = BRANCH_KEY.match(branch or "")
    return match.group(1) if match else None


def read_json(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def now_text():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def record(root, main, payload, sid, harness, previous):
    meta = read_json(root / ".agents/harness-kit.json") or read_json(main / ".agents/harness-kit.json") or {}
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD")
    top = git(root, "rev-parse", "--show-toplevel")
    main_top = git(main, "rev-parse", "--show-toplevel")
    role, source = role_of(branch, meta, harness)
    pid, started = harness_process()
    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) and os.path.isabs(payload["cwd"]) else os.getcwd()
    socket = os.environ.get("CLAUDE_CODE_MESSAGING_SOCKET")
    mode = payload.get("permission_mode") or payload.get("permissionMode")
    now = now_text()
    return {
        "schema": SCHEMA, "id": sid, "harness": harness, "harnessVersion": None,
        "name": os.environ.get("HX_SESSION_NAME") or (previous or {}).get("name"),
        "role": role, "roleSource": source, "issue": issue_of(branch), "cwd": cwd,
        "checkout": "main" if top and main_top and Path(top).resolve() == Path(main_top).resolve() else "worktree", "branch": branch,
        "pid": pid, "pidStartedAt": started, "startedAt": (previous or {}).get("startedAt") or now, "lastSeenAt": now,
        "turn": "idle", "inbox": {"kind": "uds", "path": socket} if socket else None,
        "permissionMode": mode if isinstance(mode, str) else None,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="세션 등록")
    parser.add_argument("--root", required=True)
    parser.add_argument("--event", choices=("start", "prompt", "stop", "end"))
    parser.add_argument("--harness")
    options = parser.parse_args(argv)
    payload = read_payload()
    sid = session_id(payload)
    if not sid:
        return 0
    event = options.event or EVENTS.get(str(payload.get("hook_event_name") or ""), "start")
    inbox = inbox_module()
    root = Path(options.root).resolve()
    main_root = inbox.main_root(root)
    path = main_root / ".agents/state/sessions" / f"{sid}.json"
    if event == "end":
        path.unlink(missing_ok=True)
        return 0
    previous = read_json(path)
    harness = harness_of(options.harness)
    if previous and event in ("prompt", "stop"):
        data = {**previous, "turn": "working" if event == "prompt" else "idle", "lastSeenAt": now_text()}
    else:
        data = record(root, main_root, payload, sid, harness, previous)
        if event == "prompt":
            data["turn"] = "working"
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    inbox.write_json(path, data)
    if event in ("start", "prompt"):
        sys.stdout.write(inbox.consume(root, data))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"세션 등록 실패: {error}", file=sys.stderr)
        sys.exit(0)
