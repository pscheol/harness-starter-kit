#!/usr/bin/env bash
# 스택 scripts/verify.sh 가 맨 앞에서 source 한다. 검증 레벨을 정한다(설계 01 §3.0).
#   우선순위: 명령 인자(--changed · --affected · --fast · --full) > HARNESS_VERIFY_LEVEL > 기본 changed
#   changed · affected → scripts/verify-changed.py (바뀐 파일 · 바뀐 모듈에 필요한 검사만)
#   fast · full        → 아래 스택 본문(지금 그대로)
# bash 3.2(macOS 기본)와 set -u 에서 돈다 — 빈 배열은 ${a[@]+"${a[@]}"} 로만 펼친다.

verification_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verification_level_argument=""
verification_arguments=()
for verification_argument in "$@"; do
  case "$verification_argument" in
    --full|--fast|--affected|--changed) verification_level_argument="${verification_argument#--}" ;;
    *) verification_arguments+=("$verification_argument") ;;
  esac
done
if [ -n "$verification_level_argument" ]; then
  export HARNESS_VERIFY_LEVEL="$verification_level_argument"
fi

case "${HARNESS_VERIFY_LEVEL:-changed}" in
  changed|affected)
    if [ ! -f "$verification_script_directory/verify-changed.py" ]; then
      echo "✖ 변경 검증 실행기(scripts/verify-changed.py)가 없다. 공통 하네스를 다시 배포한다(hx-update). MR 전 범위는 bash scripts/verify.sh --affected, 전체 검증(full)은 CI가 돈다." >&2
      exit 2
    fi
    exec python3 "$verification_script_directory/verify-changed.py" \
      ${verification_arguments[@]+"${verification_arguments[@]}"} --level "${HARNESS_VERIFY_LEVEL:-changed}"
    ;;
  fast|full) ;;
  *)
    echo "✖ 알 수 없는 검증 레벨: ${HARNESS_VERIFY_LEVEL} (changed · affected · fast · full)" >&2
    exit 2
    ;;
esac

# 에이전트 세션의 full 은 CI 몫이다(설계 01 R2.6). 사람 터미널 · CI · 상위 게이트가 부른 하위 단위는 그대로 돈다.
if [ "$HARNESS_VERIFY_LEVEL" = full ]; then
  verification_hook="$verification_script_directory/hooks/block_full_verify.py"
  if [ -f "$verification_hook" ]; then
    python3 "$verification_hook" --entry-check || exit $?
  fi
fi
