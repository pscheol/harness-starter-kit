#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
#
# 검증 레벨 (HARNESS_VERIFY_LEVEL, 기본 full):
#   fast — 구조 점검 + 포맷 + **프로세스 경계 가드**(단계 1~3)까지. 보통 수 초.
#          Stop hook(에이전트가 턴을 마칠 때마다 실행)이 쓰는 레벨.
#          경계 가드를 fast 에 넣은 것은 의도적이다 — grep 이라 빠르고, 이 스택에서
#          가장 비싼 실수(프로세스 경계 해제)를 턴마다 잡아야 하기 때문이다.
#   full — 전체 단계. pre-commit(pre-push)·CI 가 쓰는 레벨.
#
# Electron 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)          — fast
#   2) 포맷 검사 (format:check → 없으면 prettier --check)     — fast
#   3) 프로세스 경계 가드 (Electron 고유·grep)                — fast
#   4) lint      (eslint — import 경계 규칙이 여기서 강제된다) — full
#   5) typecheck (tsc --noEmit)                              — full
#   6) 플랫폼 가드 (scripts/run-guards.sh 가 있을 때만)        — full
#   7) test                                                  — full
#   8) build     (main·preload·renderer 번들이 깨지지 않는지)  — full
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
#
# 패키징(설치 파일 생성·코드 서명)은 이 게이트가 하지 않는다. 서명 비밀과 OS 별 러너가
# 필요하므로 릴리스 절차로 분리한다.
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

has_script() {
  [ -f package.json ] || return 1
  node -e "const s=require('./package.json').scripts||{};process.exit(s['$1']?0:1)" 2>/dev/null
}

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

# ── 3) 프로세스 경계 가드 (Electron 고유) ────────────────────────────────────
# 문서로만 적어 둔 규칙은 언젠가 깨진다. 가장 비싼 세 가지 실수를 게이트에서 막는다.
#   contextIsolation: false · nodeIntegration: true · sandbox: false
# 이 셋 중 하나라도 풀리면 렌더러의 XSS 한 건이 곧바로 로컬 코드 실행이 된다.
# grep 기반이라 의존성이 없고 1초 미만이다. 정교한 검사가 필요하면 ESLint 규칙으로 승격한다.
echo "▶ 프로세스 경계 가드"
GUARD_DIRS=""
for d in src app apps packages electron; do
  [ -d "$d" ] && GUARD_DIRS="$GUARD_DIRS $d"
done

guard() { # guard <확장정규식> <설명>
  local hits
  # shellcheck disable=SC2086  # GUARD_DIRS 는 공백 구분 경로 목록이라 분리돼야 한다
  hits="$(grep -RIn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
    --exclude='*.test.*' --exclude='*.spec.*' -E "$1" $GUARD_DIRS 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    echo "✖ $2"
    echo "$hits" | sed 's/^/    /'
    fail=1
  fi
}

if [ -z "$GUARD_DIRS" ]; then
  echo "  (검사할 소스 디렉터리가 없음 — 건너뜀)"
else
  guard 'contextIsolation[[:space:]]*:[[:space:]]*false' \
    '컨텍스트 격리 해제 금지 — 렌더러가 preload 스코프에 직접 닿는다'
  guard 'nodeIntegration[[:space:]]*:[[:space:]]*true' \
    '렌더러에 Node 권한 부여 금지 — XSS 가 곧 로컬 코드 실행이 된다'
  guard 'sandbox[[:space:]]*:[[:space:]]*false' \
    '샌드박스 해제 금지 — 렌더러 프로세스 격리가 사라진다'
  guard 'webSecurity[[:space:]]*:[[:space:]]*false' \
    '웹 보안 해제 금지 — 동일 출처 정책이 꺼진다'
  guard 'allowRunningInsecureContent[[:space:]]*:[[:space:]]*true' \
    '혼합 콘텐츠 허용 금지'
  guard 'webviewTag[[:space:]]*:[[:space:]]*true' \
    '<webview> 활성화 금지 — 꼭 필요하면 이 가드를 지우기 전에 설계 문서에 근거를 남긴다'
  guard 'exposeInMainWorld\([^,]+,[[:space:]]*ipcRenderer[[:space:]]*\)' \
    'ipcRenderer 통째 노출 금지 — 임의 채널 호출을 허용하게 된다. 화이트리스트 API 만 노출한다'
fi

# ── fast 종료 지점 ───────────────────────────────────────────────────────────
# 이후 단계는 타입 검사·번들링을 동반한다. 캐시가 비면 수 분이 걸린다.
if [ "$LEVEL" = "fast" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — lint·타입·테스트·빌드는 pre-push·CI 에서 실행)"
  exit 0
fi

# ── 4) 린트 (ESLint — import 경계 규칙이 프로세스 경계를 강제한다) ───────────
echo "▶ lint"
if has_script lint; then
  run_script lint || { echo "✖ 린트 실패"; fail=1; }
elif [ -x node_modules/.bin/eslint ]; then
  node_modules/.bin/eslint . || { echo "✖ 린트 실패"; fail=1; }
else
  echo "  (lint 스크립트도 eslint 도 없음 — 건너뜀). 프로세스 경계 강제가 꺼진 상태이므로 설정을 권장한다."
fi

# ── 5) 타입 검사 (strict) ────────────────────────────────────────────────────
echo "▶ typecheck"
if has_script typecheck; then
  run_script typecheck || { echo "✖ 타입 검사 실패"; fail=1; }
elif [ -x node_modules/.bin/tsc ]; then
  node_modules/.bin/tsc --noEmit || { echo "✖ 타입 검사 실패"; fail=1; }
else
  echo "  (typecheck 스크립트도 tsc 도 없음 — 건너뜀)"
fi

# ── 6) 플랫폼 가드 (선택 모듈 platform-guards 를 깔면 생긴다) ────────────────
# 배선 작업 없이 파일 존재만으로 잡힌다. 없으면 조용히 건너뛴다.
if [ -f scripts/run-guards.sh ]; then
  echo "▶ 플랫폼 가드"
  bash scripts/run-guards.sh || { echo "✖ 플랫폼 가드 실패"; fail=1; }
fi

# ── 7) 테스트 ────────────────────────────────────────────────────────────────
# 커버리지 임계는 테스트 러너 설정에서 강제한다(quality-score.md 기준: 전체 80).
echo "▶ test"
if has_script test; then
  run_script test || { echo "✖ 테스트 실패"; fail=1; }
else
  echo "  (test 스크립트 없음 — 건너뜀). 테스트 없는 게이트는 회귀를 못 잡는다."
fi

# ── 8) 빌드 ──────────────────────────────────────────────────────────────────
# main·preload·renderer 는 타깃이 달라 각각 번들된다. 타입 검사를 통과해도
# 여기서만 드러나는 실패가 있다(Node API 를 렌더러 번들에 끌어들이는 import 등).
echo "▶ build"
if has_script build; then
  run_script build || { echo "✖ 빌드 실패"; fail=1; }
else
  echo "  (build 스크립트 없음 — 건너뜀)"
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
