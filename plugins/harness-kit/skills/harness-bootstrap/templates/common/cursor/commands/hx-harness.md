# hx-harness

> 하네스 컨텍스트를 로드한다 (작업 시작 시 실행)

<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} — 규칙 파일 경로를 프로젝트에 맞게 치환 후 사용. 단일 프로젝트. -->

이 작업을 시작하기 전에 하네스 규칙을 먼저 숙지하라. 다음 파일들을 읽어라:

1. `AGENTS.md` — 진입점 / 목차
2. `.agents/rules/*` — 규칙 원본 (guardrails·security·api-standards 등, 3 에이전트 공유 공통)
3. `.agents/docs/README.md` — SDD 기록 시스템 개요
4. `ARCHITECTURE.md` — 모듈·레이어 맵
5. `.agents/docs/decisions/core-beliefs.md` — 핵심 원칙
6. (필요 시) `.kiro/steering/*` — `.agents/rules` 를 가리키는 얇은 포인터

핵심 가드레일:
- 추측 금지: 확인 후 단정, 미확인은 명시.
- 입력 경계 검증: 외부/신뢰 불가 입력은 경계에서 검증·정규화한다.
- 권한/데이터 격리는 최종 방어선 — 애플리케이션 1차 + 저장소 레벨(예: DB 격리)에서 최종 강제. Secret 평문 금지.
- 복잡한 작업은 `.agents/docs/product-<slug>-specs/tasks/active/` 에 계획을 남긴다.
- 변경은 `scripts/verify.sh`(스택 검증 게이트)로 검증한다.

그 다음 사용자의 실제 요청을 수행하라: 이 명령 뒤에 이어서 적은 내용
