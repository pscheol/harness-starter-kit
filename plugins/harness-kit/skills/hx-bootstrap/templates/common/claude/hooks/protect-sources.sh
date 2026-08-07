#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — {{PROTECTED_PATH}} 치환 후 사용.
#
# PreToolUse(Write|Edit|MultiEdit) hook: 외부 참고 코드/원본 경로 수정 차단.
# 일반 문서는 편집 허용. 보호 경로(PROTECTED_PATH)만 잠근다.
# stdin으로 도구 입력 JSON을 받는다. 차단은 exit 2 + stderr 메시지.
set -euo pipefail

# 보호할 경로(디렉터리 접두). 프로젝트에 맞게 바꾸거나 여러 개면 정규식으로 확장.
PROTECTED_PATH="{{PROTECTED_PATH}}"   # 기본값 예: docs/references

input="$(cat)"

# tool_input.file_path 가 보호 경로를 가리키면 차단
if printf '%s' "$input" | grep -Eq "\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*${PROTECTED_PATH}/"; then
  echo "차단: '${PROTECTED_PATH}/' 는 외부 참고/원본 경로로 수정 금지(패턴만 참고)입니다." >&2
  echo "→ 구현 산출물은 소스 트리(예: services/{{PROJECT_SLUG}}-api/, src/) 또는 .agents/docs/ 에 작성하세요." >&2
  exit 2
fi

exit 0
