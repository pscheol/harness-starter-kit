#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 치환 후 사용.
#
# 검증 스크립트 (단일 강제 지점).
# hook / CI / pre-commit 이 모두 이 스크립트 하나만 호출한다. 로직 복제 금지.
#
# 검증 레벨 (HARNESS_VERIFY_LEVEL, 기본 full):
#   fast — 구조 점검만. Gradle(JVM)을 기동하지 않는다. 수백 ms.
#          Stop hook(에이전트가 턴을 마칠 때마다 실행)이 쓰는 레벨.
#   full — fast + ./gradlew check + 선택 DB 게이트. pre-commit(pre-push)·CI 가 쓰는 레벨.
#
# ⚠ 왜 fast 에서 Gradle 을 부르지 않는가:
#   Gradle 은 어떤 태스크든 JVM·데몬 기동이 필요하고 ~/.gradle 에 파일 lock 을 잡는다.
#   Stop hook 은 턴마다 실행되므로, 앞 실행이 끝나기 전에 다음 실행이 겹치면
#   lock 경합으로 무한 대기에 빠진다. 빌드/테스트는 pre-push 와 CI 가 책임진다.
#   fast 에서도 린트를 돌리고 싶으면 HARNESS_VERIFY_FAST_GRADLE=1 로 켠다(느려진다).
#
# 단일 Kotlin/Spring(Gradle) 프로젝트 게이트:
#   1) exec-plan 위치↔상태 일관성 (스택 무관, 항상)
#   2) 플랫폼 가드 (scripts/run-guards.sh 가 있을 때만) — full
#   3) ./gradlew check (ktlint + test 등 포함)        — full
#   4) (선택) DB 통합/격리 테스트가 있으면 실행        — full
# 여러 단계 실패를 한 번에 보고하려고 fail 로 누적한다.
set -uo pipefail

LEVEL="${HARNESS_VERIFY_LEVEL:-full}"
fail=0

# ── 1) 구조 점검 (문서/하네스 일관성). 항상 실행 — 규칙 문서를 기계적으로 보조. ────
# exec-plan 위치↔상태 일관성을 강제한다(스택과 무관하므로 무조건 호출).
echo "▶ exec-plan 상태 일관성"
bash scripts/check-exec-plan-status.sh || { echo "✖ exec-plan 상태 일관성 실패"; fail=1; }

# ── fast 종료 지점 (Gradle 미기동) ───────────────────────────────────────────
if [ "$LEVEL" = "fast" ] && [ "${HARNESS_VERIFY_FAST_GRADLE:-0}" != "1" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — 빌드/테스트는 pre-push·CI 에서 실행)"
  exit 0
fi

# ── 2) 플랫폼 가드 (선택 모듈 platform-guards 를 깔면 생긴다) ────────────────
# 배선 작업 없이 파일 존재만으로 잡힌다. 없으면 조용히 건너뛴다.
# Gradle 보다 앞에 둔다 — 대부분 grep 수준이라 즉시 끝나고, 느린 빌드 전에 실패를 알린다.
if [ -f scripts/run-guards.sh ]; then
  echo "▶ 플랫폼 가드"
  bash scripts/run-guards.sh || { echo "✖ 플랫폼 가드 실패"; fail=1; }
fi

# ── 3) 빌드/린트/테스트 게이트 (Gradle check = ktlint + detekt + test) ────────
# 단일 Gradle 프로젝트. 기본은 프로젝트 루트의 gradlew 를 쓴다.
# 코드가 하위 디렉터리(예: services/{{PROJECT_SLUG}}-api)에 있으면 GRADLE_DIR 를 그 경로로 바꾼다.
GRADLE_DIR="."
# fast + FAST_GRADLE=1 이면 린트만, full 이면 check(테스트 포함).
if [ "$LEVEL" = "fast" ]; then GRADLE_TASK="ktlintCheck"; else GRADLE_TASK="check"; fi
# --console=plain : hook/CI 에는 TTY 가 없다. 진행 애니메이션을 끄고 로그를 그대로 남긴다.
# --no-daemon 은 기본값에서 뺐다 — 매 실행마다 JVM 콜드 스타트가 붙어 게이트가 수 분으로 늘어난다.
# 일회성 컨테이너(CI)에서 데몬을 끄고 싶으면 GRADLE_ARGS 로 넘긴다.
GRADLE_ARGS="${GRADLE_ARGS:---console=plain}"
echo "▶ gradle $GRADLE_TASK ($GRADLE_DIR)"
# shellcheck disable=SC2086  # GRADLE_ARGS 는 여러 인자를 담으므로 의도적으로 단어 분리한다.
( cd "$GRADLE_DIR" && ./gradlew "$GRADLE_TASK" $GRADLE_ARGS ) \
  || { echo "✖ gradle $GRADLE_TASK 실패"; fail=1; }

if [ "$LEVEL" = "fast" ]; then
  if [ "$fail" -ne 0 ]; then echo "검증 실패(fast)"; exit 1; fi
  echo "검증 통과(fast — 테스트는 pre-push·CI 에서 실행)"
  exit 0
fi

# ── 4) (선택) DB 통합/격리 테스트 ────────────────────────────────────────────
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
