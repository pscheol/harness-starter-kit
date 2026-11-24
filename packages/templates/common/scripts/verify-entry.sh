#!/usr/bin/env bash
# 스택 scripts/verify.sh 가 맨 앞에서 source 한다. 검증 레벨을 정한다(설계 01 §3.0).
#   우선순위: 명령 인자(--changed · --affected · --fast · --full) > HARNESS_VERIFY_LEVEL > 기본 changed
#   changed · affected → scripts/verify-changed.py (바뀐 파일 · 바뀐 모듈에 필요한 검사만)
#   fast · full        → 아래 스택 본문(지금 그대로)
#   --from-base <ref> → MR 판정: base 판 검증 코드 · 설정을 .agents/state/ci-base/ 에 꺼내 그 판으로 돈다(설계 09 §3.7)
#   --bootstrap        → base 에 하네스가 없거나 base 판이 --from-base 를 몰라 head 판으로 돈다는 표지(판정 결과에 남는다)
# 정적 분석(설계 09 §3.4): changed · affected 는 verify-changed.py 안에서, fast(설정 검사) · full 은 본문 끝에서 돈다.
# bash 3.2(macOS 기본)와 set -u 에서 돈다 — 빈 배열은 ${a[@]+"${a[@]}"} 로만 펼친다.

verification_script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verification_level_argument=""
verification_from_base=""
verification_expect_base=""
verification_arguments=()
for verification_argument in "$@"; do
  if [ -n "$verification_expect_base" ]; then
    verification_from_base="$verification_argument"
    verification_expect_base=""
    continue
  fi
  case "$verification_argument" in
    --full|--fast|--affected|--changed) verification_level_argument="${verification_argument#--}" ;;
    --from-base) verification_expect_base=1 ;;
    --from-base=*) verification_from_base="${verification_argument#--from-base=}" ;;
    --bootstrap) export KNS_VERIFY_BOOTSTRAP=1 ;;
    *) verification_arguments+=("$verification_argument") ;;
  esac
done
if [ -n "$verification_level_argument" ]; then
  export HARNESS_VERIFY_LEVEL="$verification_level_argument"
fi

# MR 파이프라인(설계 09 §3.7 · VQ-R11): 이 파일이 base 판이다. 판정 대상(작업 트리)은 MR head 이고, 리포 루트는
# 현재 폴더에서 위로 찾는다(설계 README §10). base 에 있는 검증 코드 · 설정 · 기준선만 꺼낸다 — 없는 것은 head 판으로 채우지 않는다.
if [ -n "$verification_expect_base" ] || { [ -n "$verification_from_base" ] && case "$verification_from_base" in -*|*[!A-Za-z0-9_./@{}~^+-]*) true ;; *) false ;; esac; }; then
  echo "✖ --from-base 에 base ref 를 준다(예: --from-base origin/develop)" >&2
  exit 2
fi
# bootstrap 은 base 에 검증 코드가 없을 때만 head 판으로 판정한다. base ref 를 못 찾거나(fetch 실패) base 에 검증 코드가 있으면 거부한다.
if [ "${KNS_VERIFY_BOOTSTRAP:-}" = 1 ] && [ -n "${KNS_BASE_REF:-}" ]; then
  verification_bootstrap_root="$(cd "$verification_script_directory/.." && pwd)"
  verification_prefix="$(git -C "$verification_bootstrap_root" rev-parse --show-prefix 2>/dev/null)"
  if ! git -C "$verification_bootstrap_root" rev-parse --verify --quiet "$KNS_BASE_REF^{commit}" >/dev/null 2>&1; then
    echo "✖ bootstrap: base ref($KNS_BASE_REF)를 찾지 못했다 — head 판으로 판정하지 않는다. git fetch 뒤 다시 돈다" >&2
    exit 2
  fi
  # base 의 verify-entry.sh 가 --from-base 를 모르면(킷을 처음 올리는 MR) head 판으로 돈다. 알면 base 판이 판정한다.
  verification_base_entry="$(git -C "$verification_bootstrap_root" show "$KNS_BASE_REF:${verification_prefix}scripts/verify-entry.sh" 2>/dev/null)"
  if git -C "$verification_bootstrap_root" cat-file -e "$KNS_BASE_REF:${verification_prefix}scripts/verify.sh" 2>/dev/null; then
    case "$verification_base_entry" in
      *--from-base*)
        echo "✖ bootstrap: base($KNS_BASE_REF)에 검증 코드가 있다 — base 판으로 판정한다(--from-base)" >&2
        exit 2
        ;;
    esac
  fi
fi
if [ -n "$verification_from_base" ]; then
  case "${HARNESS_VERIFY_LEVEL:-changed}" in
    changed|affected) ;;
    *) echo "✖ --from-base 는 changed · affected 에서만 쓴다(full 은 base 브랜치에서 돈다)" >&2; exit 2 ;;
  esac
  verification_head_root="$(pwd -P)"
  while [ "$verification_head_root" != / ] && [ ! -f "$verification_head_root/.agents/knots-sync.json" ] && [ ! -f "$verification_head_root/.agents/harness.json" ]; do
    verification_head_root="$(dirname "$verification_head_root")"
  done
  if [ ! -f "$verification_head_root/.agents/knots-sync.json" ] && [ ! -f "$verification_head_root/.agents/harness.json" ]; then
    echo "✖ 하네스 루트(.agents/knots-sync.json)를 현재 폴더 위에서 찾지 못했다" >&2
    exit 2
  fi
  verification_prefix="$(git -C "$verification_head_root" rev-parse --show-prefix 2>/dev/null)"
  verification_base_paths=()
  for verification_path in scripts .agents/verify-checks.json .agents/quality-gate.json .agents/analyzers.json .agents/deploy.json .agents/quality-baseline.json; do
    if git -C "$verification_head_root" cat-file -e "$verification_from_base:$verification_prefix$verification_path" 2>/dev/null; then
      verification_base_paths+=("$verification_path")
    fi
  done
  if [ "${verification_base_paths[0]:-}" != scripts ]; then
    echo "✖ base($verification_from_base)에 scripts/ 가 없다 — bash scripts/verify.sh --affected --bootstrap 으로 head 판을 돈다" >&2
    exit 2
  fi
  verification_ci_base="$verification_head_root/.agents/state/ci-base"
  rm -rf "$verification_ci_base" && mkdir -p "$verification_ci_base" || exit 2
  if ! git -C "$verification_head_root" archive --format=tar "$verification_from_base:$verification_prefix" -- "${verification_base_paths[@]}" | tar -xf - -C "$verification_ci_base"; then
    echo "✖ base($verification_from_base) 검증 코드를 꺼내지 못했다" >&2
    exit 2
  fi
  echo "판정: base 판($verification_from_base) 검증 코드 · 설정 — .agents/state/ci-base/"
  export KNS_ROOT="$verification_head_root" KNS_TOOLS_DIR="$verification_ci_base/scripts" KNS_GATE_CONFIG_DIR="$verification_ci_base" KNS_FROM_BASE="$verification_from_base"
  exec bash "$verification_ci_base/scripts/verify.sh" "--${HARNESS_VERIFY_LEVEL:-changed}" ${verification_arguments[@]+"${verification_arguments[@]}"}
fi

case "${HARNESS_VERIFY_LEVEL:-changed}" in
  changed|affected)
    if [ ! -f "$verification_script_directory/verify-changed.py" ]; then
      echo "✖ 변경 검증 실행기(scripts/verify-changed.py)가 없다. 공통 하네스를 다시 배포한다(kns:update). MR 전 범위는 bash scripts/verify.sh --affected, 전체 검증(full)은 CI가 돈다." >&2
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
# 정적 분석 단계(설계 09 §3.4): 본문이 끝나면(EXIT) fast 는 설정 형식만 검사하고 full 은 등록한 분석기를 모두 돌린다.
# 등록 파일 · 게이트 설정이 둘 다 없으면 줄을 내지 않는다. 본문 결과보다 약하게 바꾸지 않는다(실패 1 > 미완료 2 > 통과 0).
verification_quality="$verification_script_directory/harness/quality.py"
verification_static_stage() {
  verification_status=$?
  trap - EXIT
  if [ -f "$verification_quality" ] && { [ -f "$verification_root/.agents/analyzers.json" ] || [ -f "$verification_root/.agents/quality-gate.json" ]; }; then
    if [ "$HARNESS_VERIFY_LEVEL" = fast ]; then
      echo "▶ 정적 분석 설정 검사"
      verification_stage=(check-config --root "$verification_root")
    else
      echo "▶ 정적 분석 · 품질 게이트(full)"
      verification_stage=(run --level full --summary --root "$verification_root")
    fi
    verification_stage_status=0
    python3 "$verification_quality" "${verification_stage[@]}" </dev/null || verification_stage_status=$?
    if [ "$verification_stage_status" -ne 0 ]; then
      echo "✖ 정적 분석 단계 실패(exit $verification_stage_status)"
      if [ "$verification_status" -eq 0 ] || { [ "$verification_status" -eq 2 ] && [ "$verification_stage_status" -eq 1 ]; }; then
        verification_status="$verification_stage_status"
      fi
    fi
  fi
  printf "::harness-exit %s\n" "$verification_status"
  exit "$verification_status"
}
if [ "${HARNESS_VERIFY_RECORDING:-}" = "$PPID" ]; then
  trap 'verification_static_stage' EXIT
elif [ -f "$verification_recorder" ] && [ -n "${BASH_SOURCE[1]:-}" ]; then
  export HARNESS_VERIFY_RECORDING="$$"
  bash "${BASH_SOURCE[1]}" ${verification_arguments[@]+"${verification_arguments[@]}"} \
    | python3 "$verification_recorder" --tee --level "$HARNESS_VERIFY_LEVEL" --root "$verification_root"
  exit "${PIPESTATUS[0]}"
fi
