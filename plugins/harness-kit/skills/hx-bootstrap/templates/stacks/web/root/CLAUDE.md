# CLAUDE.md

이 리포지터리의 에이전트 작업 가이드는 `AGENTS.md`를 단일 진입점으로 사용한다.
Claude Code는 먼저 `AGENTS.md`를 읽고 거기서 연결하는 `.agents/rules/`(규칙 원본)와 `.agents/docs/`(SDD 기록)를 따른다.
`.agents/rules/` 전체가 자동 주입된다고 가정하지 말고, 작업 유형에 맞는 규칙 파일을 직접 연다.

→ 시작: [AGENTS.md](./AGENTS.md)

## 스택 요약

웹 프론트엔드 · TypeScript + React. 디렉터리 구조와 레이어 경계는 `ARCHITECTURE.md` 원본(선택한 변형에 따라 다르다). 검증 게이트 `bash scripts/verify.sh`(포맷 → lint → typecheck → 가드 → test → build). 명령·구조·버전 상세는 `ARCHITECTURE.md`·`.agents/rules/tech.md` 원본으로 위임.

## 핵심 (전체는 AGENTS.md 참고)

- 규칙 원본은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이다. 진입 파일은 목차일 뿐 상세를 중복 보관하지 않는다.
- 추측 금지: 확인 후 단정, 미확인은 명시 (`.agents/rules/guardrails.md`).
- **경계 강제는 타입 strict + ESLint 규칙 두 가지뿐**이다. 규칙에 등록하지 않은 레이어 경계는 문서로만 존재한다.
- 외부 응답은 스키마로 파싱해 좁힌다. `as` 단정·`any` 수용 금지 (`.agents/rules/api-standards.md`).
- 상태는 종류가 사는 곳을 정한다 — 서버·클라이언트·URL·폼. 서버 상태를 스토어에 복사하지 않는다 (`.agents/rules/ui-state.md`).
- 색·간격·타이포·모션 값을 지어내지 않는다. 토큰에서 고른다 (`.agents/rules/design-system.md`).
- 시맨틱 요소 우선, 키보드 도달 가능, 이름·역할·상태 제공 (`.agents/rules/accessibility.md`).
- 성능은 예산과 측정으로 다룬다 (`.agents/rules/frontend-performance.md`).
- 복잡한 작업은 `.agents/docs/<slug>-specs/tasks/active/`에 계획을 남기고, 변경은 `bash scripts/verify.sh`로 검증한다.
- exec-plan은 완료 조건을 채워도 임의로 `completed/`로 옮기지 않는다. `check/`로 옮기고(상태 `check`) **사용자 검증 후** `completed/`로 이동한다.
- 규칙이 바뀌면 `.agents/rules/` 원본을 먼저 고치고 `AGENTS.md`와 이 파일, Kiro 포인터를 동기화한다.
