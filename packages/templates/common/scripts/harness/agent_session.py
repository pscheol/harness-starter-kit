"""에이전트 세션 판정(설계 06 §3.11 · 09 §3.8). 표준 라이브러리만 쓴다.

- 환경 표지: CLAUDECODE=1, CLAUDE_CODE_MESSAGING_SOCKET, CODEX_*(CODEX_HOME 제외), KIRO_*(KIRO_HOME 제외), CURSOR_AGENT.
- 부모 프로세스: 위로 20단계까지 실행 파일 이름(또는 node 로 띄운 스크립트 이름)이 하네스다.

사람 터미널 승인(approve.py)은 둘 다 본다. git 훅과 fast 는 환경 표지만 본다(사람 커밋을 막지 않는다).
"""

import os
import subprocess

HARNESS_NAMES = frozenset({"claude", "codex", "kiro", "kiro-cli", "cursor-agent"})
INTERPRETERS = frozenset({"node", "nodejs", "bun", "deno"})
PERSONAL = frozenset({"CODEX_HOME", "KIRO_HOME"})
DEPTH = 20


def env_marker(environ=None):
    """에이전트 환경 표지 이름. 없으면 None."""
    environ = os.environ if environ is None else environ
    if environ.get("CLAUDECODE") == "1":
        return "CLAUDECODE=1"
    if environ.get("CLAUDE_CODE_MESSAGING_SOCKET"):
        return "CLAUDE_CODE_MESSAGING_SOCKET"
    for key in sorted(environ):
        if key in PERSONAL or not environ.get(key):
            continue
        if key.startswith(("CODEX_", "KIRO_")):
            return key
    if environ.get("CURSOR_AGENT"):
        return "CURSOR_AGENT"
    return None


def process_row(pid):
    """(부모 pid, 실행 파일, 인자) 또는 None."""
    try:
        result = subprocess.run(["ps", "-o", "ppid=", "-o", "comm=", "-p", str(pid)], capture_output=True, text=True, timeout=5, check=False)
        args = subprocess.run(["ps", "-o", "args=", "-p", str(pid)], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    row = result.stdout.strip()
    if result.returncode != 0 or not row:
        return None
    parent, _, command = row.partition(" ")
    try:
        return int(parent), command.strip(), args.stdout.strip()
    except ValueError:
        return None


def harness_name(command, args):
    names = {os.path.basename(command).lstrip("-")}
    tokens = args.split()
    if tokens:
        first = os.path.basename(tokens[0]).lstrip("-")
        names.add(first)
        if first in INTERPRETERS and len(tokens) > 1:
            names.add(os.path.basename(tokens[1]))
    found = names & HARNESS_NAMES
    return sorted(found)[0] if found else None


def parent_marker(pid=None):
    """부모 사슬에 하네스 프로세스가 있으면 `부모 프로세스 <이름>`. 못 읽으면 None."""
    current = os.getppid() if pid is None else pid
    for _ in range(DEPTH):
        if current <= 1:
            return None
        row = process_row(current)
        if row is None:
            return None
        parent, command, args = row
        name = harness_name(command, args)
        if name:
            return f"부모 프로세스 {name}"
        current = parent
    return None


def agent_session(environ=None, parents=True):
    """에이전트 세션이면 그 근거 문자열, 아니면 None."""
    return env_marker(environ) or (parent_marker() if parents else None)
