#!/usr/bin/env bash
# 각 하네스의 기존 full/fast 본문 앞에서 변경 범위 검증을 선택한다.

for verification_argument in "$@"; do
  case "$verification_argument" in
    --full) export HARNESS_VERIFY_LEVEL=full ;;
    --fast) export HARNESS_VERIFY_LEVEL=fast ;;
  esac
done

# 에이전트 세션의 full 은 CI 몫이다(설계 01 R2.6). 사람 터미널 · CI · 상위 게이트가 부른 하위 단위는 그대로 돈다.
if [ "${HARNESS_VERIFY_LEVEL:-changed}" = full ]; then
  verification_hook="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/hooks/block_full_verify.py"
  if [ -f "$verification_hook" ]; then
    python3 "$verification_hook" --entry-check || exit $?
  fi
fi

if [ "${HARNESS_VERIFY_LEVEL:-changed}" = changed ]; then
  verification_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ ! -f "$verification_script_directory/verify-changed.py" ]; then
    echo "변경 검증 실행기가 없습니다. 공통 하네스를 배포하거나 --full을 명시하십시오." >&2
    exit 2
  fi
  exec python3 "$verification_script_directory/verify-changed.py" "$@"
fi
