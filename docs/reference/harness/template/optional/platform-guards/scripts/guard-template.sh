#!/usr/bin/env bash
# 가드 템플릿.
#
# 가드는 프로젝트 고유 불변 조건을 검사한다.
# 좋은 가드의 조건:
#   1. 빠르다 (수 초 내)
#   2. 오탐이 거의 없다
#   3. 실패 메시지가 "무엇을 어디서 어떻게 고칠지" 알려준다
#
# 사용: .agents/harness.json 의 guards 에 등록

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

GUARD_NAME="<가드 이름>"
violations=0

echo "[${GUARD_NAME}] checking..."

# --- 검사 로직 ---
# 예: 특정 패턴이 있는데 짝이 되는 패턴이 없는 경우를 찾는다.
#
# while IFS= read -r file; do
#   if grep -q 'PATTERN_A' "$file" && ! grep -q 'PATTERN_B' "$file"; then
#     echo "  ✗ $file: PATTERN_A 를 쓰면서 PATTERN_B 가 없습니다."
#     echo "      고치는 법: ..."
#     violations=$((violations + 1))
#   fi
# done < <(git ls-files 'src/**/*.ts')

echo ""
if (( violations > 0 )); then
  echo "[${GUARD_NAME}] ${violations} violation(s)."
  echo "  정책: .agents/rules/<관련 규칙>.md"
  exit 1
fi

echo "[${GUARD_NAME}] passed."
