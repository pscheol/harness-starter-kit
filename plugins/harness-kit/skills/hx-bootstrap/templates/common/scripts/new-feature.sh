#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 단계 문서 스캐폴딩.
#
# 사용법: scripts/new-feature.sh <product-slug> <이름|키> [--stage=S] [--type=T] [--priority=N] [--all]
#   예)   scripts/new-feature.sh order create-order                   1단계 requirements 생성
#         scripts/new-feature.sh order create-order --stage=design    2단계 design 생성
#         scripts/new-feature.sh order create-order --stage=tasks     3단계 tasks 생성
#         scripts/new-feature.sh order payment-timeout --type=fix
#         scripts/new-feature.sh order refund --priority=2
#         scripts/new-feature.sh order hotfix --all                   3종 한 번에(예외)
#
# **단계마다 그 단계 문서만 만듭니다.** 빈 design·tasks 를 미리 깔면
#   ① board.sh 가 파일 위치로 상태를 계산하므로 모든 기능이 만들자마자 🔨 구현으로 뜨고
#   ② check-sdd-prerequisites.sh 의 단계 게이트가 항상 통과해 무력해집니다.
# 설계가 이미 확정된 소규모 작업만 --all 로 3종을 함께 만드십시오(보드에서 곧장 🔨 구현).
#
# 파일명 규약: <우선순위>-<종류>-<이름>.md   예) 1-feat-create-order.md · 2-fix-payment-timeout.md
#   <우선순위> --priority 를 주지 않으면 기존 최대 번호 + 1
#   <종류>     feat(기본) · fix · refactor · perf · chore · docs
#   세 폴더(requirements·design·tasks)가 **같은 파일명**을 써야 서로 추적되므로
#   2·3단계는 1단계가 정한 키를 그대로 씁니다(이름만 주면 requirements 에서 찾아냅니다).
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
STAGES="requirements design tasks"

slug=""; name=""; priority=""; type="feat"; stage=""; all=0
for arg in "$@"; do
  case "$arg" in
    --stage=*)    stage="${arg#--stage=}" ;;
    --type=*)     type="${arg#--type=}" ;;
    --priority=*) priority="${arg#--priority=}" ;;
    --all)        all=1 ;;
    -*) echo "알 수 없는 옵션입니다: $arg" >&2; exit 2 ;;
    *)  if [ -z "$slug" ]; then slug="$arg"; elif [ -z "$name" ]; then name="$arg"; fi ;;
  esac
done

if [ -z "$slug" ] || [ -z "$name" ]; then
  echo "사용법: $0 <product-slug> <이름|키> [--stage=$(echo "$STAGES" | tr ' ' '|')] [--type=$(echo "$TYPES" | tr ' ' '|')] [--priority=N] [--all]" >&2
  exit 2
fi

if [ "$all" = 1 ] && [ -n "$stage" ]; then
  echo "✖ --all 과 --stage 는 함께 쓸 수 없습니다. 단계별로 만드시려면 --stage 만 쓰십시오." >&2; exit 2
fi
[ -n "$stage" ] || stage="requirements"

ok=0
for s in $STAGES; do [ "$s" = "$stage" ] && ok=1; done
if [ "$ok" -ne 1 ]; then
  echo "✖ 알 수 없는 단계입니다: '$stage'   사용 가능: $STAGES" >&2; exit 2
fi

ok=0
for t in $TYPES; do [ "$t" = "$type" ] && ok=1; done
if [ "$ok" -ne 1 ]; then
  echo "✖ 알 수 없는 종류입니다: '$type'   사용 가능: $TYPES" >&2; exit 2
fi

if [ -n "$priority" ]; then
  case "$priority" in
    ''|*[!0-9]*) echo "✖ --priority 는 숫자여야 합니다: '$priority'" >&2; exit 2 ;;
  esac
fi

if [ ! -d "$TMPL" ]; then
  echo "✖ 템플릿 원본이 없습니다: $TMPL (먼저 setup.sh 를 실행하십시오)." >&2; exit 1
fi

base="$DOCS/${slug}-specs"
SPEC_DIRS="requirements design tasks/active tasks/check tasks/completed"

# ── 1단계(또는 --all): 새 키를 정한다 ────────────────────────────────────────
if [ "$stage" = requirements ] || [ "$all" = 1 ]; then
  case "$name" in
    [0-9]*-*) echo "✖ 이름에 번호를 직접 붙이지 마십시오: '$name'" >&2
              echo "  번호는 이 스크립트가 붙입니다. 지정하시려면 --priority=N 을 쓰십시오." >&2; exit 2 ;;
  esac
  for t in $TYPES; do
    case "$name" in "$t"-*) echo "✖ 이름에 종류를 직접 붙이지 마십시오: '$name'  → --type=$t 를 쓰십시오." >&2; exit 2 ;; esac
  done

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
    for d in $SPEC_DIRS; do
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
  for d in $SPEC_DIRS; do
    [ -d "$base/$d" ] || continue
    for f in "$base/$d"/*-"$name".md; do
      [ -e "$f" ] || continue
      [ "$(basename "$f" .md)" = "$key" ] && continue
      echo "  ⚠ 같은 이름이 이미 있습니다: $f" >&2
    done
  done

# ── 2·3단계: 1단계가 정한 키를 찾아 그대로 쓴다 ─────────────────────────────
else
  if [ ! -d "$base" ]; then
    echo "✖ 제품 폴더가 없습니다: $base" >&2
    echo "  먼저 requirements 를 만드십시오:  $0 $slug <이름>   (또는 /hx-specify)" >&2; exit 1
  fi

  key=""
  # 전체 키(<번호>-<종류>-<이름>)를 그대로 주면 그것을 쓴다.
  if [ -f "$base/requirements/$name.md" ]; then
    key="$name"
  else
    # 짧은 이름만 주면 requirements 에서 찾는다. 후보가 하나여야 한다.
    matches=""; nmatch=0
    for f in "$base/requirements"/*-"$name".md; do
      [ -e "$f" ] || continue
      matches="$matches  $(basename "$f" .md)"$'\n'; nmatch=$((nmatch+1))
      key="$(basename "$f" .md)"
    done
    if [ "$nmatch" -eq 0 ]; then
      echo "✖ requirements 를 찾을 수 없습니다: $base/requirements/(*-)$name.md" >&2
      echo "  '$stage' 단계는 requirements 가 있어야 시작합니다. 먼저 /hx-specify 를 실행하십시오." >&2; exit 1
    fi
    if [ "$nmatch" -gt 1 ]; then
      echo "✖ 이름 '$name' 에 해당하는 requirements 가 여럿입니다:" >&2
      printf '%s' "$matches" >&2
      echo "  전체 키를 그대로 지정하십시오. 예)  $0 $slug <번호>-<종류>-$name --stage=$stage" >&2; exit 2
    fi
  fi

  # 선행 단계 산출물을 확인한다. 판정 기준은 check-sdd-prerequisites.sh 와 같다.
  if [ "$stage" = tasks ] && [ ! -f "$base/design/$key.md" ]; then
    echo "✖ design 이 없습니다: $base/design/$key.md" >&2
    echo "  tasks 는 design 승인 후에 만듭니다. 먼저 /hx-plan 을 실행하십시오." >&2; exit 1
  fi
fi

# ── 만들 단계 문서를 고른다 ─────────────────────────────────────────────────
if [ "$all" = 1 ]; then
  pairs="requirements/_template.md:requirements/$key.md
design/_template.md:design/$key.md
tasks/_template.md:tasks/active/$key.md"
else
  case "$stage" in
    requirements) pairs="requirements/_template.md:requirements/$key.md" ;;
    design)       pairs="design/_template.md:design/$key.md" ;;
    tasks)        pairs="tasks/_template.md:tasks/active/$key.md" ;;
  esac
fi

made=0
while IFS= read -r pair; do
  [ -n "$pair" ] || continue
  src="$TMPL/${pair%%:*}"; dest="$base/${pair##*:}"
  if [ ! -f "$src" ]; then echo "✖ 템플릿이 없습니다: $src" >&2; exit 1; fi
  if [ -e "$dest" ]; then echo "  ↷ skip(존재): $dest"; continue; fi
  mkdir -p "$(dirname "$dest")"
  LC_ALL=C sed "s|{{PRODUCT_SLUG}}|${slug}|g" "$src" > "$dest"
  echo "  ✎ $dest"
  made=$((made+1))
done <<EOF
$pairs
EOF

# 보드는 파일 위치에서 계산하므로 생성 직후 한 번 갱신한다.
if [ -f scripts/board.sh ]; then
  bash scripts/board.sh "$slug" >/dev/null 2>&1 || true
fi

echo ""
if [ "$all" = 1 ]; then
  echo "✔ 생성 완료: ${slug}-specs 의 $key — requirements·design·tasks 3종 (종류 $type · 우선순위 $priority)"
  echo "  ⚠ 보드에는 곧바로 🔨 구현으로 뜹니다. 단계 게이트를 쓰시려면 --all 없이 단계별로 만드십시오."
elif [ "$made" -eq 0 ]; then
  echo "✔ 이미 있습니다: ${slug}-specs 의 $key — $stage (새로 만든 파일 없음)"
else
  echo "✔ 생성 완료: ${slug}-specs 의 $key — $stage"
fi

case "$stage" in
  requirements) [ "$all" = 1 ] || echo "다음: /hx-specify 로 requirements 를 채우고 승인받은 뒤 /hx-plan (design 파일은 그때 만들어집니다)." ;;
  design)       echo "다음: /hx-plan 으로 design 을 채우고 승인받은 뒤 /hx-tasks." ;;
  tasks)        echo "다음: /hx-tasks 로 작업을 분해하고 승인받은 뒤 /hx-implement." ;;
esac
echo "전체 흐름: /hx-specify → (/hx-clarify·/hx-checklist) → /hx-plan → /hx-tasks → (/hx-analyze) → /hx-implement → (/hx-converge 회수)"
echo "  원본: .agents/rules/sdd-workflow.md · 보드는 $base/index.md 와 $DOCS/specs-index.md 의 BOARD 구간에 자동 반영됩니다."
