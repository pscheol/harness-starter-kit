#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 작업 스캐폴딩.
#
# 사용법: scripts/new-feature.sh <product-slug> <short-name> [--type=T] [--priority=N]
#   예)   scripts/new-feature.sh order create-order
#         scripts/new-feature.sh order payment-timeout --type=fix
#         scripts/new-feature.sh order refund --priority=2
#
# 파일명 규약: <우선순위>-<종류>-<이름>.md   예) 1-feat-create-order.md · 2-fix-payment-timeout.md
#   <우선순위> --priority 를 주지 않으면 기존 최대 번호 + 1
#   <종류>     feat(기본) · fix · refactor · perf · chore · docs
#   세 폴더(requirements·design·tasks)가 **같은 파일명**을 써야 서로 추적되므로 셋 다 함께 갑니다.
#
# 동작: .agents/docs/<slug>-specs/{requirements,design,tasks/active}/<파일명> 을
#       .agents/docs/_spec-templates/ 의 원본에서 생성합니다.
#       제품 폴더가 없으면 골격(index.md · tasks/README.md · 빈 하위폴더)까지 함께 만듭니다.
#       템플릿(_template.md)은 제품 폴더에 복사하지 않습니다 — 원본은 _spec-templates/ 한 곳뿐입니다.
#       기존 파일은 덮어쓰지 않습니다(안전).
#       끝나면 scripts/board.sh 로 보드를 갱신합니다.
set -euo pipefail

DOCS=".agents/docs"
TMPL="$DOCS/_spec-templates"
TYPES="feat fix refactor perf chore docs"

slug=""; name=""; priority=""; type="feat"
for arg in "$@"; do
  case "$arg" in
    --type=*)     type="${arg#--type=}" ;;
    --priority=*) priority="${arg#--priority=}" ;;
    -*) echo "알 수 없는 옵션입니다: $arg" >&2; exit 2 ;;
    *)  if [ -z "$slug" ]; then slug="$arg"; elif [ -z "$name" ]; then name="$arg"; fi ;;
  esac
done

if [ -z "$slug" ] || [ -z "$name" ]; then
  echo "사용법: $0 <product-slug> <short-name> [--type=<$(echo "$TYPES" | tr ' ' '|')>] [--priority=N]" >&2
  exit 2
fi

ok=0
for t in $TYPES; do [ "$t" = "$type" ] && ok=1; done
if [ "$ok" -ne 1 ]; then
  echo "✖ 알 수 없는 종류입니다: '$type'   사용 가능: $TYPES" >&2; exit 2
fi

case "$name" in
  [0-9]*-*) echo "✖ 이름에 번호를 직접 붙이지 마십시오: '$name'" >&2
            echo "  번호는 이 스크립트가 붙입니다. 지정하시려면 --priority=N 을 쓰십시오." >&2; exit 2 ;;
esac
for t in $TYPES; do
  case "$name" in "$t"-*) echo "✖ 이름에 종류를 직접 붙이지 마십시오: '$name'  → --type=$t 를 쓰십시오." >&2; exit 2 ;; esac
done
if [ -n "$priority" ]; then
  case "$priority" in
    ''|*[!0-9]*) echo "✖ --priority 는 숫자여야 합니다: '$priority'" >&2; exit 2 ;;
  esac
fi

if [ ! -d "$TMPL" ]; then
  echo "✖ 템플릿 원본이 없습니다: $TMPL (먼저 setup.sh 를 실행하십시오)." >&2; exit 1
fi

base="$DOCS/${slug}-specs"

# 제품 폴더가 없으면 골격만 만든다(템플릿은 복사하지 않는다).
if [ ! -d "$base" ]; then
  echo "▶ 새 제품 폴더 생성: $base"
  mkdir -p "$base/requirements" "$base/design" "$base/checklists" \
           "$base/tasks/active" "$base/tasks/check" "$base/tasks/completed"
  # 제품 색인은 {{PRODUCT_SLUG}} 를 실제 슬러그로 치환해 심는다.
  LC_ALL=C sed "s|{{PRODUCT_SLUG}}|${slug}|g" "$TMPL/index.md" > "$base/index.md"
  cp "$TMPL/tasks/README.md" "$base/tasks/README.md"
  echo "  ↳ $base/index.md 의 요약·기준 문서를 채우십시오(보드 구간은 자동 생성됩니다)."
  echo "  ↳ $DOCS/specs-index.md 제품 등록표에 '$slug' 행을 추가하십시오."
fi

# 우선순위 번호를 정한다. 다섯 위치를 모두 훑어야 이미 완료된 번호와도 겹치지 않는다.
if [ -z "$priority" ]; then
  max=0
  for d in requirements design tasks/active tasks/check tasks/completed; do
    [ -d "$base/$d" ] || continue
    for f in "$base/$d"/*.md; do
      [ -e "$f" ] || continue
      k="$(basename "$f" .md)"
      case "$k" in
        [0-9]*-*) n="${k%%-*}"; n=$((10#$n)); [ "$n" -gt "$max" ] && max="$n" ;;
      esac
    done
  done
  priority=$((max + 1))
fi
key="${priority}-${type}-${name}"

# 같은 이름이 다른 번호·종류로 이미 있으면 알린다(중복 스펙 방지).
for d in requirements design tasks/active tasks/check tasks/completed; do
  [ -d "$base/$d" ] || continue
  for f in "$base/$d"/*-"$name".md; do
    [ -e "$f" ] || continue
    [ "$(basename "$f" .md)" = "$key" ] && continue
    echo "  ⚠ 같은 이름이 이미 있습니다: $f" >&2
  done
done

for pair in "requirements/_template.md:requirements/$key.md" \
            "design/_template.md:design/$key.md" \
            "tasks/_template.md:tasks/active/$key.md"; do
  src="$TMPL/${pair%%:*}"; dest="$base/${pair##*:}"
  if [ ! -f "$src" ]; then echo "✖ 템플릿이 없습니다: $src" >&2; exit 1; fi
  if [ -e "$dest" ]; then echo "  ↷ skip(존재): $dest"; continue; fi
  mkdir -p "$(dirname "$dest")"
  LC_ALL=C sed "s|{{PRODUCT_SLUG}}|${slug}|g" "$src" > "$dest"
  echo "  ✎ $dest"
done

# 보드는 파일 위치에서 계산하므로 생성 직후 한 번 갱신한다.
if [ -f scripts/board.sh ]; then
  bash scripts/board.sh "$slug" >/dev/null 2>&1 || true
fi

echo ""
echo "✔ 생성 완료: ${slug}-specs 의 $key  (종류 $type · 우선순위 $priority)"
echo "다음: /hx-specify 로 requirements 채우기 → (/hx-clarify·/hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge 회수) (원본: .agents/rules/sdd-workflow.md)"
echo "보드는 $base/index.md 와 $DOCS/specs-index.md 의 BOARD 구간에 자동 반영됩니다."
