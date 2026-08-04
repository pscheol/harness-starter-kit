<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · {{PROJECT_NAME}} 치환 후 사용. 스택: Kotlin/Java + Spring Boot(JVM) 단일 프로젝트 -->

# CLAUDE.md

이 리포지터리의 에이전트 작업 가이드는 `AGENTS.md`를 단일 진입점으로 사용한다.
Claude Code는 먼저 `AGENTS.md`를 읽고 거기서 연결하는 `.agents/rules/`(규칙 원본)와 `.agents/docs/`(SDD 기록)를 따른다.
`.agents/rules/` 전체가 자동 주입된다고 가정하지 말고, 작업 유형에 맞는 규칙 파일을 직접 연다.

→ 시작: [AGENTS.md](./AGENTS.md)

## 스택 요약

Kotlin/Java + Spring Boot(JVM). 아키텍처 변형은 설치 시 선택하며 원본은 `ARCHITECTURE.md`다. 검증 게이트 `./gradlew check`. 명령·구조·버전 상세는 `ARCHITECTURE.md`·`.agents/rules/tech.md` 원본으로 위임.

## 핵심 (전체는 AGENTS.md 참고)

- 규칙 원본은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이다. 진입 파일은 목차일 뿐 상세를 중복 보관하지 않는다.
- 추측 금지: 확인 후 단정, 미확인은 명시 (`.agents/rules/guardrails.md`).
- 보안/권한 경계, API 표준, 구조·스택 규약은 `.agents/rules/*`, 아키텍처 원본은 `ARCHITECTURE.md` 참조.
- 복잡한 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 계획을 남기고, 변경은 `./gradlew check`(빌드/테스트)로 검증한다.
- exec-plan은 완료 조건을 채워도 임의로 `completed/`로 옮기지 않는다. `check/`로 옮기고(상태 `check`) **사용자 검증 후** `completed/`로 이동한다.
- 규칙이 바뀌면 `.agents/rules/` 원본을 먼저 고치고 `AGENTS.md`와 이 파일, Kiro 포인터를 동기화한다.
