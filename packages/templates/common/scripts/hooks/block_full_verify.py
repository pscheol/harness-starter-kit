#!/usr/bin/env python3
"""에이전트 세션의 전체 검증(full)을 막는다 — 설계 01 R2 · §3.2.

훅 모드(기본): stdin 의 PreToolUse 입력에서 셸 명령을 보고, full 요청이면 exit 2 와 안내를 stderr 로 낸다.
보조 점검(--entry-check): verify-entry.sh 가 full 레벨일 때 부른다. 에이전트 환경이고 CI 가 아니면 exit 3.

해석하지 못한 입력은 통과시킨다(R2.4). 설정 `.agents/harness-kit.json` 의 verify.fullOnlyInCI 가 false 면 끈다(R2.3).
표준 라이브러리만 쓴다.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HARNESS_ROOT = Path(__file__).resolve().parents[2]
SHELL_TOOLS = frozenset({"Bash", "bash", "shell", "execute_bash", "executeBash"})
FULL_ENV = re.compile(r"(^|[\s;&|(])(export\s+)?HARNESS_VERIFY_LEVEL=[\"']?full\b")
FULL_FLAG = re.compile(r"verify(-entry)?\.sh\b[^;&|\n]*\s--full\b")
FULL_PY = re.compile(r"verify-changed\.py\b[^;&|\n]*--level[= ]full\b")
MESSAGE = """차단: 에이전트 세션에서는 전체 검증(full)을 돌리지 않는다. 전체 검증은 CI가 돈다(D10).
→ 바꾼 범위:       bash scripts/verify.sh
→ MR 올리기 전:    bash scripts/verify.sh --affected
→ 범위만 보기:     bash scripts/verify.sh --affected --plan
사람이 터미널에서 직접 실행하는 full은 막지 않는다. 이 규칙은 .agents/harness-kit.json 의 verify.fullOnlyInCI 다.
"""


def full_only_in_ci(root: Path = HARNESS_ROOT) -> bool:
    """설정이 없거나 깨졌으면 기본값 True(막는다)."""
    try:
        meta = json.loads((root / ".agents/harness-kit.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return True
    verify = meta.get("verify") if isinstance(meta, dict) else None
    if isinstance(verify, dict) and verify.get("fullOnlyInCI") is False:
        return False
    return True


def requests_full(command: str) -> bool:
    return any(p.search(command) for p in (FULL_ENV, FULL_FLAG, FULL_PY))


def shell_command(raw: str) -> str | None:
    """셸 도구 입력이면 명령 문자열, 아니면 None."""
    try:
        payload = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    tool = payload.get("tool_name")
    if tool is not None and tool not in SHELL_TOOLS:
        return None
    tool_input = payload.get("tool_input")
    command = tool_input.get("command") if isinstance(tool_input, dict) else None
    return command if isinstance(command, str) and command else None


def hook_mode(raw: str) -> int:
    command = shell_command(raw)
    if command is None or not requests_full(command) or not full_only_in_ci():
        return 0
    sys.stderr.write(MESSAGE)
    return 2


def agent_environment(env: dict[str, str]) -> bool:
    """에이전트 환경 표지. Codex · Kiro 표지는 설계 01 §6 확인 뒤 더한다."""
    return env.get("CLAUDECODE") == "1"


def entry_check(env: dict[str, str]) -> int:
    if env.get("CI") or env.get("HARNESS_VERIFY_PARENT"):
        return 0
    if not agent_environment(env) or not full_only_in_ci():
        return 0
    sys.stderr.write(MESSAGE)
    return 3


def main(argv: list[str]) -> int:
    if argv[1:] == ["--entry-check"]:
        return entry_check(dict(os.environ))
    raw = sys.stdin.read() if not sys.stdin.isatty() else ""
    return hook_mode(raw)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
