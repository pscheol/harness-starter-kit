#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / lib/harness-lib.sh
#
# setup.sh · add-agent.sh · update.sh 가 공유하는 함수 모음.
# 이 파일은 실행되지 않고 source 된다.
#
# 설치 상태는 대상 리포의 두 파일에 남는다:
#   .agents/harness-kit.json  메타(킷 버전·스택·변형·에이전트·치환값) — 사람이 읽는다
#   .agents/harness-kit.lock  파일별 설치 시점 해시 — 업데이트가 '사용자가 고친 파일'을 가린다
# ─────────────────────────────────────────────────────────────────────────────

HARNESS_META_REL=".agents/harness-kit.json"
HARNESS_LOCK_REL=".agents/harness-kit.lock"
HARNESS_ALL_AGENTS="claude codex cursor kiro"
HARNESS_ALL_MODULES="jira-workflow platform-guards"
# 도메인 이름의 유효 집합. templates/domains/ 디렉터리 유무와는 별개다 —
# backend 는 이름은 유효하지만 공유 규칙이 없어 디렉터리가 존재하지 않는다.
HARNESS_ALL_DOMAINS="backend frontend"

# ── 도메인 · 스택 ───────────────────────────────────────────────────────────
#
# 도메인은 "여러 스택이 실제로 공유하는 규칙"이 있을 때만 존재하는 레이어다.
# frontend 는 web·electron 이 디자인 시스템·접근성·상태 관리 규약을 그대로 공유하므로
# 도메인 레이어가 있고, backend 는 규칙이 이미 언어별(jvm·python·go)이라 비어 있다.
# 빈 도메인은 디렉터리 자체가 없고, 호출자는 없으면 그냥 건너뛴다.
harness_domain_of() {
  case "$1" in
    jvm|python|go) echo backend ;;
    web|electron)  echo frontend ;;
    *)             echo "" ;;
  esac
}

# 스택마다 "가장 흔한 출발점"이 다르다. 백엔드는 헥사고날이지만 web 에는 그런 변형이
# 아예 없다. 기본값을 스택 단위로 두지 않으면 web 설치가 매번 --arch 를 요구한다.
harness_default_arch() {
  case "$1" in
    web)      echo nextjs-app ;;
    electron) echo main-renderer ;;
    *)        echo hexagonal ;;
  esac
}

# ── 에이전트 ────────────────────────────────────────────────────────────────

# 템플릿 상대경로가 어느 에이전트에 속하는지 판정한다. 어디에도 안 걸리면 core.
# core = 에이전트를 가리지 않는 규칙·SDD·스크립트로, 선택과 무관하게 항상 설치된다.
harness_agent_of() {
  case "$1" in
    claude/*)                       echo claude ;;
    root/CLAUDE.md)                 echo claude ;;   # AGENTS.md 로 보내는 Claude 전용 리다이렉트
    codex/*|agents-skills/*)        echo codex ;;    # .agents/skills 는 Codex 스킬 탐색 경로다
    cursor/*)                       echo cursor ;;
    kiro-steering/*|kiro-skills/*)  echo kiro ;;
    *)                              echo core ;;
  esac
}

# 템플릿 상대경로 → 대상 리포 설치 경로.
harness_remap() {
  case "$1" in
    root/*)          echo "${1#root/}" ;;
    kiro-steering/*) echo ".kiro/steering/${1#kiro-steering/}" ;;
    kiro-skills/*)   echo ".kiro/skills/${1#kiro-skills/}" ;;
    agents-rules/*)  echo ".agents/rules/${1#agents-rules/}" ;;
    agents-skills/*) echo ".agents/skills/${1#agents-skills/}" ;;
    agents-docs/*)   echo ".agents/docs/${1#agents-docs/}" ;;
    agents-root/*)   echo ".agents/${1#agents-root/}" ;;   # 규칙도 기록도 아닌 .agents 직속 설정
    scripts/*)       echo "scripts/${1#scripts/}" ;;
    claude/*)        echo ".claude/${1#claude/}" ;;
    codex/*)         echo ".codex/${1#codex/}" ;;
    cursor/*)        echo ".cursor/${1#cursor/}" ;;
    *)               echo "$1" ;;
  esac
}

# 대상 리포에 이미 있는 에이전트 디렉터리로 후보를 찾는다.
# 리포에 흔적이 없으면 실행 중인 CLI 의 환경변수를 본다(그 CLI 로 부트스트랩하는 상황).
harness_detect_agents() {
  local target="$1" found=""
  [ -d "$target/.claude" ] && found="$found claude"
  [ -d "$target/.codex" ]  && found="$found codex"
  [ -d "$target/.cursor" ] && found="$found cursor"
  [ -d "$target/.kiro" ]   && found="$found kiro"

  if [ -z "$found" ]; then
    [ -n "${CLAUDECODE:-}${CLAUDE_PROJECT_DIR:-}" ] && found="$found claude"
    [ -n "${CODEX_HOME:-}${CODEX_SANDBOX:-}" ]      && found="$found codex"
    [ -n "${CURSOR_TRACE_ID:-}" ]                   && found="$found cursor"
    [ -n "${KIRO_IDE:-}${KIRO_HOME:-}" ]            && found="$found kiro"
  fi
  echo "${found# }"
}

# 쉼표·공백 목록을 정규화하고 모르는 이름은 걸러 낸다. 'all' 은 전체로 편다.
# 결과는 "<유효 목록>|<거부 목록>" 한 줄이다 — 호출자가 커맨드 치환(서브셸)으로 부르므로
# 변수 대입으로는 거부 목록을 돌려줄 수 없다.
harness_normalize_agents() {
  local raw a out="" bad=""
  raw="$(echo "$1" | tr ',' ' ')"
  for a in $raw; do
    if [ "$a" = all ]; then out="$HARNESS_ALL_AGENTS"; bad=""; break; fi
    case " $HARNESS_ALL_AGENTS " in
      *" $a "*) case " $out " in *" $a "*) ;; *) out="$out $a" ;; esac ;;
      *)        bad="$bad $a" ;;
    esac
  done
  echo "${out# }|${bad# }"
}

harness_agent_selected() {
  case " $2 " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# ── 선택 모듈 ───────────────────────────────────────────────────────────────
#
# 모듈은 "어떤 팀은 쓰고 어떤 팀은 안 쓰는" 규약 묶음이다(이슈 트래커 연동·플랫폼 가드).
# 안 쓰는 규칙 파일은 컨텍스트만 먹고, 지켜지지 않는 규칙은 나머지 규칙의 신뢰도를 깎는다.
# 그래서 기본은 '설치 안 함'이고 명시할 때만 깔린다.
harness_normalize_modules() {
  local raw m out="" bad=""
  raw="$(echo "$1" | tr ',' ' ')"
  for m in $raw; do
    if [ "$m" = all ]; then out="$HARNESS_ALL_MODULES"; bad=""; break; fi
    if [ "$m" = none ]; then out=""; bad=""; break; fi
    case " $HARNESS_ALL_MODULES " in
      *" $m "*) case " $out " in *" $m "*) ;; *) out="$out $m" ;; esac ;;
      *)        bad="$bad $m" ;;
    esac
  done
  echo "${out# }|${bad# }"
}

# ── 해시 ────────────────────────────────────────────────────────────────────

# macOS(shasum)·Linux(sha256sum) 어느 쪽이든 같은 값을 낸다. 둘 다 없으면 '-'.
# '-' 는 어떤 해시와도 안 맞으므로 업데이트가 그 파일을 수정본으로 보고 보존한다(안전한 쪽).
harness_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
  else
    echo -
  fi
}

# ── 치환 ────────────────────────────────────────────────────────────────────

HARNESS_TOKENS="PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME
                PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH"

# 파일 안의 {{TOKEN}} 을 같은 이름의 환경변수 값으로 바꾼다(빈 값은 건드리지 않는다).
# PRODUCT_SLUG·FEATURE_NAME·EPIC_ID 가 목록에 없는 건 스펙 작성 시점에 정해지기 때문이다.
harness_subst() {
  local f="$1" tmp="${1}.harness.tmp" k v; local -a args=()
  for k in $HARNESS_TOKENS; do
    v="${!k:-}"
    [ -n "$v" ] && args+=( -e "s|{{${k}}}|${v}|g" )
  done
  [ ${#args[@]} -eq 0 ] && return 0
  LC_ALL=C sed "${args[@]}" "$f" > "$tmp" && mv "$tmp" "$f"
}

# 템플릿을 치환까지 끝낸 상태로 dest 에 만든다. 설치와 업데이트가 같은 함수를 써야
# 해시 비교가 성립한다(한쪽만 치환하면 전부 수정본으로 보인다).
harness_render() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  harness_subst "$dest"
}

# ── 메타 · lock ─────────────────────────────────────────────────────────────

# 평면 JSON 전용 조회. 값이 문자열인 키만 읽는다(agents 배열은 harness_meta_agents 로).
harness_meta_get() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  sed -n "s|.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*|\1|p" "$file" | head -1
}

# 평면 JSON 의 한 줄짜리 문자열 배열을 공백 구분 목록으로 읽는다.
# 값이 없거나 키 자체가 없으면 빈 문자열이다(구버전 메타에는 modules 가 없다).
harness_meta_list() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  sed -n "s|.*\"${key}\"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*|\1|p" "$file" \
    | head -1 | tr -d '" ' | tr ',' ' '
}

harness_meta_agents()  { harness_meta_list "$1" agents; }
harness_meta_modules() { harness_meta_list "$1" modules; }

harness_kit_version() {
  local plugin_dir="$1" pj
  for pj in "$plugin_dir/.claude-plugin/plugin.json" "$plugin_dir/.codex-plugin/plugin.json"; do
    if [ -f "$pj" ]; then
      sed -n 's|.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*|\1|p' "$pj" | head -1
      return 0
    fi
  done
  echo unknown
}

# 공백 구분 목록을 JSON 배열 본문("a", "b")으로 만든다. 비면 빈 문자열이다.
harness_json_list() {
  local x list=""
  for x in $1; do list="$list, \"$x\""; done
  echo "${list#, }"
}

# 메타를 통째로 다시 쓴다. installedAt 은 기존 값이 있으면 보존한다(최초 설치 시각이므로).
harness_write_meta() {
  local target="$1" version="$2" domain="$3" stack="$4" arch="$5" agents="$6" modules="${7:-}"
  local file="$target/$HARNESS_META_REL" installed today list mlist
  today="$(date +%F)"
  installed="$(harness_meta_get "$file" installedAt 2>/dev/null || true)"
  [ -z "$installed" ] && installed="$today"
  list="$(harness_json_list "$agents")"
  mlist="$(harness_json_list "$modules")"

  mkdir -p "$(dirname "$file")"
  cat > "$file" <<JSON
{
  "kitVersion": "$version",
  "domain": "$domain",
  "stack": "$stack",
  "arch": "$arch",
  "agents": [$list],
  "modules": [$mlist],
  "installedAt": "$installed",
  "updatedAt": "$today",
  "tokens": {
    "PROJECT_NAME": "${PROJECT_NAME:-}",
    "PROJECT_SLUG": "${PROJECT_SLUG:-}",
    "PACKAGE_NS": "${PACKAGE_NS:-}",
    "SERVICE_NAME": "${SERVICE_NAME:-}",
    "PRIMARY_LANGUAGE": "${PRIMARY_LANGUAGE:-}",
    "BUILD_TOOL": "${BUILD_TOOL:-}",
    "TEST_CMD": "${TEST_CMD:-}",
    "DOMAIN_EXAMPLE": "${DOMAIN_EXAMPLE:-}",
    "PROTECTED_PATH": "${PROTECTED_PATH:-}"
  }
}
JSON
}

# 메타의 tokens 를 환경변수로 올린다. 이미 값이 있는 변수는 덮지 않는다
# — 호출자가 명시적으로 준 값이 항상 이긴다.
harness_load_tokens() {
  local file="$1" k v
  [ -f "$file" ] || return 1
  for k in $HARNESS_TOKENS; do
    [ -n "${!k:-}" ] && continue
    v="$(harness_meta_get "$file" "$k" || true)"
    if [ -n "$v" ]; then printf -v "$k" '%s' "$v"; export "${k?}"; fi
  done
  return 0
}

harness_lock_init() {
  printf '# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path\n' > "$1"
}

harness_lock_append() {
  printf '%s\t%s\t%s\t%s\n' "$2" "$3" "$4" "$5" >> "$1"
}

harness_lock_hash() {
  local lock="$1" path="$2"
  [ -f "$lock" ] || return 1
  awk -F'\t' -v p="$path" '$1 !~ /^#/ && $4 == p { print $1; exit }' "$lock"
}

# lock 의 한 항목을 갈아 끼운다(업데이트가 교체한 파일의 해시를 새 값으로 옮길 때).
harness_lock_replace() {
  local lock="$1" path="$2" sha="$3" layer="$4" agent="$5" tmp="${1}.tmp"
  if [ -f "$lock" ]; then
    awk -F'\t' -v p="$path" '$1 ~ /^#/ || $4 != p' "$lock" > "$tmp" && mv "$tmp" "$lock"
  else
    harness_lock_init "$lock"
  fi
  harness_lock_append "$lock" "$sha" "$layer" "$agent" "$path"
}
