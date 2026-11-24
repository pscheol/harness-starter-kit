#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# knots-sync / kit.sh — 플러그인 스킬(kns:bootstrap · kns:update · kns:agent-add)이 부르는 입구
#
#   bash kit.sh <명령> [CLI 플래그…]     예: bash kit.sh plan --cwd <대상> --stack go --agents codex --yes --json
#   bash kit.sh --which                  cli | legacy 한 줄
#
# Node 18.3 이상이면 같은 폴더의 bin/knots-sync.js(CLI)를 인자 그대로 부른다.
# Node 가 없거나 낮으면 같은 뜻의 v1 스크립트로 내려간다(v2.0 동안만):
#   init · plan → setup.sh(plan 은 --dry-run) · update → ../update/update.sh · add → ../agent-add/add-agent.sh
# remove · outdated · doctor · repair · uninstall · list 는 CLI 에만 있다(exit 5).
# v1 스크립트가 받지 못하는 CLI 플래그(--adopt · --prune · --templates 등)는 exit 2 로 멈춘다.
# KNOTS_SYNC_NODE 로 node 실행 파일을 바꾼다(시험용). bash 3.2 와 POSIX 도구만 쓴다.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="${KNOTS_SYNC_NODE:-node}"
CLI="$KIT_DIR/bin/knots-sync.js"
HARNESSES=" claude codex cursor kiro "
MODULES=" jira-workflow multi-harness "
RETIRED=" platform-guards "   # 없앤 모듈(HK-25, 공통 층에 포함됨) — add-agent.sh 에 넘겨 같은 안내를 낸다
TOKENS=" PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH "

# Node 18.3 이상인가(util.parseArgs 가 18.3 부터 있다 — CLI 의 engines 와 같다).
node_ok() {
  local v major rest minor
  v="$("$NODE" -e 'process.stdout.write(process.versions.node)' 2>/dev/null)" || return 1
  v="${v#v}"; major="${v%%.*}"; rest="${v#*.}"; minor="${rest%%.*}"
  case "$major" in '' | *[!0-9]*) return 1 ;; esac
  case "$minor" in '' | *[!0-9]*) minor=0 ;; esac
  [ "$major" -gt 18 ] || { [ "$major" -eq 18 ] && [ "$minor" -ge 3 ]; }
}

if [ "${1:-}" = --which ]; then
  if node_ok; then echo cli; else echo legacy; fi
  exit 0
fi
if node_ok; then exec "$NODE" "$CLI" "$@"; fi

die() { echo "✖ $1" >&2; exit "${2:-2}"; }

CMD="${1:-}"
[ $# -gt 0 ] && shift
case "$CMD" in
  init | plan) SCRIPT="$KIT_DIR/setup.sh" ;;
  update)      SCRIPT="$KIT_DIR/../update/update.sh" ;;
  add)         SCRIPT="$KIT_DIR/../agent-add/add-agent.sh" ;;
  *)           die "Node 18.3 이상이 필요하다: '${CMD:-(명령 없음)}' 는 CLI(bin/knots-sync.js)에만 있다" 5 ;;
esac
cli_only() { die "Node 18.3 이상이 필요한 플래그다: $1 ($CMD 는 지금 $(basename "$SCRIPT") 로 내려간다)" 2; }
echo "Node 18.3 이상이 없어 $(basename "$SCRIPT") 로 실행한다(v2.0 동안만 — v2.1 부터는 Node 가 필요하다)"

TARGET="" JSON=0 AGENTS="" MODS=""
ARGS=() ENVS=()
[ "$CMD" = plan ] && ARGS+=(--dry-run)
while [ $# -gt 0 ]; do
  arg="$1"; shift
  case "$arg" in
    --*=*) key="${arg%%=*}"; val="${arg#*=}" ;;
    --*)   key="$arg"; val="" ;;
    *)     key=""; val="$arg" ;;
  esac
  # 값을 받는 플래그는 --k v · --k=v 둘 다 받는다(CLI parseArgs 와 같다).
  case "$key" in
    --cwd | --stack | --arch | --domain | --lang | --agents | --modules | --name | --slug | --package-ns | --protected-path | --token)
      if [ "$arg" = "$key" ]; then
        [ $# -gt 0 ] || die "$key 에 값이 없다"
        val="$1"; shift
      fi ;;
  esac
  case "$CMD:$key" in
    *:--cwd) TARGET="$val" ;;
    *:--yes | *:--quiet | *:--no-color) ;;
    *:--json) JSON=1 ;;
    *:--dry-run) ARGS+=(--dry-run) ;;
    init:--stack | init:--arch | init:--domain | init:--lang | init:--agents | init:--modules \
      | plan:--stack | plan:--arch | plan:--domain | plan:--lang | plan:--agents | plan:--modules) ARGS+=("$key=$val") ;;
    init:--force | plan:--force) ARGS+=(--force) ;;
    init:--name | plan:--name) ENVS+=("PROJECT_NAME=$val") ;;
    init:--slug | plan:--slug) ENVS+=("PROJECT_SLUG=$val") ;;
    init:--package-ns | plan:--package-ns) ENVS+=("PACKAGE_NS=$val") ;;
    init:--protected-path | plan:--protected-path) ENVS+=("PROTECTED_PATH=$val") ;;
    init:--token | plan:--token)
      case "$val" in *=*) ;; *) die "--token 은 KEY=VALUE 형식이다: '$val'" ;; esac
      case "$TOKENS" in *" ${val%%=*} "*) ENVS+=("$val") ;; *) die "모르는 토큰: ${val%%=*}" ;; esac ;;
    update:--accept-all) ARGS+=(--accept-all) ;;
    add:)
      for name in $(echo "$val" | tr ',' ' '); do
        case "$HARNESSES" in *" $name "*) AGENTS="${AGENTS:+$AGENTS,}$name"; continue ;; esac
        case "$MODULES$RETIRED" in *" $name "*) MODS="${MODS:+$MODS,}$name"; continue ;; esac
        case "$name" in aidlc | entire | notion) die "'$name' 모듈은 아직 없다 — P22 에서 제공한다" ;; esac
        die "add: 모르는 이름 $name"
      done ;;
    *:) die "$CMD: 위치 인자를 받지 않는다 $val (대상 폴더는 --cwd <폴더>)" ;;
    *:--adopt | *:--templates | *:--issue-source | *:--issue-prefix | *:--base | *:--prune | *:--forget | *:--to | *:--packs | *:--tools) cli_only "$key" ;;
    *) die "$CMD: 모르는 플래그 $key" ;;
  esac
done
if [ "$CMD" = add ]; then
  [ -n "$AGENTS$MODS" ] || die "add: 이름이 없다 (하네스:$HARNESSES· 모듈:$MODULES)"
  [ -n "$AGENTS" ] && ARGS+=("--agents=$AGENTS")
  [ -n "$MODS" ] && ARGS+=("--modules=$MODS")
fi

[ "$JSON" = 1 ] && echo "JSON 출력은 CLI 에서만 낸다 — 아래는 사람용 출력이다"
[ -n "$TARGET" ] && ARGS+=("$TARGET")
exec env ${ENVS[@]+"${ENVS[@]}"} bash "$SCRIPT" ${ARGS[@]+"${ARGS[@]}"}
