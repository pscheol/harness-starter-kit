#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
#
# 검증 레벨 (HARNESS_VERIFY_LEVEL, 기본 full):
#   fast — 구조 점검 + 포맷 검사(단계 1~2)까지. 보통 1초 미만.
#          Stop hook(에이전트가 턴을 마칠 때마다 실행)이 쓰는 레벨.
#          컴파일이 필요한 단계(build·vet·lint·test)는 캐시가 비면 수 분이 걸려 제외한다.
#   full — 전체 단계. pre-commit(pre-push)·CI 가 쓰는 레벨.
#
# 단일 Go 프로젝트 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)             — fast
#   2) gofumpt -l            (포맷 드리프트 — 출력이 있으면 실패) — fast
#   3) go build ./...        (컴파일)                          — full
#   4) go vet ./...          (표준 정적 분석)                   — full
#   5) golangci-lint run     (린트 + depguard 레이어 강제)       — full
#   6) 플랫폼 가드           (scripts/run-guards.sh 가 있을 때만) — full
#   7) go test -race -cover  (테스트 + 경합 검출 + 커버리지 임계) — full
#   8) govulncheck ./...     (선택 — 설치돼 있으면 실행)          — full
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
set -uo pipefail

LEVEL="${HARNESS_VERIFY_LEVEL:-full}"
fail=0

# 커버리지 임계(%). 프로젝트 정책에 맞게 조정한다(quality-score.md 기준: 전체 80).
COVERAGE_MIN="${COVERAGE_MIN:-80}"

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 규칙 문서를 기계적으로 보조. ────
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

# ── 2) 포맷 (gofumpt — 없으면 gofmt 로 폴백) ─────────────────────────────────
echo "▶ 포맷 검사"
if command -v gofumpt >/dev/null 2>&1; then
  FMT_OUT="$(gofumpt -l . 2>/dev/null)"
else
  echo "  (gofumpt 미설치 — gofmt 로 폴백)"
  FMT_OUT="$(gofmt -l . 2>/dev/null)"
fi
if [ -n "$FMT_OUT" ]; then
  echo "✖ 포맷 드리프트:"; echo "$FMT_OUT"
  echo "  → 'gofumpt -w .' (또는 'gofmt -w .') 로 정리"
  fail=1
fi

# ── fast 종료 지점 ───────────────────────────────────────────────────────────
# 이후 단계는 모두 컴파일을 동반한다(build·vet·lint·test). 빌드 캐시가 비었거나
# 의존성을 새로 받아야 하면 수 분이 걸린다. Stop hook 은 턴마다 실행되므로 여기서 끊고,
# 전체 게이트는 pre-push 와 CI 가 책임진다.
if [ "$LEVEL" = "fast" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — 빌드·테스트는 pre-push·CI 에서 실행)"
  exit 0
fi

# ── 3) 컴파일 ────────────────────────────────────────────────────────────────
echo "▶ go build"
go build ./... || { echo "✖ 빌드 실패"; fail=1; }

# ── 4) go vet ────────────────────────────────────────────────────────────────
echo "▶ go vet"
go vet ./... || { echo "✖ go vet 실패"; fail=1; }

# ── 5) 린트 (golangci-lint — depguard 로 레이어 의존을 강제한다) ─────────────
# 설정 원본은 .golangci.yml (레이어 규칙은 ARCHITECTURE.md §4.2).
if command -v golangci-lint >/dev/null 2>&1; then
  echo "▶ golangci-lint"
  golangci-lint run || { echo "✖ 린트 실패"; fail=1; }
else
  echo "▶ golangci-lint (미설치 — 건너뜀). 레이어 강제가 꺼진 상태이므로 설치를 권장한다."
fi

# ── 6) 플랫폼 가드 (선택 모듈 platform-guards 를 깔면 생긴다) ────────────────
# 배선 작업 없이 파일 존재만으로 잡힌다. 없으면 조용히 건너뛴다.
if [ -f scripts/run-guards.sh ]; then
  echo "▶ 플랫폼 가드"
  bash scripts/run-guards.sh || { echo "✖ 플랫폼 가드 실패"; fail=1; }
fi

# ── 7) 테스트 + 경합 검출 + 커버리지 ─────────────────────────────────────────
echo "▶ go test -race"
if go test -race -covermode=atomic -coverprofile=coverage.out ./...; then
  TOTAL="$(go tool cover -func=coverage.out | awk '/^total:/ {gsub(/%/,"",$3); print $3}')"
  if [ -n "${TOTAL:-}" ]; then
    echo "  커버리지: ${TOTAL}% (임계 ${COVERAGE_MIN}%)"
    # awk 로 실수 비교(bash 산술은 정수만 다룬다).
    if awk -v t="$TOTAL" -v m="$COVERAGE_MIN" 'BEGIN { exit (t+0 < m+0) ? 0 : 1 }'; then
      echo "✖ 커버리지 임계 미달"; fail=1
    fi
  fi
else
  echo "✖ 테스트 실패"; fail=1
fi

# ── 8) (선택) 취약점 스캔 ────────────────────────────────────────────────────
if command -v govulncheck >/dev/null 2>&1; then
  echo "▶ govulncheck"
  govulncheck ./... || { echo "✖ 알려진 취약점 발견"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
