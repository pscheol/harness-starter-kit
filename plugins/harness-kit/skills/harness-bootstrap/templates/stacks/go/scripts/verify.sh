#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 정본 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
# 단일 Go 프로젝트 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)
#   2) gofumpt -l            (포맷 드리프트 — 출력이 있으면 실패)
#   3) go build ./...        (컴파일)
#   4) go vet ./...          (표준 정적 분석)
#   5) golangci-lint run     (린트 + depguard 레이어 강제)
#   6) go test -race -cover  (테스트 + 경합 검출 + 커버리지 임계)
#   7) govulncheck ./...     (선택 — 설치돼 있으면 실행)
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
set -uo pipefail

fail=0

# 커버리지 임계(%). 프로젝트 정책에 맞게 조정한다(quality-score.md 기준: 전체 80).
COVERAGE_MIN="${COVERAGE_MIN:-80}"

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 정본 규칙의 기계적 보조. ────
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

# ── 3) 컴파일 ────────────────────────────────────────────────────────────────
echo "▶ go build"
go build ./... || { echo "✖ 빌드 실패"; fail=1; }

# ── 4) go vet ────────────────────────────────────────────────────────────────
echo "▶ go vet"
go vet ./... || { echo "✖ go vet 실패"; fail=1; }

# ── 5) 린트 (golangci-lint — depguard 로 레이어 의존을 강제한다) ─────────────
# 설정 정본은 .golangci.yml (레이어 규칙은 ARCHITECTURE.md §4.2).
if command -v golangci-lint >/dev/null 2>&1; then
  echo "▶ golangci-lint"
  golangci-lint run || { echo "✖ 린트 실패"; fail=1; }
else
  echo "▶ golangci-lint (미설치 — 건너뜀). 레이어 강제가 꺼진 상태이므로 설치를 권장한다."
fi

# ── 6) 테스트 + 경합 검출 + 커버리지 ─────────────────────────────────────────
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

# ── 7) (선택) 취약점 스캔 ────────────────────────────────────────────────────
if command -v govulncheck >/dev/null 2>&1; then
  echo "▶ govulncheck"
  govulncheck ./... || { echo "✖ 알려진 취약점 발견"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
