#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 기능 스캐폴딩.
#
# 사용법: scripts/new-feature.sh <product-slug> <feature-short-name>
#   예)   scripts/new-feature.sh order create-order
#
# 동작: .agents/docs/product-<slug>-specs/{requirements,design,tasks/active}/<feature>.md 를
#       각 단계 _template.md 에서 생성한다. 제품 폴더가 없으면 기존 제품의 템플릿으로 부트스트랩한다.
#       기존 파일은 덮어쓰지 않는다(안전).
set -euo pipefail

DOCS=".agents/docs"
slug="${1:-}"; feature="${2:-}"
if [ -z "$slug" ] || [ -z "$feature" ]; then
  echo "사용법: $0 <product-slug> <feature-short-name>" >&2; exit 2
fi

base="$DOCS/product-${slug}-specs"

# 제품 폴더가 없으면 기존 제품의 템플릿을 소스로 부트스트랩
if [ ! -d "$base" ]; then
  src="$(ls -d "$DOCS"/product-*-specs 2>/dev/null | head -1 || true)"
  if [ -z "$src" ]; then
    echo "✖ 템플릿 소스가 없다: $DOCS/product-*-specs 중 하나가 필요(먼저 setup.sh 실행)." >&2; exit 1
  fi
  echo "▶ 새 제품 폴더 부트스트랩: $base (소스: $src)"
  mkdir -p "$base/requirements" "$base/design" "$base/checklists" "$base/tasks/active" "$base/tasks/check" "$base/tasks/completed"
  cp -n "$src/requirements/_template.md" "$base/requirements/_template.md"
  cp -n "$src/design/_template.md"       "$base/design/_template.md"
  cp -n "$src/checklists/_template.md"   "$base/checklists/_template.md" 2>/dev/null || true
  cp -n "$src/tasks/_template.md"        "$base/tasks/_template.md"
  cp -n "$src/tasks/README.md"           "$base/tasks/README.md" 2>/dev/null || true
  cp -n "$src/index.md"                  "$base/index.md" 2>/dev/null || true
  echo "  ↳ 제품 index.md 의 slug/요약을 확인·수정하라."
fi

for pair in "requirements/_template.md:requirements/$feature.md" \
            "design/_template.md:design/$feature.md" \
            "tasks/_template.md:tasks/active/$feature.md"; do
  tmpl="$base/${pair%%:*}"; dest="$base/${pair##*:}"
  if [ ! -f "$tmpl" ]; then echo "✖ 템플릿 없음: $tmpl" >&2; exit 1; fi
  if [ -e "$dest" ]; then echo "  ↷ skip(존재): $dest"; continue; fi
  mkdir -p "$(dirname "$dest")"
  cp "$tmpl" "$dest"
  echo "  ✎ $dest"
done

echo ""
echo "✔ 생성 완료: product-${slug}-specs 의 $feature (requirements/design/tasks)"
echo "다음: /hx-specify 로 requirements 채우기 → (/hx-clarify·/hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge 회수) (정본: .agents/rules/sdd-workflow.md)"
echo "제품 index.md 등록표에 '$feature' 행을 추가하라."
