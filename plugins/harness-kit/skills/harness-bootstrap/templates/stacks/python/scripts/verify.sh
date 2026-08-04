#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 정본 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
# 단일 Python 백엔드 프로젝트 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)
#   2) ruff format --check   (포맷 드리프트)
#   3) ruff check            (린트 — 보안(S)·async(ASYNC)·버그(B) 룰 포함)
#   4) mypy                  (타입 계약)
#   5) lint-imports          (아키텍처 레이어 계약 = 컴파일 강제 대체물)
#   6) pytest                (테스트 + 커버리지 임계)
#   7) (조건부) manage.py 가 있으면 Django 점검 + 마이그레이션 드리프트 차단
#   8) (조건부) evaluation|evals 가 있고 EVAL_ON_VERIFY=1 이면 eval 스모크
#   9) (선택) DB 마이그레이션/격리 테스트가 있으면 실행
#
# 7·8 은 아키텍처 변형(django · ai-service)을 위한 단계이지만 스크립트는 하나로 유지한다.
# 변형마다 파일을 나누지 않고 **존재 감지 기반 선택 실행**으로 흡수한다("1곳 + N트리거" 원칙).
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
set -uo pipefail

fail=0

# 실행 접두사: uv 프로젝트면 `uv run`, 아니면 활성 가상환경의 도구를 직접 호출한다.
# (Poetry 프로젝트면 RUN="poetry run" 으로 바꾼다)
if [ -f uv.lock ] && command -v uv >/dev/null 2>&1; then
  RUN="uv run"
else
  RUN=""
fi
run() { if [ -n "$RUN" ]; then $RUN "$@"; else "$@"; fi }

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 정본 규칙의 기계적 보조. ────
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

# ── 1.5) 도구 확인 ───────────────────────────────────────────────────────────
# uv/Poetry 러너 없이 도구를 직접 부르는 환경이면, 미설치를 먼저 잡아 알린다.
# (그렇지 않으면 'command not found' 가 "린트 실패"로 오인된다.)
if [ -z "$RUN" ]; then
  for tool in ruff mypy lint-imports pytest; do
    command -v "$tool" >/dev/null 2>&1 || { echo "✖ 도구 미설치: $tool"; fail=1; }
  done
  if [ "$fail" -ne 0 ]; then
    echo "  → 개발 의존성을 설치하라: 'uv sync' (또는 가상환경 활성화 후 설치)"
    echo "검증 실패(도구 미설치 — 게이트를 실행할 수 없다)"
    exit 1
  fi
fi

# ── 2) 포맷 (Ruff formatter) ─────────────────────────────────────────────────
echo "▶ ruff format --check"
run ruff format --check . || { echo "✖ 포맷 드리프트 — 'ruff format .' 로 정리"; fail=1; }

# ── 3) 린트 (Ruff) ───────────────────────────────────────────────────────────
echo "▶ ruff check"
run ruff check . || { echo "✖ 린트 실패"; fail=1; }

# ── 4) 타입 (mypy) ───────────────────────────────────────────────────────────
# 설정(strict 등)은 pyproject.toml 의 [tool.mypy] 정본을 따른다.
# 대상 경로는 레이아웃마다 다르다(src 레이아웃 vs Django 프로젝트 루트) — 존재하는 것만 넘긴다.
MYPY_TARGETS=""
[ -d src ]   && MYPY_TARGETS="$MYPY_TARGETS src"
[ -d tests ] && MYPY_TARGETS="$MYPY_TARGETS tests"
[ -z "$MYPY_TARGETS" ] && MYPY_TARGETS="."
echo "▶ mypy ($MYPY_TARGETS)"
run mypy $MYPY_TARGETS || { echo "✖ 타입 검사 실패"; fail=1; }

# ── 5) 아키텍처 레이어 계약 (import-linter) ──────────────────────────────────
# 계약 정의는 pyproject.toml 의 [tool.importlinter] (ARCHITECTURE.md §3.2).
# Python 은 컴파일러가 의존 방향을 막지 않으므로 이 단계가 컴파일 강제를 대신한다.
echo "▶ lint-imports (레이어 계약)"
run lint-imports || { echo "✖ 아키텍처 레이어 계약 위반"; fail=1; }

# ── 6) 테스트 + 커버리지 ─────────────────────────────────────────────────────
# addopts(커버리지·임계)는 pyproject.toml 의 [tool.pytest.ini_options] 정본을 따른다.
echo "▶ pytest"
run pytest || { echo "✖ 테스트 실패(또는 커버리지 임계 미달)"; fail=1; }

# ── 7) (조건부) Django 게이트 — manage.py 가 있을 때만 ───────────────────────
# django 변형 대응. 모델을 고치고 마이그레이션을 만들지 않은 '드리프트'가 가장 흔한 사고라
# 배포 전이 아니라 게이트에서 막는다.
if [ -f manage.py ]; then
  echo "▶ django check (시스템 점검)"
  run python manage.py check || { echo "✖ Django 시스템 점검 실패"; fail=1; }

  echo "▶ django makemigrations --check (마이그레이션 드리프트)"
  run python manage.py makemigrations --check --dry-run \
    || { echo "✖ 마이그레이션 드리프트 — 'python manage.py makemigrations' 로 생성 후 커밋"; fail=1; }
fi

# ── 8) (조건부) eval 회귀 스모크 — ai-service 변형 대응 ──────────────────────
# 기본은 비활성이다: 모델 호출은 비용이 들고 비결정적이므로 전체 eval 은 nightly 로 돌린다.
# EVAL_ON_VERIFY=1 일 때만 스모크를 실행한다(프롬프트·모델·검색 설정을 바꾼 PR 에서 켠다).
EVAL_DIR=""
[ -d evaluation ] && EVAL_DIR="evaluation"
[ -z "$EVAL_DIR" ] && [ -d evals ] && EVAL_DIR="evals"
if [ -n "$EVAL_DIR" ]; then
  if [ "${EVAL_ON_VERIFY:-0}" = "1" ]; then
    if [ -f "$EVAL_DIR/run_eval.py" ]; then
      echo "▶ eval 스모크 ($EVAL_DIR)"
      run python "$EVAL_DIR/run_eval.py" --smoke \
        || { echo "✖ eval 회귀 — 기준선 대비 점수 하락(baselines/ 확인)"; fail=1; }
    else
      echo "  ↷ eval 스모크 건너뜀 — $EVAL_DIR/run_eval.py 없음"
    fi
  else
    echo "  ↷ eval 스모크 건너뜀 — EVAL_ON_VERIFY=1 로 활성화(전체 eval 은 nightly)"
  fi
fi

# ── 9) (선택) DB 마이그레이션 / 격리 테스트 ──────────────────────────────────
# 프로젝트에 DB 게이트가 있을 때만 실행한다(없으면 자동 skip).
# 대부분은 pytest 통합 테스트로 충분하다. 별도 게이트가 필요할 때만 아래를 쓴다.
if [ -f scripts/db-migrate.sh ] && [ -f scripts/db-test.sh ]; then
  echo "▶ db (migrate + integration/structure test)"
  { bash scripts/db-migrate.sh && bash scripts/db-test.sh; } || { echo "✖ db 게이트 실패"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
