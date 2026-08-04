#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 기능 스캐폴딩.
#
# 사용법: scripts/new-feature.sh <product-slug> <feature-short-name>
#   예)   scripts/new-feature.sh order create-order
#
# 동작: .agents/docs/product-<slug>-specs/{requirements,design,tasks/active}/<feature>.md 를
#       .agents/docs/_spec-templates/ 의 원본에서 생성한다.
#       제품 폴더가 없으면 골격(index.md · tasks/README.md · 빈 하위폴더)까지 함께 만든다.
#       템플릿(_template.md)은 제품 폴더에 복사하지 않는다 — 원본은 _spec-templates/ 한 곳뿐이다.
#       기존 파일은 덮어쓰지 않는다(안전).
set -euo pipefail

DOCS=".agents/docs"
TMPL="$DOCS/_spec-templates"
slug="${1:-}"; feature="${2:-}"
if [ -z "$slug" ] || [ -z "$feature" ]; then
  echo "사용법: $0 <product-slug> <feature-short-name>" >&2; exit 2
fi

if [ ! -d "$TMPL" ]; then
  echo "✖ 템플릿 정본이 없다: $TMPL (먼저 setup.sh 실행)." >&2; exit 1
fi

base="$DOCS/product-${slug}-specs"

# 제품 폴더가 없으면 골격만 만든다(템플릿은 복사하지 않는다).
if [ ! -d "$base" ]; then
  echo "▶ 새 제품 폴더 생성: $base"
  mkdir -p "$base/requirements" "$base/design" "$base/checklists" \
           "$base/tasks/active" "$base/tasks/check" "$base/tasks/completed"
  # 제품 색인은 {{PRODUCT_SLUG}} 를 실제 슬러그로 치환해 심는다.
  LC_ALL=C sed "s|{{PRODUCT_SLUG}}|${slug}|g" "$TMPL/index.md" > "$base/index.md"
  cp "$TMPL/tasks/README.md" "$base/tasks/README.md"
  echo "  ↳ $base/index.md 의 요약·기준 문서·등록표를 채워라."
  echo "  ↳ $DOCS/specs-index.md 제품 등록표에 '$slug' 행을 추가하라."
fi

for pair in "requirements/_template.md:requirements/$feature.md" \
            "design/_template.md:design/$feature.md" \
            "tasks/_template.md:tasks/active/$feature.md"; do
  src="$TMPL/${pair%%:*}"; dest="$base/${pair##*:}"
  if [ ! -f "$src" ]; then echo "✖ 템플릿 없음: $src" >&2; exit 1; fi
  if [ -e "$dest" ]; then echo "  ↷ skip(존재): $dest"; continue; fi
  mkdir -p "$(dirname "$dest")"
  LC_ALL=C sed "s|{{PRODUCT_SLUG}}|${slug}|g" "$src" > "$dest"
  echo "  ✎ $dest"
done

echo ""
echo "✔ 생성 완료: product-${slug}-specs 의 $feature (requirements/design/tasks)"
echo "다음: /hx-specify 로 requirements 채우기 → (/hx-clarify·/hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge 회수) (정본: .agents/rules/sdd-workflow.md)"
echo "제품 index.md 등록표에 '$feature' 행을 추가하라."
