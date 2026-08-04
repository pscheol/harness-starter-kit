#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 정본 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
# 단일 Kotlin/Spring(Gradle) 프로젝트 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)
#   2) ./gradlew check (ktlint + test 등 포함)
#   3) (선택) DB 통합/격리 테스트가 있으면 실행
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
set -uo pipefail

fail=0

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 정본 규칙의 기계적 보조. ────
# exec-plan 위치↔상태 일관성을 강제한다(스택과 무관하므로 무조건 호출).
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

# ── 2) 빌드/린트/테스트 게이트 (Gradle check = ktlint + detekt + test) ────────
# 단일 Gradle 프로젝트. 기본은 프로젝트 루트의 gradlew 를 쓴다.
# 코드가 하위 디렉터리(예: services/{{PROJECT_SLUG}}-api)에 있으면 GRADLE_DIR 를 그 경로로 바꾼다.
GRADLE_DIR="."
echo "▶ gradle check ($GRADLE_DIR)"
( cd "$GRADLE_DIR" && ./gradlew check --no-daemon -q ) || { echo "✖ gradle check 실패"; fail=1; }

# ── 3) (선택) DB 통합/격리 테스트 ────────────────────────────────────────────
# 프로젝트에 DB 통합/격리 테스트가 있을 때만 실행한다(없으면 자동 skip).
# 컨테이너 기반 통합 테스트는 대부분 ./gradlew check 의 Testcontainers 로 충분하다.
# 아래는 별도 DB 게이트가 필요할 때의 예시다(파일명·DB 종류는 프로젝트에 맞게 조정):
#   - scripts/db-migrate.sh : 스키마 마이그레이션 적용(관계형 DB — PostgreSQL/MySQL 등)
#   - scripts/db-test.sh    : DB 통합·아키텍처 구조 테스트
if [ -f scripts/db-migrate.sh ] && [ -f scripts/db-test.sh ] && [ -n "$(ls -A db/migrations 2>/dev/null)" ]; then
  echo "▶ db (migrate + integration/structure test)"
  { bash scripts/db-migrate.sh && bash scripts/db-test.sh; } || { echo "✖ db 게이트 실패"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then echo "검증 실패"; exit 1; fi
echo "검증 통과"
exit 0
