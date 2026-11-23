#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — 가드 템플릿.
#
# 이 파일을 복제해 가드를 만든다. 파일명이 곧 가드 이름이다(예: no-direct-env-access.sh).
# 밑줄로 시작하는 파일은 실행기가 건너뛰므로 이 템플릿 자체는 돌지 않는다.
#
# 계약:
#   · 종료 코드 0  = 통과
#   · 종료 코드 !0 = 위반. 위반 위치를 파일:줄 형식으로 출력한다(사람이 바로 열 수 있게)
#   · 출력은 위반 목록만. 통과 시에는 아무것도 찍지 않는다(게이트 로그가 조용해야 신호가 보인다)
#
# 강제 수준 — 아래 한 줄이 이 가드의 승격 단계다.
#   0 = 경고(기본). 위반을 보고하되 게이트를 막지 않는다.
#   1 = 강제. 위반이 있으면 게이트가 실패한다.
#   **새 가드는 반드시 0으로 시작한다.** 기존 위반을 전부 정리해 0건이 된 뒤 1로 올린다.
#   처음부터 1로 두면 무관한 작업이 막히고, 그 가드는 곧 지워진다.
# harness-guard-enforce: 0
#
# 규약·승격 절차 원본: .agents/rules/platform-invariants.md
set -uo pipefail

# ── 무엇을 검사하는가 (한 줄로 적는다) ──────────────────────────────────────
# 예: 설정값을 config 모듈이 아닌 곳에서 직접 읽는 코드를 막는다.
#     이유 — 값의 출처가 흩어지면 환경별 설정 변경이 어디까지 영향을 주는지 알 수 없다.

# 검사 대상 디렉터리. 없는 디렉터리는 조용히 빠진다(스택마다 레이아웃이 다르다).
DIRS=""
for d in src app lib internal cmd apps packages; do
  [ -d "$d" ] && DIRS="$DIRS $d"
done
[ -z "$DIRS" ] && exit 0

# ── 검사 ────────────────────────────────────────────────────────────────────
# grep 은 위반을 찾으면 0, 못 찾으면 1을 반환한다. 가드의 성공/실패와 반대이므로 뒤집는다.
# shellcheck disable=SC2086  # DIRS 는 공백 구분 경로 목록이라 분리돼야 한다
HITS="$(grep -RIn --exclude-dir=node_modules --exclude='*.test.*' \
  -E '<검사할 정규식>' $DIRS 2>/dev/null || true)"

if [ -n "$HITS" ]; then
  echo "$HITS"
  echo "  → <어떻게 고치는가 한 줄>"
  exit 1
fi

exit 0
