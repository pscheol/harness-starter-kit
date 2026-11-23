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

verification_recorder="$verification_script_directory/harness/verify_record.py"
verification_root="$(cd "$verification_script_directory/.." && pwd)"

# 에이전트 세션의 full 은 CI 몫이다(설계 01 R2.6). 사람 터미널 · CI · 상위 게이트가 부른 하위 단위는 그대로 돈다.
if [ "$HARNESS_VERIFY_LEVEL" = full ]; then
  verification_hook="$verification_script_directory/hooks/block_full_verify.py"
  if [ -f "$verification_hook" ]; then
    verification_status=0
    python3 "$verification_hook" --entry-check || verification_status=$?
    if [ "$verification_status" -ne 0 ]; then
      if [ -f "$verification_recorder" ]; then
        python3 "$verification_recorder" --status blocked --level full --exit "$verification_status" --root "$verification_root" || true
      fi
      exit "$verification_status"
    fi
  fi
fi

# 본문이 부르는 하위 게이트(도메인 · 단위)는 이 실행이 허락된 뒤에 돈다. 하위의 HK-2 보조 점검이
# 그 full 을 막지 않도록 상위 표지를 넘긴다(설계 01 R4.5). 이미 상위가 준 값은 그대로 둔다.
export HARNESS_VERIFY_PARENT="${HARNESS_VERIFY_PARENT:-$HARNESS_VERIFY_LEVEL}"

# fast · full 본문의 stdout 을 기록기로 흘린다(설계 01 §3.5). 본문은 고치지 않는다.
# 바깥 호출은 같은 스크립트를 다시 띄워 기록기 파이프에 물리고, 다시 뜬 본문은 끝날 때 exit code 한 줄을 낸다.
# 표지를 부모 PID 로 두므로 본문이 부르는 하위 게이트는 각자 자기 기록을 쓴다.
if [ "${HARNESS_VERIFY_RECORDING:-}" = "$PPID" ]; then
  trap 'printf "::harness-exit %s\n" "$?"' EXIT
elif [ -f "$verification_recorder" ] && [ -n "${BASH_SOURCE[1]:-}" ]; then
  export HARNESS_VERIFY_RECORDING="$$"
  bash "${BASH_SOURCE[1]}" ${verification_arguments[@]+"${verification_arguments[@]}"} \
    | python3 "$verification_recorder" --tee --level "$HARNESS_VERIFY_LEVEL" --root "$verification_root"
  exit "${PIPESTATUS[0]}"
fi
