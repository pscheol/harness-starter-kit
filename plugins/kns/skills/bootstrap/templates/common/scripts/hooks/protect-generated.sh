#!/usr/bin/env bash
# 쓰기 도구 실행 전(PreToolUse) 하네스 폴더의 생성 파일(.agents/ 원본에서 만든 복사본 · 생성물) 직접 편집을 막는다(설계 03 §3.12).
# Claude Code · Codex · Kiro 가 디스패처로 부르고 exit 2 + stderr 만 차단이다. 판정은 protect_generated.py 한 곳에 있다.
# 입력에 하네스 폴더 이름이 없으면 Python 을 띄우지 않고 출력 없이 끝낸다.
set -uo pipefail
payload="$(cat 2>/dev/null || true)"
if ! grep -Eq '\.(claude|codex|cursor|kiro)/' <<<"$payload"; then
  exit 0
fi
command -v python3 >/dev/null 2>&1 || exit 0
exec python3 -B "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/protect_generated.py" <<<"$payload"
