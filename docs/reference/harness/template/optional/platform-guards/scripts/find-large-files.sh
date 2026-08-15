#!/usr/bin/env bash
# 거대 파일 임계 검사.
#
# 거대 파일은 스타일 문제가 아니라 정확도 문제다. 전체를 읽을 수 없으면
# 에이전트는 읽지 않은 부분을 추측하고, 추측은 회귀가 된다.
#
# 사용: bash scripts/find-large-files.sh [임계값]
#       임계값 생략 시 .agents/harness.json 의 budget.largeFileThreshold

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

THRESHOLD="${1:-}"

if [[ -z "$THRESHOLD" ]]; then
  THRESHOLD="$(node -e "
    const fs = require('fs');
    try {
      const c = JSON.parse(fs.readFileSync('.agents/harness.json', 'utf8'));
      process.stdout.write(String(c.budget?.largeFileThreshold ?? 800));
    } catch { process.stdout.write('800'); }
  ")"
fi

EXCLUDE_PATTERN="${LARGE_FILE_EXCLUDE:-^(node_modules|dist|build|out|vendor|\.git)/}"

echo "[find-large-files] threshold: ${THRESHOLD} lines"

found=0
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  [[ "$file" =~ $EXCLUDE_PATTERN ]] && continue

  # 텍스트 파일만
  if ! grep -Iq . "$file" 2>/dev/null; then continue; fi

  lines=$(wc -l < "$file" | tr -d ' ')
  if (( lines >= THRESHOLD )); then
    printf '%6d  %s\n' "$lines" "$file"
    found=$((found + 1))
  fi
done < <(git ls-files)

echo ""
if (( found > 0 )); then
  echo "[find-large-files] ${found} file(s) at or above the threshold."
  echo "  These must be read partially (Read with offset/limit), never in full."
  echo "  Decompose before adding features to them."
  exit 1
fi

echo "[find-large-files] no files above the threshold."
