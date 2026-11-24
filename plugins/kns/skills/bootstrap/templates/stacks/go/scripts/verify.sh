#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
#
# 검증 레벨 (인자 > HARNESS_VERIFY_LEVEL > 기본 changed — 아래 진입 블록 scripts/verify-entry.sh 가 가른다):
#   changed  — 기본. 바뀐 파일과 연결된 테스트만(scripts/verify-changed.py). Stop hook·git hook 이 쓴다.
#   affected — 바뀐 파일이 속한 모듈과 그 모듈을 쓰는 모듈의 검사. `--affected`. MR 전에 쓴다.
#   fast — 구조 점검 + 포맷 검사(단계 1~2)까지. 보통 1초 미만.
#          `--fast` 로 명시할 때 돈다.
#          컴파일이 필요한 단계(build·vet·lint·test)는 캐시가 비면 수 분이 걸려 제외한다.
#   full — 전체 단계. CI(HARNESS_VERIFY_LEVEL=full)가 돈다. 사람은 터미널에서 직접 돌릴 수 있다.
#          에이전트 세션의 full 은 훅이 막는다 — 에이전트는 MR 전에 --affected 를 쓴다.
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

# BEGIN HARNESS VERIFICATION ENTRY
# 레벨을 지정하지 않으면(기본 changed) 바뀐 파일에 필요한 검증만 고른다 — scripts/verify-changed.py.
# --affected 는 바뀐 모듈의 검사를 고른다. --fast · --full · HARNESS_VERIFY_LEVEL=fast|full 이면 아래 본문이 돈다.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/verify-entry.sh"
# END HARNESS VERIFICATION ENTRY
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 2

LEVEL="${HARNESS_VERIFY_LEVEL:-full}"
fail=0

# 커버리지 임계(%). 프로젝트 정책에 맞게 조정한다(quality-score.md 기준: 전체 80).
COVERAGE_MIN="${COVERAGE_MIN:-80}"

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 규칙 문서를 기계적으로 보조. ────
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

echo "▶ 하네스 구조(문서 기준·SDD 상태·에이전트 배선)"
python3 scripts/check_harness.py || { echo "✖ 하네스 구조 검사 실패"; fail=1; }
python3 scripts/harness/check_layout.py || { echo "✖ 배치 검사 실패(복사본 · 생성물이 원본과 다르다 → npx knots-sync repair)"; fail=1; }

# 기능 문서(SDLC S7). 생성기가 있으면 배정·원고·스냅숏 지문·생성 결과를 검사한다(파일을 쓰지 않는다).
if [ -f tools/docs/feature_docs.py ]; then
  echo "▶ 기능 문서"
  python3 tools/docs/feature_docs.py check || { echo "✖ 기능 문서 검사 실패 — /kns-docs 로 원고·배정을 고치고 build"; fail=1; }
fi

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
# 전체 게이트는 CI 가 돈다(바뀐 모듈의 검사는 MR 전 --affected).
if [ "$LEVEL" = "fast" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — 빌드·테스트는 MR 전 --affected, 전체는 CI 에서 돈다)"
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

# ── 6) 플랫폼 가드 (공통 층 scripts/run-guards.sh) ────────────────
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
