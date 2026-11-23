#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# harness-starter-kit / add-agent.sh
#
# 이미 하네스가 깔린 리포에 에이전트 배선을 덧붙인다.
# 스택·변형·치환값은 .agents/harness-kit.json 에서 읽으므로 다시 물어보지 않는다.
#
# 사용법:
#   bash add-agent.sh --agents=cursor,kiro [대상경로]
#
# 옵션:
#   --agents=<목록>  추가할 에이전트 (claude,codex,cursor,kiro · all)   [필수]
#   --dry-run        실제로 쓰지 않고 계획만 출력
#   --force          이미 있는 파일도 덮어쓴다 (기본: skip)
#
# core 파일은 이미 깔려 있으므로 건드리지 않는다(존재하면 skip 된다).
# 설치가 끝나면 메타의 agents 는 기존 ∪ 추가 가 된다.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_DIR="$(cd "$SCRIPT_DIR/../hx-bootstrap" && pwd)"
# shellcheck source=../hx-bootstrap/lib/harness-lib.sh
. "$BOOTSTRAP_DIR/lib/harness-lib.sh"

ADD=""
TARGET=""
PASS=()
for arg in "$@"; do
  case "$arg" in
    --agents=*)        ADD="${arg#--agents=}" ;;
    --dry-run|--force) PASS+=("$arg") ;;
    -*) echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
    *)  TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$PWD}"
[ -d "$TARGET" ] || { echo "✖ 대상 경로가 없다: $TARGET" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

META="$TARGET/$HARNESS_META_REL"
if [ ! -f "$META" ]; then
  echo "✖ 하네스가 설치되지 않은 리포다 ($HARNESS_META_REL 없음)" >&2
  echo "  먼저 hx-bootstrap 으로 초기 설치를 한다:" >&2
  echo "    bash $BOOTSTRAP_DIR/setup.sh $TARGET" >&2
  exit 1
fi

if [ -z "$ADD" ]; then
  echo "✖ --agents= 가 필요하다" >&2
  echo "  사용 가능: $HARNESS_ALL_AGENTS   (전체는 all)" >&2
  echo "  현재 설치됨: $(harness_meta_agents "$META")" >&2
  exit 2
fi

ADD_NORM="$(harness_normalize_agents "$ADD")"
ADD_OK="${ADD_NORM%%|*}"
ADD_BAD="${ADD_NORM#*|}"
if [ -n "$ADD_BAD" ]; then
  echo "✖ 알 수 없는 에이전트: $ADD_BAD" >&2
  echo "  사용 가능: $HARNESS_ALL_AGENTS   (전체는 all)" >&2
  exit 2
fi
[ -n "$ADD_OK" ] || { echo "✖ --agents= 값이 비어 있다" >&2; exit 2; }

CURRENT="$(harness_meta_agents "$META")"
STACK="$(harness_meta_get "$META" stack)"
ARCH="$(harness_meta_get "$META" arch)"
# 도메인·모듈도 그대로 되돌려줘야 한다. 안 넘기면 setup.sh 가 lock 을 다시 쓰면서
# 도메인 규칙과 모듈 파일이 목록에서 사라지고, 다음 업데이트가 그것들을 orphan 으로 본다.
DOMAIN="$(harness_meta_get "$META" domain || true)"
MODULES="$(harness_meta_modules "$META" || true)"
harness_load_tokens "$META"
export PROJECT_NAME PROJECT_SLUG PACKAGE_NS SERVICE_NAME \
       PRIMARY_LANGUAGE BUILD_TOOL TEST_CMD DOMAIN_EXAMPLE PROTECTED_PATH

# 기존과 신규의 합집합으로 돌린다. 추가분만 넘기면 setup.sh 가 lock 을 다시 쓰면서
# 기존 에이전트의 파일이 lock 에서 사라져 업데이트가 그 파일들을 놓친다.
MERGED="$CURRENT"
NEW=""
for a in $ADD_OK; do
  if harness_agent_selected "$a" "$CURRENT"; then
    echo "· $a 는 이미 설치되어 있다 — 빠진 파일이 있으면 이번에 채워진다"
  else
    NEW="$NEW $a"
  fi
  harness_agent_selected "$a" "$MERGED" || MERGED="$MERGED $a"
done
MERGED="${MERGED# }"
NEW="${NEW# }"

echo "▶ 에이전트 추가"
echo "  대상    : $TARGET"
echo "  스택    : $STACK · $ARCH${DOMAIN:+  (도메인 $DOMAIN)}"
echo "  모듈    : ${MODULES:-none}"
echo "  기존    : $CURRENT"
echo "  추가    : ${NEW:--} → 최종 $MERGED"
echo ""

HARNESS_SKIP_NEXT_STEPS=1 \
  bash "$BOOTSTRAP_DIR/setup.sh" \
    --stack="$STACK" --arch="$ARCH" --agents="$MERGED" \
    ${DOMAIN:+--domain="$DOMAIN"} --modules="${MODULES:-none}" \
    ${PASS[@]+"${PASS[@]}"} "$TARGET"

case " ${PASS[*]-} " in
  *" --dry-run "*) exit 0 ;;
esac

echo ""
echo "다음 단계:"
for a in $NEW; do
  case "$a" in
    claude) echo "  · Claude Code: .claude/settings.json 의 권한·hook 을 확인하고 세션을 다시 연다" ;;
    codex)  echo "  · Codex: .codex/config.toml·hooks.json 을 확인한다. 스킬은 \$hx-specify 로 멘션한다" ;;
    cursor) echo "  · Cursor: .cursor/commands/ 의 /hx-* 커맨드가 잡히는지 확인한다" ;;
    kiro)   echo "  · Kiro: .kiro/steering/ 은 얇은 포인터다(규칙 본문은 .agents/rules 원본)" ;;
  esac
done
echo "  · 규칙 원본(.agents/rules)은 에이전트가 공유한다 — 추가해도 중복되지 않는다"
