#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / update.sh
#
# 설치된 하네스를 킷의 현재 버전으로 올린다.
# 스택·변형·에이전트·치환값은 .agents/harness-kit.json 에서 읽는다.
#
# 사용법:
#   bash update.sh [--dry-run] [--accept-all] [대상경로]
#
# 옵션:
#   --dry-run     실제로 쓰지 않고 판정 결과만 출력
#   --accept-all  사용자가 고친 파일도 새 버전으로 덮는다(원본은 .bak 로 남긴다)
#
# 사용자가 고친 파일을 지키는 방법:
#   설치 시점 해시가 .agents/harness-kit.lock 에 있다. 지금 파일의 해시가 그것과
#   같으면 손대지 않은 것이므로 조용히 교체하고, 다르면 사람이 고친 것이므로
#   덮지 않고 새 버전을 <경로>.new 로 옆에 둔다.
#
# 판정 5종:
#   new       킷에는 있고 리포에 없다           → 설치한다
#   same      내용이 이미 같다                   → 건너뛴다(lock 해시만 최신화)
#   update    리포 파일 = 설치 당시 그대로       → 새 버전으로 교체한다
#   conflict  리포 파일이 수정됐다               → .new 로 저장하고 원본은 둔다
#   orphan    lock 에는 있는데 킷에서 사라졌다    → 보고만 한다(지우지 않는다)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_DIR="$(cd "$SCRIPT_DIR/../hx-bootstrap" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATES="$BOOTSTRAP_DIR/templates"
# shellcheck source=../hx-bootstrap/lib/harness-lib.sh
. "$BOOTSTRAP_DIR/lib/harness-lib.sh"

DRY_RUN=0
ACCEPT_ALL=0
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --accept-all) ACCEPT_ALL=1 ;;
    -*) echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
    *)  TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$PWD}"
[ -d "$TARGET" ] || { echo "✖ 대상 경로가 없다: $TARGET" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

META="$TARGET/$HARNESS_META_REL"
LOCK="$TARGET/$HARNESS_LOCK_REL"
if [ ! -f "$META" ]; then
  echo "✖ 하네스가 설치되지 않은 리포다 ($HARNESS_META_REL 없음)" >&2
  echo "  구버전 킷으로 깔린 리포라면 상태 파일이 없다. 아래로 상태를 만든 뒤 다시 실행한다:" >&2
  echo "    bash $BOOTSTRAP_DIR/setup.sh --stack=<스택> --arch=<변형> $TARGET" >&2
  echo "  (기존 파일은 skip 되고 상태 파일만 생긴다)" >&2
  exit 1
fi

FROM_VERSION="$(harness_meta_get "$META" kitVersion || echo unknown)"
TO_VERSION="$(harness_kit_version "$PLUGIN_DIR")"
STACK="$(harness_meta_get "$META" stack)"
ARCH="$(harness_meta_get "$META" arch)"
AGENTS_SEL="$(harness_meta_agents "$META")"
# domain·modules 는 나중에 생긴 필드다. 구버전 메타에는 없으므로 스택에서 유도하고,
# 모듈은 없는 것으로 본다(설치된 적 없으니 그게 맞다).
DOMAIN="$(harness_meta_get "$META" domain || true)"
[ -z "$DOMAIN" ] && DOMAIN="$(harness_domain_of "$STACK")"
MODULES_SEL="$(harness_meta_modules "$META" || true)"
harness_load_tokens "$META"

COMMON_DIR="$TEMPLATES/common"
DOMAIN_DIR="${DOMAIN:+$TEMPLATES/domains/$DOMAIN}"
STACK_DIR="$TEMPLATES/stacks/$STACK"
ARCH_DIR="$STACK_DIR/arch/$ARCH"
for d in "$COMMON_DIR" "$STACK_DIR" "$ARCH_DIR"; do
  [ -d "$d" ] || { echo "✖ 템플릿을 찾을 수 없다: $d" >&2; exit 1; }
done
# 도메인 공유 규칙이 없는 스택(backend)은 디렉터리 자체가 없다 — 정상이므로 건너뛴다.
[ -n "$DOMAIN_DIR" ] && [ ! -d "$DOMAIN_DIR" ] && DOMAIN_DIR=""
for m in $MODULES_SEL; do
  [ -d "$TEMPLATES/optional/$m" ] || {
    echo "⚠ 메타에 있는 모듈의 템플릿이 킷에서 사라졌다: $m (이번 실행에서 건너뛴다)" >&2
    MODULES_SEL="$(echo " $MODULES_SEL " | sed "s| $m | |g" | tr -s ' ' | sed 's|^ ||;s| $||')"
  }
done

echo "▶ 하네스 업데이트"
echo "  대상      : $TARGET"
echo "  킷 버전   : $FROM_VERSION → $TO_VERSION"
echo "  도메인    : ${DOMAIN:-—}"
echo "  스택      : $STACK · $ARCH"
echo "  에이전트  : $AGENTS_SEL"
echo "  선택 모듈 : ${MODULES_SEL:-none}"
echo "  모드      : $([ $DRY_RUN = 1 ] && echo dry-run || echo write)$([ $ACCEPT_ALL = 1 ] && echo ' +accept-all')"
echo ""

# 표시 줄 없는 lock(v1.0.8 이하)은 설치 전부터 있던 파일을 그 파일 해시로 적었다. 그 lock 에서는
# "지금 해시 = lock 해시"가 킷이 쓴 판인지 사람 파일인지 가리지 못하므로 덮지 않고 .new 를 쓴다(HK-12 R12.6).
LOCK_MARKED=0
harness_lock_marked "$LOCK" && LOCK_MARKED=1

NEW_LOCK="$(mktemp)"
SEEN="$(mktemp)"
RENDER="$(mktemp -d)"
PLAN_DIR="$(mktemp -d)"
harness_lock_init "$NEW_LOCK"
cleanup() { rm -rf "$NEW_LOCK" "$SEEN" "$RENDER" "$PLAN_DIR"; }
trap cleanup EXIT

n_new=0; n_same=0; n_update=0; n_conflict=0; n_orphan=0
conflicts=""

# 한 파일을 판정하고 그대로 처리한다.
#
# 처리 흐름:
#  1. 새 내용을 임시 위치에 렌더 — 치환까지 끝나야 리포 파일과 같은 기준으로 비교된다.
#  2. 해시 셋을 견준다 — 새 내용 · 지금 리포 · lock 에 남은 설치 당시.
#  3. 판정대로 쓴다 — 수정본을 덮지 않고 .new 를 남기는 것이 이 스크립트의 계약이다.
#  4. lock 에는 '킷이 준 원본'의 해시를 적는다(리포의 현재 내용이 아니다). conflict 는
#     옛 원본 해시를 그대로 물려주어야 다음 실행에서도 수정본으로 인식된다.
process_file() {
  local src="$1" dest_rel="$2" layer="$3" owner="$4" dest tmp new_sha cur_sha lock_sha

  dest="$TARGET/$dest_rel"
  echo "$dest_rel" >> "$SEEN"

  tmp="$RENDER/$dest_rel"
  harness_render "$src" "$tmp"
  new_sha="$(harness_sha256 "$tmp")"

  if [ ! -e "$dest" ]; then
    echo "  new       $dest_rel"
    n_new=$((n_new+1))
    if [ "$DRY_RUN" != 1 ]; then
      mkdir -p "$(dirname "$dest")"
      cp "$tmp" "$dest"
      harness_is_executable "$dest_rel" && chmod +x "$dest"
    fi
    harness_lock_append "$NEW_LOCK" "$new_sha" "$layer" "$owner" "$dest_rel"
    return 0
  fi

  cur_sha="$(harness_sha256 "$dest")"
  lock_sha="$(harness_lock_hash "$LOCK" "$dest_rel" || true)"

  if [ "$cur_sha" = "$new_sha" ]; then
    n_same=$((n_same+1))
    harness_lock_append "$NEW_LOCK" "$new_sha" "$layer" "$owner" "$dest_rel"
    return 0
  fi

  # lock 에 기록이 없으면(구버전 설치·수동 편집) 수정 여부를 확인할 길이 없다.
  # 사용자 작업을 지우는 쪽보다 conflict 로 보고하는 쪽이 안전하다.
  local unsure=""
  if [ -n "$lock_sha" ] && [ "$lock_sha" = "$cur_sha" ] && [ "$LOCK_MARKED" != 1 ]; then
    unsure="   (v1 lock — 미리 있던 파일인지 가릴 수 없다)"
    lock_sha=""
  fi
  if [ -n "$lock_sha" ] && [ "$lock_sha" = "$cur_sha" ]; then
    echo "  update    $dest_rel"
    n_update=$((n_update+1))
    if [ "$DRY_RUN" != 1 ]; then
      cp "$tmp" "$dest"
      harness_is_executable "$dest_rel" && chmod +x "$dest"
    fi
    harness_lock_append "$NEW_LOCK" "$new_sha" "$layer" "$owner" "$dest_rel"
    return 0
  fi

  if [ "$ACCEPT_ALL" = 1 ]; then
    echo "  overwrite $dest_rel   (수정본 → $dest_rel.bak)$unsure"
    n_update=$((n_update+1))
    if [ "$DRY_RUN" != 1 ]; then
      cp "$dest" "$dest.bak"
      cp "$tmp" "$dest"
      harness_is_executable "$dest_rel" && chmod +x "$dest"
    fi
    harness_lock_append "$NEW_LOCK" "$new_sha" "$layer" "$owner" "$dest_rel"
    return 0
  fi

  echo "  conflict  $dest_rel   → $dest_rel.new$unsure"
  n_conflict=$((n_conflict+1))
  conflicts="$conflicts $dest_rel"
  [ "$DRY_RUN" != 1 ] && cp "$tmp" "$dest.new"
  # 원본 해시를 그대로 물려준다. 여기에 수정본 해시를 적으면 다음 업데이트가
  # 그것을 '설치 당시 원본'으로 읽어 사용자 수정본을 덮어쓴다.
  # 원본을 모르면(lock 기록 없음) '-' 를 넣어 계속 수정본으로 취급되게 둔다.
  # 사용자가 .new 를 받아들이면 다음 실행의 cur==new 검사에서 same 으로 잡힌다.
  harness_lock_append "$NEW_LOCK" "${lock_sha:--}" "$layer" "$owner" "$dest_rel"
}

# 설치와 같은 순서·같은 라벨로 돈다(setup.sh 와 같은 harness_layer_roots). 같은 설치 경로가 두 레이어에 있으면
# 뒤 레이어 판 하나만 판정한다 — setup.sh 첫 설치가 깐 판과 같아야 다음 실행에서 conflict 가 생기지 않는다(HK-10 R10.1).
harness_candidates "$AGENTS_SEL" < <(harness_layer_roots "$TEMPLATES" "$DOMAIN_DIR" "$DOMAIN" "$STACK" "$ARCH" "$MODULES_SEL") > "$PLAN_DIR/candidates"
harness_last_wins "$PLAN_DIR/candidates" "$PLAN_DIR/winners" "$PLAN_DIR/losers"
while IFS=$'\t' read -r label owner src dest_rel; do
  process_file "$src" "$dest_rel" "$label" "$owner"
done < "$PLAN_DIR/winners"

# 이번 킷에 더는 없는 파일. 사용자가 계속 쓰고 있을 수 있어 지우지 않고 알리기만 한다.
if [ -f "$LOCK" ]; then
  while IFS=$'\t' read -r sha layer _owner path; do
    case "$sha" in '#'*|'') continue ;; esac
    [ -n "$path" ] || continue
    # 배치 줄과 하네스 폴더의 옛 포인터는 아래 배치 단계(projection.py)가 판정한다(HK-13).
    case "$layer" in mirror|render|merge|merge+) continue ;; esac
    case "$path" in .claude/*|.codex/*|.cursor/*|.kiro/*|CLAUDE.md) continue ;; esac
    grep -qxF "$path" "$SEEN" && continue
    echo "  orphan    $path   (킷에서 빠짐 — 그대로 둔다)"
    n_orphan=$((n_orphan+1))
  done < "$LOCK"
fi

# 하네스 배치(HK-13): copy 판정 뒤의 원본으로 복사본 · 생성물 · 병합을 다시 만들고 새 lock 에 배치 줄을 덧붙인다.
# 사람이 고친 생성물은 덮지 않고 .new 를 쓴다. v1 포인터는 복사본 · 생성물로 바뀐다.
project_flags=()
[ "$ACCEPT_ALL" = 1 ] && project_flags+=(--accept-all)
[ "$DRY_RUN" = 1 ] && project_flags+=(--dry-run)
harness_project update "$TARGET" "$NEW_LOCK" "$LOCK" "$AGENTS_SEL" ${project_flags[@]+"${project_flags[@]}"}

if [ "$DRY_RUN" != 1 ]; then
  cp "$NEW_LOCK" "$LOCK"
  harness_write_meta "$TARGET" "$TO_VERSION" "$DOMAIN" "$STACK" "$ARCH" "$AGENTS_SEL" "$MODULES_SEL"
  [ -f "$TARGET/.agents/harness.json" ] || harness_write_manifest "$TARGET" "$STACK" "$AGENTS_SEL"
fi

# 보드 형식이 바뀐 킷으로 올렸으면 보드를 한 번 다시 만든다. 그러지 않으면 업데이트 직후 fast 검증이
# 보드 차이로 실패한다. 보드 코드가 conflict 면(사람이 고친 판) 실행하지 않는다.
rebuild_board() {
  local c
  [ "$DRY_RUN" != 1 ] && [ -f "$TARGET/scripts/board.sh" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  for c in $conflicts; do
    case "$c" in scripts/board.sh|scripts/sdd-layout.py|scripts/harness/*) return 0 ;; esac
  done
  (cd "$TARGET" && bash scripts/board.sh --check >/dev/null 2>&1) && return 0
  if (cd "$TARGET" && bash scripts/board.sh >/dev/null 2>&1); then
    echo "  ✎ SDD 보드를 새 형식으로 다시 만들었다: .agents/docs/specs-index.md"
  else
    echo "  ⚠ SDD 보드를 다시 만들지 못했다 — 'bash scripts/board.sh' 의 오류를 고친 뒤 다시 실행한다" >&2
  fi
}
rebuild_board

echo ""
echo "✔ new=$n_new  update=$n_update  same=$n_same  conflict=$n_conflict  orphan=$n_orphan $([ $DRY_RUN = 1 ] && echo '(dry-run — 실제 변경 없음)')"

if [ "$n_conflict" -gt 0 ]; then
  echo ""
  echo "충돌 — 고친 파일이라 덮지 않았다. 새 버전은 .new 에 있다:"
  for c in $conflicts; do
    echo "  diff \"$TARGET/$c\" \"$TARGET/$c.new\""
  done
  echo ""
  echo "  병합했으면 .new 를 지운다. 새 버전을 그대로 쓰려면 mv 로 덮는다."
  echo "  전부 새 버전으로 밀어도 되면:  bash update.sh --accept-all $TARGET"
fi

if [ "$DRY_RUN" != 1 ]; then
  echo ""
  echo "다음 단계:"
  echo "  · bash scripts/verify.sh 로 게이트가 여전히 통과하는지 확인한다"
  echo "  · grep -rn '{{' . --include='*.md' | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG' 로 새 토큰이 들어왔는지 본다"
fi
