#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 단계 선행조건 검사.
#
# 사용법: scripts/check-sdd-prerequisites.sh <product-slug> <feature> [--stage design|tasks|implement]
#   각 단계가 요구하는 선행 산출물이 있는지 확인하고, 관련 경로를 출력한다(명령이 위치를 안전하게 해석).
#   --stage 는 공백·등호 두 표기를 모두 받는다(new-feature.sh 는 --stage=S 를 쓴다).
#   모르는 단계 이름은 거부한다 — 오타가 조용히 requirements 검사로 떨어지면 게이트가 무력해진다.
set -uo pipefail

DOCS=".agents/docs"
slug="${1:-}"; feature="${2:-}"; stage=""
shift 2 2>/dev/null || true
while [ $# -gt 0 ]; do
  case "$1" in
    --stage=*) stage="${1#--stage=}"; shift ;;
    --stage)   stage="${2:-}"; shift 2 ;;
    -*)        echo "알 수 없는 옵션입니다: $1" >&2; exit 2 ;;
    *)         shift ;;
  esac
done

if [ -z "$slug" ] || [ -z "$feature" ]; then
  echo "사용법: $0 <product-slug> <feature> [--stage design|tasks|implement]" >&2; exit 2
fi

case "$stage" in
  ""|design|tasks|implement) ;;
  *) echo "✖ 알 수 없는 단계입니다: '$stage'   사용 가능: design tasks implement" >&2; exit 2 ;;
esac

base="$DOCS/${slug}-specs"
REQ="$base/requirements/$feature.md"
DESIGN="$base/design/$feature.md"
TASKS="$base/tasks/active/$feature.md"

echo "BASE=$base"
echo "REQUIREMENTS=$REQ"
echo "DESIGN=$DESIGN"
echo "TASKS=$TASKS"

miss=0
need() { [ -f "$1" ] && echo "  ✓ $2" || { echo "  ✗ $2 (없음: $1)"; miss=1; }; }

case "$stage" in
  design)          need "$REQ" "requirements" ;;
  tasks)           need "$REQ" "requirements"; need "$DESIGN" "design" ;;
  implement)       need "$REQ" "requirements"; need "$DESIGN" "design"; need "$TASKS" "tasks" ;;
  "")              need "$REQ" "requirements" ;;
esac

[ "$miss" -ne 0 ] && { echo "선행조건 미충족 — 이전 단계 명령을 먼저 실행하라." >&2; exit 1; }
echo "선행조건 OK${stage:+ (stage=$stage)}"
