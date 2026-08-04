---
inclusion: always
---
<!-- HARNESS TEMPLATE ({{PROJECT_NAME}}) · Kiro 얇은 포인터. 규칙 본문 금지. -->
# 리포 구조 · 패키지 책임 (포인터)

정본: `.agents/rules/structure.md` — Claude·Codex·Kiro 공통. 새 파이프라인/에이전트 착수 전 연다. 아키텍처 정본은 `ARCHITECTURE.md`.

요약:
- src 레이아웃 AI 서비스: `src/{{PACKAGE_NS}}/{api,pipelines,agents,llm,retrieval,prompts,domain,observability,common,core,bootstrap}` + 리포 루트 `evaluation/`.
- 의존 방향은 **import-linter 계약**이 강제한다: `api→pipelines→agents→(llm : retrieval)→domain`. `llm`과 `retrieval`은 형제라 서로 import하지 않는다.
- **프로바이더 SDK는 `llm/` 안에서만** import한다(계약이 차단). `domain`·`prompts`는 프로바이더·프레임워크 무의존.
- **프롬프트는 버전 관리 자산**이다: `prompts/<도메인>/<이름>/v<N>.md`, 기존 버전 수정 금지·새 버전 생성. 로그에 `prompt_id`·`prompt_version`·`model` 기록.
- **모든 모델 호출은 `observability/` 계측 래퍼를 통과**(토큰·비용·지연). 요청당 토큰·턴 예산과 타임아웃 필수.
- 출력은 Pydantic 스키마로 검증하고 도메인 규칙으로 재검증한다. **출력 문자열 스냅샷 테스트 금지** — 속성 기반 검증을 쓴다.
- **프롬프트·모델·검색 설정 변경은 eval 회귀 게이트 통과**가 필요하다(`evaluation/`, 기본은 nightly·`EVAL_ON_VERIFY=1`로 스모크).
- 승격/강등 신호와 전환 가이드는 `ARCHITECTURE.md` §0·§12.
