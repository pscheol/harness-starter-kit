#!/usr/bin/env bash
# 쓰기 도구 실행 전(PreToolUse) 보호 경로 수정을 막는다. Claude Code · Codex · Kiro 가 같은 파일을 부르고, exit 2 + stderr 만 차단으로 본다.
# 경로 키 여섯과 Codex 패치 머리줄을 본다(목록은 하네스 설명서 §6). 셸 명령에 나온 경로는 보지 않고, 경로를 못 찾으면 통과시킨다.
set -uo pipefail

PROTECTED="{{PROTECTED_PATH}}"
payload="$(cat 2>/dev/null || true)"
KEY_RE="\"(file_path|notebook_path|path|targetFile|sourcePath|destinationPath)\"[[:space:]]*:[[:space:]]*\"([^\"]*/)?($PROTECTED)(/|\")"
PATCH_RE="(^|\"|\\\\n)[[:space:]]*\\*\\*\\* (Add File|Update File|Delete File|Move to): ([^\"\\\\]*/)?($PROTECTED)(/|\"|\\\\)"

# 파이프로 넘기면 grep -q 가 먼저 끝날 때 printf 가 SIGPIPE 로 실패해(pipefail) 판정이 통과로 바뀐다.
if grep -Eq -e "$KEY_RE" -e "$PATCH_RE" <<<"$payload"; then
  echo "차단: '$PROTECTED/' 는 외부 참고 원본이라 고치지 않는다(패턴만 참고한다)." >&2
  echo "→ 산출물은 이 하네스의 소스 폴더나 .agents/docs/ 에 쓴다." >&2
  exit 2
fi
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
if [ -f "$HARNESS_ROOT/scripts/hooks/session-context.py" ]; then
  python3 "$HARNESS_ROOT/scripts/hooks/session-context.py" --root "$HARNESS_ROOT" --event pre-tool <<<"$payload"
  exit $?
fi
exit 0
