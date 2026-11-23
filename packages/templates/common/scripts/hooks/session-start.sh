#!/usr/bin/env bash
# 세션 시작 시 하네스 컨텍스트를 에이전트에 붙인다. Claude Code·Codex·Kiro 가 같은 파일을 부른다.
#
# stdout 이 세션 컨텍스트에 붙으므로 짧게 둔다. 첫 글자를 [ 나 { 로 두지 않는다 — Codex 가 JSON 으로 읽다 실패하면 컨텍스트를 버린다. 규칙 본문을 여기 쏟으면 매 세션 토큰을 먹으면서도
# 정작 원본(.agents/rules/)은 읽히지 않는다. 단위 고유 안내는 .agents/session-context.md 에 둔다.
set -euo pipefail
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cat <<'EOF'
하네스 컨텍스트 — {{PROJECT_NAME}}: 이 폴더가 하네스 루트다. 메인·도메인 리포 안이면 상위 문서보다 이 폴더 문서가 기준이다.
- 진입점: AGENTS.md · 아키텍처: ARCHITECTURE.md · 규칙 원본: .agents/rules/ (모든 변경 전 guardrails.md)
- 작업 전 필수: .agents/rules/code-maintenance.md · .agents/rules/session-collaboration.md 를 읽는다. 패키지 책임·읽히는 이름·정책 함수·mapper·OpenAPI 문서를 적용한다
- 새 SDD: .agents/docs/<slug>-specs/issues/<N-type-name>/{requirements.md,design.md,tasks/active.md} — 이슈 하나에 명세 하나. 진행 중 기존 stage별 경로는 이동하지 않는다
- 협업: 실제 세션 ID와 배정 파일만 scripts/session-coordination.py register --files 로 명시한다. 다른 세션 변경은 되돌리지 않고 공지 확인을 사용자 승인으로 해석하지 않는다
- 가드레일: 추측 금지(확인 후 단정, 미확인은 명시) · 외부 입력은 경계에서 검증 · Secret 평문 금지
- 공개 책임 하나를 파일 하나에 둔다 · 레이어 자리를 지킨다(.agents/rules/structure.md · code-maintenance.md)
- 글: 비유·상투구 대신 실제로 일어나는 일을 쓴다(.agents/rules/writing-style.md §6)
- 검증: bash scripts/verify.sh (기본 changed). 변경 파일·세션의 단위 테스트를 먼저 실행하고 전체 검증은 bash scripts/verify.sh --full 로 선택한다. changed·fast 통과는 full 통과가 아니다
EOF
if [ -f "$HARNESS_ROOT/.agents/session-context.md" ]; then
  cat "$HARNESS_ROOT/.agents/session-context.md"
fi
if [ -f "$HARNESS_ROOT/scripts/hooks/session-context.py" ]; then
  python3 "$HARNESS_ROOT/scripts/hooks/session-context.py" --root "$HARNESS_ROOT" --event session-start
fi
