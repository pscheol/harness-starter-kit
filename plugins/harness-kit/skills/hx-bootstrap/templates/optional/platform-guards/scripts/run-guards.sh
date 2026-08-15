#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — 선택 모듈: platform-guards
#
# 플랫폼 불변식 가드 실행기.
#
# scripts/guards/ 의 가드 스크립트를 전부 찾아 실행한다. 가드를 추가하는 데 필요한
# 배선은 **파일을 두는 것뿐**이다 — 이 스크립트도, verify.sh 도 고치지 않는다.
# (verify.sh 는 이 파일이 존재하면 자동으로 호출한다.)
#
# 가드 하나 = 파일 하나:
#   · 종료 코드 0  = 통과
#   · 종료 코드 !0 = 위반. 표준출력/표준에러에 위반 위치를 찍는다
#   · 밑줄로 시작하는 파일(_template.sh 등)은 건너뛴다
#
# 강제 수준(3단 승격 — 원본은 .agents/rules/platform-invariants.md):
#   1) 문서만        — 규칙 파일에 적는다
#   2) 경고 가드     — 헤더에 `# harness-guard-enforce: 0`. 위반을 보고하되 게이트를 막지 않는다
#   3) 강제 가드     — 헤더에 `# harness-guard-enforce: 1`. 위반이 있으면 게이트가 실패한다
#   선언이 없으면 0(경고)으로 본다. 새 가드가 실수로 파이프라인을 막지 않게 하려는 기본값이다.
#
# 전역 오버라이드:
#   GUARD_ENFORCE=1  모든 가드를 강제로 (릴리스 전 점검용)
#   GUARD_ENFORCE=0  모든 가드를 경고로 (대규모 리팩터링 중 임시)
#   GUARD_DIR=<경로> 가드 디렉터리 변경 (기본 scripts/guards)
set -uo pipefail

GUARD_DIR="${GUARD_DIR:-scripts/guards}"
fail=0
ran=0
warned=0
failed=0

if [ ! -d "$GUARD_DIR" ]; then
  echo "  (가드 디렉터리가 없다: $GUARD_DIR — 건너뜀)"
  exit 0
fi

# 가드 파일 헤더에서 강제 수준을 읽는다. 없거나 0/1 이 아니면 0(경고).
enforce_level() {
  local lvl
  lvl="$(grep -m1 -E '^#[[:space:]]*harness-guard-enforce:' "$1" 2>/dev/null \
        | sed -E 's/.*:[[:space:]]*//' | tr -d '[:space:]')"
  case "$lvl" in
    0|1) echo "$lvl" ;;
    *)   echo 0 ;;
  esac
}

for guard in "$GUARD_DIR"/*.sh; do
  # glob 이 하나도 안 맞으면 패턴 문자열 그대로 들어온다. 존재 확인으로 막는다.
  [ -e "$guard" ] || break
  name="$(basename "$guard")"
  case "$name" in
    _*) continue ;;   # 템플릿·비활성 가드
  esac

  ran=$((ran + 1))
  level="$(enforce_level "$guard")"
  # 전역 오버라이드가 있으면 파일 선언보다 우선한다.
  if [ -n "${GUARD_ENFORCE:-}" ]; then
    case "$GUARD_ENFORCE" in
      0|1) level="$GUARD_ENFORCE" ;;
    esac
  fi

  if out="$(bash "$guard" 2>&1)"; then
    continue
  fi

  if [ "$level" = 1 ]; then
    echo "✖ [강제] ${name%.sh}"
    failed=$((failed + 1))
    fail=1
  else
    echo "▲ [경고] ${name%.sh}  (위반 0건이 되면 harness-guard-enforce: 1 로 올린다)"
    warned=$((warned + 1))
  fi
  [ -n "$out" ] && echo "$out" | sed 's/^/    /'
done

if [ "$ran" -eq 0 ]; then
  echo "  (실행할 가드가 없다. scripts/guards/_template.sh 를 복제해 첫 가드를 만든다)"
  exit 0
fi

# ${ran} 중괄호는 생략하면 안 된다 — bash 가 뒤따르는 한글까지 변수명으로 읽어 unbound 로 죽는다.
echo "  가드 ${ran}개 실행 — 강제 실패 ${failed} · 경고 ${warned}"
if [ "$fail" -ne 0 ]; then
  echo "  → 강제 가드 위반은 게이트를 막는다. 고치거나, 근거를 남기고 규칙을 바꾼다."
  exit 1
fi
exit 0
