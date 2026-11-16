#!/usr/bin/env bash
# 각 하네스의 기존 full/fast 본문 앞에서 변경 범위 검증을 선택한다.

for verification_argument in "$@"; do
  case "$verification_argument" in
    --full) export HARNESS_VERIFY_LEVEL=full ;;
    --fast) export HARNESS_VERIFY_LEVEL=fast ;;
  esac
done

if [ "${HARNESS_VERIFY_LEVEL:-changed}" = changed ]; then
  verification_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ ! -f "$verification_script_directory/verify-changed.py" ]; then
    echo "변경 검증 실행기가 없습니다. 공통 하네스를 배포하거나 --full을 명시하십시오." >&2
    exit 2
  fi
  exec python3 "$verification_script_directory/verify-changed.py" "$@"
fi
