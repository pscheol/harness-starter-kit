#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / install-kiro.sh
#
# 플러그인 마켓플레이스가 없는 Kiro 에 킷 스킬을 전역 설치합니다.
#
#   Claude Code · Codex → 마켓플레이스로 설치하므로 이 스크립트가 필요 없습니다:
#       /plugin marketplace add <킷_경로>  →  /plugin install harness-kit@harness-starter-kit
#       codex plugin marketplace add <킷_경로>  →  codex plugin add harness-kit@harness-starter-kit
#   Kiro               → 이 스크립트를 사용하십시오.
#
# 무엇이 설치되나 (리포 없이도 동작하도록 전부 복사합니다 — 포인터가 아닙니다):
#   ~/.kiro/skills/<스킬>/     스킬 디렉터리를 통째로 복사합니다. SKILL.md 는 원본 그대로이며
#                              hx-bootstrap 은 setup.sh · lib/ · templates/ 까지 함께 갑니다.
#
#   Kiro 스킬 규약은 <홈>/skills/<스킬명>/SKILL.md 입니다. 프로젝트 레벨(.kiro/skills/)과 같은
#   구조이며, 한 겹 더 감싸면(<홈>/skills/harness-kit/skills/…) 인식되지 않습니다.
#
# 사용법:
#   bash install-kiro.sh                      # ~/.kiro/skills 에 설치합니다
#   bash install-kiro.sh --dry-run            # 계획만 출력합니다
#   bash install-kiro.sh --force              # 기존 스킬도 덮어씁니다
#   bash install-kiro.sh --uninstall          # 이 스크립트가 설치한 것만 제거합니다
#   bash install-kiro.sh --home=/path/.kiro   # 대상 홈을 지정합니다 (환경변수 KIRO_HOME 도 가능)
#
# 설치 상태는 <홈>/.harness-kit-manifest.json 에 남습니다. 제거할 때는 이 기록에 적힌
# 디렉터리만 지우므로 같은 폴더의 다른 스킬은 건드리지 않습니다.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$KIT_DIR/plugins/harness-kit/skills"
PLUGIN_JSON="$KIT_DIR/plugins/harness-kit/.claude-plugin/plugin.json"
MANIFEST_NAME=".harness-kit-manifest.json"

DRY_RUN=0
FORCE=0
UNINSTALL=0
KIRO_HOME="${KIRO_HOME:-$HOME/.kiro}"

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --force)     FORCE=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --home=*)    KIRO_HOME="${arg#--home=}" ;;
    -h|--help)   sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           echo "알 수 없는 옵션입니다: $arg" >&2; exit 2 ;;
  esac
done

[ -d "$SKILLS_DIR" ] || { echo "✖ 스킬 디렉터리를 찾을 수 없습니다: $SKILLS_DIR" >&2; exit 1; }

MANIFEST="$KIRO_HOME/$MANIFEST_NAME"
DEST_ROOT="$KIRO_HOME/skills"

KIT_VERSION="$(grep -m1 '"version"' "$PLUGIN_JSON" 2>/dev/null | sed 's/.*"version"[^"]*"\([^"]*\)".*/\1/')"
KIT_VERSION="${KIT_VERSION:-unknown}"

# ── 제거 ─────────────────────────────────────────────────────────────────────
# 매니페스트에 적힌 디렉터리만 지운다. 기록이 없으면 아무것도 지우지 않는다 —
# skills/ 를 패턴으로 쓸어내면 다른 도구가 깐 스킬까지 날아간다.
if [ "$UNINSTALL" = 1 ]; then
  if [ ! -f "$MANIFEST" ]; then
    echo "✖ 설치 기록이 없습니다: $MANIFEST" >&2
    exit 1
  fi
  echo "▶ 제거 — $KIRO_HOME"
  n=0
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    d="$KIRO_HOME/$rel"
    if [ -d "$d" ]; then
      echo "  ✂ remove  $rel/  ($(find "$d" -type f | wc -l | tr -d ' ')개 파일)"
      [ "$DRY_RUN" != 1 ] && rm -rf "${KIRO_HOME:?}/$rel"
      n=$((n+1))
    else
      echo "  ↷ 이미 없음  $rel"
    fi
  done < <(sed -n 's/^ *"\(skills\/[^"]*\)".*/\1/p' "$MANIFEST")
  [ "$DRY_RUN" != 1 ] && rm -f "$MANIFEST"
  echo ""
  # ${n} 중괄호 필수 — 뒤에 한글이 붙으면 bash 가 "n개" 를 변수명으로 파싱한다.
  echo "✔ 제거 완료: 스킬 ${n}개 $([ $DRY_RUN = 1 ] && echo '(dry-run — 실제 변경 없음)')"
  exit 0
fi

# ── 설치 ─────────────────────────────────────────────────────────────────────
echo "▶ 킷 스킬 설치 (Kiro)"
echo "  킷    : $KIT_DIR  (v$KIT_VERSION)"
echo "  대상  : $DEST_ROOT"
echo "  모드  : $([ $DRY_RUN = 1 ] && echo dry-run || echo write)$([ $FORCE = 1 ] && echo ' +force')"
echo ""

[ "$DRY_RUN" != 1 ] && mkdir -p "$DEST_ROOT"

written=0
skipped=0
total_files=0
installed_list=""

for dir in "$SKILLS_DIR"/*/; do
  skill="$(basename "$dir")"
  [ -f "${dir}SKILL.md" ] || continue

  rel="skills/$skill"
  dest="$KIRO_HOME/$rel"
  count="$(find "$dir" -type f ! -name '.DS_Store' | wc -l | tr -d ' ')"

  if [ -d "$dest" ] && [ "$FORCE" != 1 ]; then
    echo "  ↷ skip (존재)  $rel/"
    skipped=$((skipped+1))
    installed_list="$installed_list$rel"$'\n'
    continue
  fi

  echo "  ✎ install      $rel/  (${count}개 파일)"
  if [ "$DRY_RUN" != 1 ]; then
    rm -rf "$dest"
    mkdir -p "$dest"
    # cp -R 는 플랫폼마다 트레일링 슬래시 해석이 달라 tar 로 옮긴다.
    (cd "$dir" && tar cf - .) | (cd "$dest" && tar xf -)
    find "$dest" -name '.DS_Store' -delete 2>/dev/null || true
    find "$dest" -name '*.sh' -exec chmod +x {} \;
  fi
  written=$((written+1))
  total_files=$((total_files + count))
  installed_list="$installed_list$rel"$'\n'
done

# 매니페스트. 제거할 때 이 기록만 따른다.
if [ "$DRY_RUN" != 1 ]; then
  {
    echo "{"
    echo "  \"kitVersion\": \"$KIT_VERSION\","
    echo "  \"kitPath\": \"$KIT_DIR\","
    echo "  \"agent\": \"kiro\","
    echo "  \"installedAt\": \"$(date +%F)\","
    echo "  \"managedDirs\": ["
    printf '%s' "$installed_list" | sed '/^$/d' | sed 's/.*/    "&",/' | sed '$ s/,$//'
    echo "  ]"
    echo "}"
  } > "$MANIFEST"
fi

echo ""
echo "✔ 완료: 스킬 ${written}개 설치, ${skipped}개 skip · 파일 ${total_files}개 $([ $DRY_RUN = 1 ] && echo '(dry-run — 실제 변경 없음)')"
[ "$DRY_RUN" != 1 ] && echo "  설치 기록: $MANIFEST"
echo ""
echo "다음 단계:"
echo "  1) kiro-cli 를 다시 켜시면 /hx-bootstrap · /hx-jvm-setup … 이 잡힙니다(세션 시작 때 로드됩니다)"
echo "  2) JVM 리포라면 /hx-jvm-setup 이 아키텍처 8종 선택을 안내합니다"
echo "  3) 스크립트를 직접 실행하셔도 됩니다(리포 없이 이 설치본만으로 동작합니다):"
echo "       bash $DEST_ROOT/hx-bootstrap/setup.sh --agents=kiro --dry-run <대상_리포>"
echo ""
echo "  · 킷을 갱신하셨으면 다시 실행해 주십시오:  bash install-kiro.sh --force"
echo "  · 제거하시려면:  bash install-kiro.sh --uninstall"
