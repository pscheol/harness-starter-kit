#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
#
# 검증 레벨 (HARNESS_VERIFY_LEVEL, 기본 full):
#   fast — 구조 점검 + 포맷 검사(단계 1~2)까지. 보통 수 초.
#          Stop hook(에이전트가 턴을 마칠 때마다 실행)이 쓰는 레벨.
#          타입 검사·테스트·번들 빌드는 캐시가 비면 수십 초~수 분이 걸려 제외한다.
#   full — 전체 단계. pre-commit(pre-push)·CI 가 쓰는 레벨.
#
# 웹 프론트엔드 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)          — fast
#   2) 포맷 검사 (format:check → 없으면 prettier --check)     — fast
#   3) lint      (eslint — import 경계 규칙이 여기서 강제된다) — full
#   4) typecheck (tsc --noEmit — strict 가 두 번째 강제 수단)  — full
#   5) 플랫폼 가드 (scripts/run-guards.sh 가 있을 때만)        — full
#   6) test      (단위·컴포넌트)                              — full
#   7) build     (프로덕션 빌드가 깨지지 않는지)               — full
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
#
# 프론트엔드에는 컴파일 레벨의 레이어 강제가 없다. 경계를 지키는 것은 3)의 ESLint
# 규칙과 4)의 strict 타입뿐이므로, 이 둘을 끄면 ARCHITECTURE.md 는 문서로만 남는다.
set -uo pipefail

LEVEL="${HARNESS_VERIFY_LEVEL:-full}"
fail=0

# 패키지 매니저 — 락파일로 판별한다(프로젝트가 실제로 쓰는 것과 어긋나면 설치가 갈린다).
if [ -f pnpm-lock.yaml ]; then
  PM="pnpm"
elif [ -f yarn.lock ]; then
  PM="yarn"
else
  PM="npm"
fi

# package.json 에 스크립트가 정의돼 있는지 본다. 없는 스크립트를 부르면
# 패키지 매니저가 에러로 죽어 "실패"와 "미설정"을 구분할 수 없다.
has_script() {
  [ -f package.json ] || return 1
  node -e "const s=require('./package.json').scripts||{};process.exit(s['$1']?0:1)" 2>/dev/null
}

# 프로젝트 스크립트를 실행한다. npm 만 인자 전달에 -- 가 필요하다.
run_script() {
  case "$PM" in
    npm) npm run "$1" --silent ;;
    *)   "$PM" run "$1" ;;
  esac
}

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 규칙 문서를 기계적으로 보조. ────
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

# ── 2) 포맷 ──────────────────────────────────────────────────────────────────
echo "▶ 포맷 검사"
if has_script format:check; then
  run_script format:check || { echo "✖ 포맷 드리프트 → '$PM run format' 으로 정리"; fail=1; }
elif [ -x node_modules/.bin/prettier ]; then
  node_modules/.bin/prettier --check . || { echo "✖ 포맷 드리프트 → prettier --write . 로 정리"; fail=1; }
else
  echo "  (format:check 스크립트도 prettier 도 없음 — 건너뜀)"
fi

# ── fast 종료 지점 ───────────────────────────────────────────────────────────
# 이후 단계는 타입 검사·번들링을 동반한다. 캐시가 비면 수 분이 걸린다.
# Stop hook 은 턴마다 실행되므로 여기서 끊고, 전체 게이트는 pre-push 와 CI 가 책임진다.
if [ "$LEVEL" = "fast" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — lint·타입·테스트·빌드는 pre-push·CI 에서 실행)"
  exit 0
fi

# ── 3) 린트 (ESLint — import 경계 규칙이 레이어를 강제한다) ──────────────────
# 규칙 원본은 eslint 설정 파일(경계 규칙 골격은 ARCHITECTURE.md §4).
echo "▶ lint"
if has_script lint; then
  run_script lint || { echo "✖ 린트 실패"; fail=1; }
elif [ -x node_modules/.bin/eslint ]; then
  node_modules/.bin/eslint . || { echo "✖ 린트 실패"; fail=1; }
else
  echo "  (lint 스크립트도 eslint 도 없음 — 건너뜀). 레이어 강제가 꺼진 상태이므로 설정을 권장한다."
fi

# ── 4) 타입 검사 (strict) ────────────────────────────────────────────────────
echo "▶ typecheck"
if has_script typecheck; then
  run_script typecheck || { echo "✖ 타입 검사 실패"; fail=1; }
elif [ -x node_modules/.bin/tsc ]; then
  node_modules/.bin/tsc --noEmit || { echo "✖ 타입 검사 실패"; fail=1; }
else
  echo "  (typecheck 스크립트도 tsc 도 없음 — 건너뜀)"
fi

# ── 5) 플랫폼 가드 (선택 모듈 platform-guards 를 깔면 생긴다) ────────────────
# 배선 작업 없이 파일 존재만으로 잡힌다. 없으면 조용히 건너뛴다.
if [ -f scripts/run-guards.sh ]; then
  echo "▶ 플랫폼 가드"
  bash scripts/run-guards.sh || { echo "✖ 플랫폼 가드 실패"; fail=1; }
fi

# ── 6) 테스트 ────────────────────────────────────────────────────────────────
# 커버리지 임계는 테스트 러너 설정에서 강제한다(quality-score.md 기준: 전체 80).
# 러너가 임계를 알아야 실패를 정확한 파일 단위로 보고할 수 있다.
echo "▶ test"
if has_script test; then
  run_script test || { echo "✖ 테스트 실패"; fail=1; }
else
  echo "  (test 스크립트 없음 — 건너뜀). 테스트 없는 게이트는 회귀를 못 잡는다."
fi

# ── 7) 프로덕션 빌드 ─────────────────────────────────────────────────────────
# 타입 검사를 통과해도 번들 단계에서만 드러나는 실패가 있다(서버/클라이언트 경계,
# 동적 import 경로, 환경변수 누락). 그래서 빌드까지가 게이트다.
echo "▶ build"
if has_script build; then
  run_script build || { echo "✖ 빌드 실패"; fail=1; }
else
  echo "  (build 스크립트 없음 — 건너뜀)"
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
