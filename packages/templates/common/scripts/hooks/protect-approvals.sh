#!/usr/bin/env bash
# 쓰기 · 셸 도구 실행 전(PreToolUse) 승인 기록 · 기준선 · 관리 페이지 토큰 쓰기, 승인 명령 실행, done 승인 없는 완료 ·
# 승인 상태 변경을 막는다(설계 09 §3.8 · VQ-R12 · VQ-R13). Claude Code · Codex · Kiro 가 같은 파일을 부르고 exit 2 + stderr 만 차단이다.
# 판정은 protect_approvals.py 한 곳에 있다. 입력에 관련 낱말이 없으면 Python 을 띄우지 않고 출력 없이 끝낸다.
set -uo pipefail
payload="$(cat 2>/dev/null || true)"
if ! grep -Eq 'approvals|quality-baseline|dashboard\.token|tasks\.md|requirements\.md|design\.md|approve|api/v1' <<<"$payload"; then
  exit 0
fi
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/protect_approvals.py" <<<"$payload"
