#!/usr/bin/env bash
# HARNESS STARTER KIT · {{PROJECT_NAME}} — {{...}} 및 가드레일 문구를 프로젝트에 맞게 치환.
#
# SessionStart hook: 매 세션 시작 시 하네스 규칙을 컨텍스트로 주입한다.
# stdout은 에이전트 세션 컨텍스트에 추가된다.
set -euo pipefail

cat <<'EOF'
[하네스 컨텍스트] 작업 전 다음을 따르세요 (단일 프로젝트).
- 진입점: AGENTS.md (목차)
- 규칙 원본: .agents/rules/ (guardrails·security·api-standards 등 — 3 에이전트 공유 공통)
- SDD 기록: .agents/docs/ (product-<slug>-specs/{requirements,design,tasks}·decisions)
- 핵심 맵: ARCHITECTURE.md (모듈·레이어 단방향 의존)
- 가드레일:
  · 추측 금지 — 확인 후 단정, 미확인은 명시
  · 입력 경계 검증 — 외부/신뢰 불가 입력은 경계에서 검증·정규화
  · 권한 경계 — 요청 경계(1차) + 유스케이스 진입(2차) 이중 확인, 판단 불가 시 기본 거부
  · Secret 평문 금지
- 복잡한 작업은 .agents/docs/product-<slug>-specs/tasks/active/ 에 계획을 남긴다
- 변경은 scripts/verify.sh (스택 검증 게이트) 로 검증한다
- 사람이 읽는 문서는 docs/ (유지보수 대상). 외부 참고 코드 경로는 수정 금지(참고용)
- 참고: .kiro/steering 은 .agents/rules 를 가리키는 얇은 포인터일 뿐이다
EOF
exit 0
