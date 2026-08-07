#!/usr/bin/env bash
# HARNESS STARTER KIT ({{PROJECT_NAME}}) — SDD 보드 생성기.
#
# 사용법: scripts/board.sh [product-slug]        특정 제품만 갱신합니다
#         scripts/board.sh --all                 전 제품을 갱신합니다 (기본)
#         scripts/board.sh --check               갱신이 필요한지만 판정합니다(쓰지 않음, hook·CI용)
#
# 상태의 단일 진실 원천은 **파일이 놓인 위치**입니다. 사람이 표의 ☑ 를 손으로 고치는 순간
# 실제와 어긋나므로, 이 스크립트가 폴더를 스캔해 보드를 매번 새로 그립니다.
#
#   requirements/<N>-<feature>.md 만 있음       → 요구
#   design/<N>-<feature>.md 까지 있음           → 설계
#   tasks/active/<N>-<feature>.md               → 구현
#   tasks/check/<N>-<feature>.md                → 검증(사용자 승인 대기)
#   tasks/completed/<N>-<feature>.md            → 완료
#
# 파일명 앞의 <N>- 은 우선순위입니다(new-feature.sh 가 붙입니다). 번호가 없는 파일도 읽되
# 정렬에서 뒤로 밀고 보드에 번호를 — 로 표시합니다.
#
# 쓰는 곳은 마커 사이뿐입니다. 마커 밖 본문은 건드리지 않습니다:
#   <!-- BOARD:BEGIN --> … <!-- BOARD:END -->
set -euo pipefail

DOCS=".agents/docs"
MODE="all"
CHECK=0
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --all)   MODE="all" ;;
    --check) CHECK=1 ;;
    -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)      echo "알 수 없는 옵션입니다: $arg" >&2; exit 2 ;;
    *)       MODE="one"; TARGET="$arg" ;;
  esac
done

[ -d "$DOCS" ] || { echo "✖ $DOCS 가 없습니다. 먼저 하네스를 설치하십시오." >&2; exit 1; }

# 키 규약: <번호>-<종류>-<이름>  (예: 1-feat-checkout · 2-fix-payment-timeout)
# 번호나 종류가 없는 예전 파일도 읽는다. 번호가 없으면 9999 로 밀어 뒤에 정렬한다.
KEY_TYPES="feat fix refactor perf chore docs"

key_num() { case "$1" in [0-9]*-*) echo "${1%%-*}" ;; *) echo 9999 ;; esac; }

key_type() {
  local rest t k
  case "$1" in [0-9]*-*) rest="${1#*-}" ;; *) rest="$1" ;; esac
  t="${rest%%-*}"
  for k in $KEY_TYPES; do [ "$k" = "$t" ] && { echo "$t"; return; }; done
  echo ""
}

key_name() {
  local rest t
  case "$1" in [0-9]*-*) rest="${1#*-}" ;; *) rest="$1" ;; esac
  t="$(key_type "$1")"
  [ -n "$t" ] && rest="${rest#"$t"-}"
  echo "$rest"
}

# 한 제품 폴더의 보드 마크다운을 stdout 으로 만든다.
render_board() {
  local base="$1" slug="$2"
  local keys="" k st

  # 다섯 위치를 전부 훑어 feature 키를 모은다(어느 단계에서 시작했든 보드에 뜬다).
  for d in requirements design tasks/active tasks/check tasks/completed; do
    [ -d "$base/$d" ] || continue
    for f in "$base/$d"/*.md; do
      [ -e "$f" ] || continue
      k="$(basename "$f" .md)"
      case "$k" in _*|README) continue ;; esac
      case "$keys" in *"|$k|"*) ;; *) keys="$keys|$k|" ;; esac
    done
  done

  # 정렬: 번호 오름차순 → 이름
  local sorted=""
  if [ -n "$keys" ]; then
    sorted="$(printf '%s\n' "$keys" | tr '|' '\n' | sed '/^$/d' | sort -u \
      | while IFS= read -r k; do printf '%s\t%s\n' "$(printf '%04d' "$(key_num "$k")")" "$k"; done \
      | sort | cut -f2)"
  fi

  local col_req="" col_des="" col_run="" col_chk="" col_done=""
  local rows="" n_req=0 n_des=0 n_run=0 n_chk=0 n_done=0 total=0

  if [ -n "$sorted" ]; then
    while IFS= read -r k; do
      [ -n "$k" ] || continue
      total=$((total+1))
      local has_r=☐ has_d=☐ has_c=─ label num ncl
      [ -f "$base/requirements/$k.md" ] && has_r=☑
      [ -f "$base/design/$k.md" ] && has_d=☑
      # 체크리스트는 <feature>-<도메인>.md 라 접두 일치로 센다.
      ncl="$(find "$base/checklists" -maxdepth 1 -name "$k-*.md" 2>/dev/null | wc -l | tr -d ' ')"
      [ "${ncl:-0}" -gt 0 ] && has_c="$ncl"

      if   [ -f "$base/tasks/completed/$k.md" ]; then label='✅ 완료'; col_done="$col_done$k<br>"; n_done=$((n_done+1))
      elif [ -f "$base/tasks/check/$k.md" ];     then label='👀 검증'; col_chk="$col_chk$k<br>";   n_chk=$((n_chk+1))
      elif [ -f "$base/tasks/active/$k.md" ];    then label='🔨 구현'; col_run="$col_run$k<br>";   n_run=$((n_run+1))
      elif [ "$has_d" = ☑ ];                     then label='🎨 설계'; col_des="$col_des$k<br>";   n_des=$((n_des+1))
      else                                            label='📋 요구'; col_req="$col_req$k<br>";   n_req=$((n_req+1))
      fi

      num="$(key_num "$k")"; [ "$num" = 9999 ] && num='—'
      local kt; kt="$(key_type "$k")"; [ -n "$kt" ] || kt='—'
      rows="$rows| $num | \`$kt\` | \`$(key_name "$k")\` | $has_r | $has_c | $has_d | $label |"$'\n'
    done <<EOF
$sorted
EOF
  fi

  [ -n "$col_req" ]  || col_req='—';  [ -n "$col_des" ]  || col_des='—'
  [ -n "$col_run" ]  || col_run='—';  [ -n "$col_chk" ]  || col_chk='—'
  [ -n "$col_done" ] || col_done='—'

  echo "<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. 손으로 고치지 마십시오. -->"
  echo ""
  echo "### 보드 — \`$slug\`"
  echo ""
  echo "| 📋 요구 ($n_req) | 🎨 설계 ($n_des) | 🔨 구현 ($n_run) | 👀 검증 ($n_chk) | ✅ 완료 ($n_done) |"
  echo "|---|---|---|---|---|"
  echo "| ${col_req%<br>} | ${col_des%<br>} | ${col_run%<br>} | ${col_chk%<br>} | ${col_done%<br>} |"
  echo ""
  if [ "$total" -eq 0 ]; then
    echo "> 아직 기능이 없습니다. \`scripts/new-feature.sh $slug <feature>\` 로 시작하십시오."
  else
    echo "| 우선순위 | 종류 | 이름 | req | 체크리스트 | design | 상태 |"
    echo "|---|---|---|---|---|---|---|"
    printf '%s' "$rows"
    echo ""
    echo "> 상태는 **파일 위치**에서 계산합니다(\`tasks/active\` → \`check\` → \`completed\`)."
    echo "> 표를 고치지 마시고 파일을 옮기신 뒤 \`bash scripts/board.sh\` 를 실행하십시오."
    echo "> \`completed\` 가 곧 e2e 동작을 뜻하지는 않습니다 — 계약·골격만 끝난 상태일 수 있습니다."
  fi
  echo ""
  echo "<!-- BOARD:END -->"
}

# 전 제품을 한 판에 모은 보드. specs-index.md 에 들어가며 이것이 최상위 진입점이다.
# 항목은 <제품>/<번호>-<이름> 으로 적어 제품이 여럿이어도 구분된다.
render_global() {
  local col_req="" col_des="" col_run="" col_chk="" col_done=""
  local n_req=0 n_des=0 n_run=0 n_chk=0 n_done=0
  local prod_rows="" nprod=0 base slug k keys sorted

  for base in "$DOCS"/*-specs; do
    [ -d "$base" ] || continue
    slug="$(basename "$base")"; slug="${slug%-specs}"
    nprod=$((nprod+1))
    local p_req=0 p_des=0 p_run=0 p_chk=0 p_done=0 p_total=0

    keys=""
    for d in requirements design tasks/active tasks/check tasks/completed; do
      [ -d "$base/$d" ] || continue
      for f in "$base/$d"/*.md; do
        [ -e "$f" ] || continue
        k="$(basename "$f" .md)"
        case "$k" in _*|README) continue ;; esac
        case "$keys" in *"|$k|"*) ;; *) keys="$keys|$k|" ;; esac
      done
    done
    [ -n "$keys" ] || { prod_rows="$prod_rows| [\`$slug\`](${slug}-specs/index.md) | 0 | 0 | 0 | 0 | 0 | 0 |"$'\n'; continue; }

    sorted="$(printf '%s\n' "$keys" | tr '|' '\n' | sed '/^$/d' | sort -u \
      | while IFS= read -r k; do printf '%s\t%s\n' "$(printf '%04d' "$(key_num "$k")")" "$k"; done \
      | sort | cut -f2)"

    while IFS= read -r k; do
      [ -n "$k" ] || continue
      p_total=$((p_total+1))
      if   [ -f "$base/tasks/completed/$k.md" ]; then col_done="$col_done$slug/$k<br>"; n_done=$((n_done+1)); p_done=$((p_done+1))
      elif [ -f "$base/tasks/check/$k.md" ];     then col_chk="$col_chk$slug/$k<br>";   n_chk=$((n_chk+1));   p_chk=$((p_chk+1))
      elif [ -f "$base/tasks/active/$k.md" ];    then col_run="$col_run$slug/$k<br>";   n_run=$((n_run+1));   p_run=$((p_run+1))
      elif [ -f "$base/design/$k.md" ];          then col_des="$col_des$slug/$k<br>";   n_des=$((n_des+1));   p_des=$((p_des+1))
      else                                            col_req="$col_req$slug/$k<br>";   n_req=$((n_req+1));   p_req=$((p_req+1))
      fi
    done <<EOF
$sorted
EOF
    prod_rows="$prod_rows| [\`$slug\`](${slug}-specs/index.md) | $p_req | $p_des | $p_run | $p_chk | $p_done | $p_total |"$'\n'
  done

  [ -n "$col_req" ]  || col_req='—';  [ -n "$col_des" ]  || col_des='—'
  [ -n "$col_run" ]  || col_run='—';  [ -n "$col_chk" ]  || col_chk='—'
  [ -n "$col_done" ] || col_done='—'

  echo "<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. 손으로 고치지 마십시오. -->"
  echo ""
  echo "## 전체 보드 (전 제품)"
  echo ""
  echo "| 📋 요구 ($n_req) | 🎨 설계 ($n_des) | 🔨 구현 ($n_run) | 👀 검증 ($n_chk) | ✅ 완료 ($n_done) |"
  echo "|---|---|---|---|---|"
  echo "| ${col_req%<br>} | ${col_des%<br>} | ${col_run%<br>} | ${col_chk%<br>} | ${col_done%<br>} |"
  echo ""
  if [ "$nprod" -eq 0 ]; then
    echo "> 아직 제품이 없습니다. \`scripts/new-feature.sh <slug> <feature>\` 로 시작하십시오."
  else
    echo "| 제품 | 📋 요구 | 🎨 설계 | 🔨 구현 | 👀 검증 | ✅ 완료 | 합계 |"
    echo "|---|---|---|---|---|---|---|"
    printf '%s' "$prod_rows"
    echo ""
    echo "> 항목 표기는 \`<제품>/<우선순위>-<feature>\` 입니다. 제품별 상세는 각 \`index.md\` 보드를 보십시오."
    echo "> 상태는 **파일 위치**에서 계산합니다 — 표를 고치지 마시고 \`bash scripts/board.sh\` 를 실행하십시오."
  fi
  echo ""
  echo "<!-- BOARD:END -->"
}

# 마커 구간을 새 내용으로 갈아 끼운다. 마커가 없으면 파일 끝에 새로 만든다.
# 본문은 파일로 넘긴다 — awk -v 는 값에 개행을 담지 못한다(BSD awk 에서 즉시 깨진다).
apply_board() {
  local file="$1" bodyfile="$2" tmp
  tmp="$(mktemp)"
  if grep -q '<!-- BOARD:BEGIN' "$file" 2>/dev/null; then
    awk -v bf="$bodyfile" '
      /<!-- BOARD:BEGIN/ { while ((getline l < bf) > 0) print l; close(bf); skip=1; next }
      /<!-- BOARD:END/   { skip=0; next }
      !skip { print }
    ' "$file" > "$tmp"
  else
    { cat "$file"; echo ""; cat "$bodyfile"; } > "$tmp"
  fi
  if cmp -s "$tmp" "$file"; then rm -f "$tmp"; return 1; fi   # 변경 없음
  if [ "$CHECK" = 1 ]; then rm -f "$tmp"; return 0; fi        # 변경 필요(쓰지는 않는다)
  mv "$tmp" "$file"
  return 0
}

changed=0
found=0
for base in "$DOCS"/*-specs; do
  [ -d "$base" ] || continue
  slug="$(basename "$base")"; slug="${slug%-specs}"
  if [ "$MODE" = one ] && [ "$slug" != "$TARGET" ]; then continue; fi
  found=$((found+1))
  idx="$base/index.md"
  if [ ! -f "$idx" ]; then
    echo "  ↷ index.md 없음: $base" >&2
    continue
  fi
  bodyf="$(mktemp)"
  render_board "$base" "$slug" > "$bodyf"
  if apply_board "$idx" "$bodyf"; then
    rm -f "$bodyf"
    changed=$((changed+1))
    if [ "$CHECK" = 1 ]; then echo "  ✎ 갱신 필요  $idx"; else echo "  ✎ 갱신  $idx"; fi
  else
    rm -f "$bodyf"
    echo "  ↷ 변경 없음  $idx"
  fi
done

if [ "$MODE" = one ] && [ "$found" -eq 0 ]; then
  echo "✖ 제품 폴더를 찾을 수 없습니다: $DOCS/$TARGET-specs" >&2
  exit 1
fi

# 전 제품을 모은 보드는 한 제품만 갱신했을 때도 다시 그린다(합계가 달라지므로).
GLOBAL="$DOCS/specs-index.md"
if [ -f "$GLOBAL" ]; then
  gbody="$(mktemp)"
  render_global > "$gbody"
  if apply_board "$GLOBAL" "$gbody"; then
    changed=$((changed+1))
    if [ "$CHECK" = 1 ]; then echo "  ✎ 갱신 필요  $GLOBAL"; else echo "  ✎ 갱신  $GLOBAL"; fi
  else
    echo "  ↷ 변경 없음  $GLOBAL"
  fi
  rm -f "$gbody"
fi

if [ "$found" -eq 0 ]; then
  echo ""
  echo "ℹ 제품 SDD 폴더가 없습니다 — 전체 보드만 갱신했습니다(OK)"
  exit 0
fi

if [ "$CHECK" = 1 ] && [ "$changed" -gt 0 ]; then
  echo ""
  echo "✖ 보드가 실제 파일 상태와 다릅니다. 다음을 실행하십시오:  bash scripts/board.sh" >&2
  exit 1
fi

echo ""
echo "✔ 보드 갱신 완료: 제품 ${found}개 중 ${changed}개 변경"
