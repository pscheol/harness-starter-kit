#!/usr/bin/env bash
# 셸 도구 실행 전(PreToolUse) 전체 검증(full) 요청을 막는다. Claude Code · Codex · Kiro 가 같은 파일을 부르고,
# exit 2 + stderr 만 차단으로 본다. 판정은 block_full_verify.py 한 곳에 있다(설계 01 §3.2).
# 사람 터미널과 CI 에는 하네스 훅이 없으므로 이 훅이 돌지 않는다.
set -uo pipefail
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/block_full_verify.py"
