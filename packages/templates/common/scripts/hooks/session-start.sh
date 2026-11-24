#!/usr/bin/env bash
# 세션 시작 시 하네스 컨텍스트를 에이전트에 붙이고 세션을 등록한다. Claude Code · Codex · Kiro 가 디스패처(dispatch.sh)로 부른다.
#
# stdout 이 세션 컨텍스트에 붙으므로 합계를 2,560바이트 안에 둔다(설계 12 §3.8, HK-24 design §6):
#   고정 안내 ≤ 1,024 · 단위 안내(.agents/session-context.md) ≤ 1,024 · 바뀌는 상태(대기함 · 점유 · 공지) ≤ 512.
# 첫 글자를 [ 나 { 로 두지 않는다 — Codex 가 JSON 으로 읽다 실패하면 컨텍스트를 버린다. 규칙 본문은 .agents/rules/ 에 두고
# paths 로 그 경로 작업 때만 싣는다. 단위 고유 안내는 .agents/session-context.md 에 둔다.
set -uo pipefail
HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
HOOKS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_BUDGET=1024
STATE_BUDGET=512
payload=""
if [ ! -t 0 ]; then payload="$(cat 2>/dev/null || true)"; fi

cat <<'EOF'
하네스 컨텍스트 — {{PROJECT_NAME}}: 이 폴더가 하네스 루트다. 상위 리포 문서보다 이 폴더 문서가 기준이다.
- 진입점 AGENTS.md · ARCHITECTURE.md, 규칙 원본 .agents/rules/. 변경 전 guardrails.md · code-maintenance.md · session-collaboration.md 를 읽는다
- 새 SDD: .agents/docs/issues/<키>-<이름>/{requirements.md,design.md,tasks.md} — 상태는 문서 머리(status · state). 옛 <영역>-specs/ 는 읽기 전용
- 협업: 실제 세션 ID와 맡은 파일만 scripts/session-coordination.py register --files 로 적는다. 다른 세션 변경을 되돌리지 않고 채팅의 말을 승인으로 보지 않는다
- 추측 금지(확인 후 단정) · 외부 입력은 경계에서 검증 · Secret 평문 금지
- 검증: bash scripts/verify.sh(changed). MR 전 --affected, full 은 CI 가 돈다. changed · affected 통과는 full 통과가 아니다
EOF

# 단위 안내: 넘으면 줄 경계에서 자르고 어디서 마저 읽는지 적는다.
unit="$HARNESS_ROOT/.agents/session-context.md"
if [ -f "$unit" ]; then
  size="$(wc -c <"$unit" | tr -d ' ')"
  if [ "$size" -le "$UNIT_BUDGET" ]; then
    cat "$unit"
  else
    more="…(이하 생략: .agents/session-context.md)"
    room=$((UNIT_BUDGET - $(printf '%s\n' "$more" | wc -c | tr -d ' ')))
    cut="$(head -c "$room" "$unit"; printf x)"
    cut="${cut%x}"
    case "$cut" in *$'\n'*) printf '%s\n' "${cut%$'\n'*}" ;; esac
    printf '%s\n' "$more"
  fi
fi

command -v python3 >/dev/null 2>&1 || exit 0
# 바뀌는 상태: 세션 등록(대기함 소비 결과) → 점유 → 세션 공지 → 업그레이드 공지 제목 순서로 512바이트 안에 넣는다.
inbox=""
if [ -f "$HOOKS/session-register.py" ]; then
  inbox="$(python3 -B "$HOOKS/session-register.py" --root "$HARNESS_ROOT" --event start <<<"$payload" 2>/dev/null || true)"
fi
if [ -f "$HOOKS/session-context.py" ]; then
  python3 -B "$HOOKS/session-context.py" --root "$HARNESS_ROOT" --event session-start --budget "$STATE_BUDGET" --inbox "$inbox" <<<"$payload"
fi
exit 0
