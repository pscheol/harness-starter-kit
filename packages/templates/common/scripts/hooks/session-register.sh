#!/usr/bin/env bash
# 세션 등록 훅(설계 06 §3.9). Claude Code · Codex · Kiro 가 세션 시작 · 프롬프트 제출 · 턴 끝 · 세션 종료에 부른다.
# 메인 폴더 .agents/state/sessions/<세션 id>.json 만 쓰고, 표준 출력은 대기함에 자기 세션 요청이 있을 때만 세 줄이다(평소 0바이트).
# 하네스 이름은 등록 명령이 KNS_HARNESS 로 넣는다. 이벤트는 훅 입력의 hook_event_name 에서 읽는다.
set -uo pipefail
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
command -v python3 >/dev/null 2>&1 || exit 0
exec python3 -B "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/session-register.py" --root "$HARNESS_ROOT"
