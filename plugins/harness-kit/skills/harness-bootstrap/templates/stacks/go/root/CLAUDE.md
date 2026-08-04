# CLAUDE.md

이 리포지터리의 에이전트 작업 가이드는 `AGENTS.md`를 단일 진입점으로 사용한다.
Claude Code는 먼저 `AGENTS.md`를 읽고 거기서 연결하는 `.agents/rules/`(규칙 원본)와 `.agents/docs/`(SDD 기록)를 따른다.
`.agents/rules/` 전체가 자동 주입된다고 가정하지 말고, 작업 유형에 맞는 규칙 파일을 직접 연다.

→ 시작: [AGENTS.md](./AGENTS.md)

## 스택 요약

Go 백엔드 · 표준 Go 레이아웃(cmd/internal/pkg). `internal/` 내부 구조는 `ARCHITECTURE.md` 원본(선택한 변형에 따라 다르다). 검증 게이트 `bash scripts/verify.sh`(fmt → build → vet → golangci-lint → test -race). 명령·구조·버전 상세는 `ARCHITECTURE.md`·`.agents/rules/tech.md` 원본으로 위임.

## 핵심 (전체는 AGENTS.md 참고)

- 규칙 원본은 `.agents/rules/`, 설계와 기록은 `.agents/docs/`가 기준이다. 진입 파일은 목차일 뿐 상세를 중복 보관하지 않는다.
- 추측 금지: 확인 후 단정, 미확인은 명시 (`.agents/rules/guardrails.md`).
- 보안/권한 경계, API 표준, 구조·스택 규약은 `.agents/rules/*`, 아키텍처 원본은 `ARCHITECTURE.md` 참조.
- 레이어 의존은 `internal/` 가시성·import 사이클(컴파일러) + depguard(린터)가 강제한다. 인터페이스는 소비자(app)가 선언한다.
- 에러는 값으로 전파(`%w` 래핑·`errors.Is/As` 판별), `ctx`는 모든 I/O에 전파, 고루틴에는 소유자와 종료 조건을 둔다.
- 복잡한 작업은 `.agents/docs/product-<slug>-specs/tasks/active/`에 계획을 남기고, 변경은 `bash scripts/verify.sh`로 검증한다.
- exec-plan은 완료 조건을 채워도 임의로 `completed/`로 옮기지 않는다. `check/`로 옮기고(상태 `check`) **사용자 검증 후** `completed/`로 이동한다.
- 규칙이 바뀌면 `.agents/rules/` 원본을 먼저 고치고 `AGENTS.md`와 이 파일, Kiro 포인터를 동기화한다.
