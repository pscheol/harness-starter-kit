# {{PROJECT_NAME}} — Agent Guide (Single Source of Truth)

> 본 파일은 모든 에이전트 도구가 공유하는 **단일 진실 소스**다.
> 도구별 진입점(`CLAUDE.md` 등)은 본 파일의 심볼릭 링크다.
> 정책·컨벤션·스킬을 수정할 때는 **본 파일과 `.agents/`만** 수정한다.
>
> 본 파일은 **목차**다. 상세는 `.agents/`가 system of record.
> 250줄을 넘으면 `scripts/verify-harness.cjs`가 경고한다.

## Overview

(이 프로젝트가 무엇을 하는가 — 2~3문장)

## Tech Stack

- **언어**:
- **런타임**: (`.nvmrc` 등 버전 고정 위치)
- **주요 프레임워크**:
- **테스트**:
- **린트/포맷**:
- **빌드**:

## Build & Test Commands

```bash
{{CMD_INSTALL}}      # 의존성 설치
{{CMD_DEV}}          # 개발 실행
{{CMD_LINT}}         # 린트
{{CMD_TYPECHECK}}    # 타입 검사
{{CMD_TEST}}         # 테스트
{{CMD_BUILD}}        # 빌드
{{CMD_PRECOMMIT}}    # 커밋 전 통합 게이트
{{CMD_VERIFY_HARNESS}}  # 하네스 계약 검사
```

## Project Structure

```text
{{SOURCE_DIR}}/
└── (주요 디렉터리와 책임 — 상세는 .agents/docs/architecture.md)
```

**거대 파일**: `.agents/harness.json`의 `budget.largeFileThreshold` 초과 파일은 **한 번에 전체 read 금지 — 부분 read + Edit**. 목록은 [`.agents/docs/architecture.md`](./.agents/docs/architecture.md) §8.

## Harness Assets

| 자산     | 위치                                             | 역할                              |
| -------- | ------------------------------------------------ | --------------------------------- |
| 설정     | [`.agents/harness.json`](./.agents/harness.json) | 명령·런타임·가드·예산의 단일 설정 |
| 정책     | [`.agents/rules/`](./.agents/rules/)             | 항상 적용되는 규칙                |
| 스킬     | [`.agents/skills/`](./.agents/skills/)           | 도메인 진입 시 로드되는 절차      |
| 지식     | [`.agents/docs/`](./.agents/docs/)               | 아키텍처·컨벤션·명세·계획         |
| 프롬프트 | [`.agents/prompts/`](./.agents/prompts/)         | 재사용 지시문                     |
| 스크립트 | [`scripts/`](./scripts/)                         | **모든 절차의 실제 구현**         |

## Golden Rules (요약)

전문: [`.agents/rules/golden-rules.md`](./.agents/rules/golden-rules.md)

1. **단일 진실은 `.agents/`** — 도구 진입점은 참조만 한다.
2. **컨텍스트는 희소 자원** — 작업에 필요한 것만 로드한다. 거대 파일은 부분 read.
3. **모든 것을 저장소 안으로** — 접근 못 하는 정보는 없는 것과 같다.
4. **추측 금지** — 라이브러리 API와 파일 내용은 확인하고 쓴다.
5. **자동화 위임 영역은 건드리지 않는다** — 포맷·린트·타입은 훅이 처리한다.
6. **`scripts/`가 진실** — 훅과 슬래시 커맨드는 그 호출에 불과하다.

## Rules Index

| 규칙                                                            | 적용 시점             |
| --------------------------------------------------------------- | --------------------- |
| [golden-rules](./.agents/rules/golden-rules.md)                 | 항상                  |
| [agent-task-workflow](./.agents/rules/agent-task-workflow.md)   | 모든 코드 영향 작업   |
| [spec-driven-workflow](./.agents/rules/spec-driven-workflow.md) | 여러 파일에 걸친 작업 |
| [verification-ladder](./.agents/rules/verification-ladder.md)   | 검토로 넘기기 전      |
| [reuse-before-new](./.agents/rules/reuse-before-new.md)         | 새 코드 작성 전       |
| [code-style](./.agents/rules/code-style.md)                     | 코드 작성/리뷰        |
| [testing-policy](./.agents/rules/testing-policy.md)             | 테스트 작성           |
| [security-policy](./.agents/rules/security-policy.md)           | 입력·인증·외부 통신   |
| [git-branch-policy](./.agents/rules/git-branch-policy.md)       | 브랜치·병합           |
| [commit-message](./.agents/rules/commit-message.md)             | 커밋                  |
| [dependency-policy](./.agents/rules/dependency-policy.md)       | 의존성 변경           |
| [pr-review-policy](./.agents/rules/pr-review-policy.md)         | 리뷰 출력             |

## Work Specs (SDD)

- **위치**: [`.agents/docs/product-specs/`](./.agents/docs/product-specs/) — 작업 명세 단일 위치
- **색인**: [`product-specs/index.md`](./.agents/docs/product-specs/index.md) — 새 폴더는 **같은 커밋에서 색인에도 등록**
- **형식**: `<작업단위>/{requirements,design,tasks}.md`
- **템플릿**: [`_templates/`](./.agents/docs/product-specs/_templates/)
- **규약**: [`spec-driven-workflow.md`](./.agents/rules/spec-driven-workflow.md)

### Spec 필요 여부

| 작업                                                   | Spec    |
| ------------------------------------------------------ | ------- |
| 단일 파일 1~2줄 수정                                   | ❌      |
| 여러 파일에 걸친 변경                                  | ⚠️ 권장 |
| 이슈 기반 코드 영향 구현                               | ✅ 필수 |
| 공개 계약 변경, 거대 파일 리팩터링, 의존성 메이저 전환 | ✅ 필수 |

## Domain Skills

작업 컨텍스트에 맞춰 자동 로드된다. 카탈로그: [`.agents/skills/README.md`](./.agents/skills/README.md)

| 스킬             | 호출 시점 |
| ---------------- | --------- |
| _(설치 후 추가)_ |           |

## Required Checks

커밋 전 통합 게이트:

```bash
{{CMD_PRECOMMIT}}
```

자동 강제 위치:

- **SessionStart**: `scripts/assert-harness-context.cjs` — 하네스 없이 세션이 시작되는 것을 막는다
- **PostToolUse (Write|Edit)**: `scripts/format-and-lint-hook.cjs` — 포맷·린트 자동
- **커밋 전**: `scripts/precommit.cjs` — 런타임 → 포맷 → 하네스 계약 → 린트 → 타입 → 가드 → 테스트

어댑터 설정(`.claude/settings.json`, `.codex/hooks.json`)은 **같은 스크립트**를 부른다. 한쪽만 고치면 `verify-harness`가 드리프트를 경고한다.

## Coding Conventions

- **언어**: 코드 식별자는 영어, 주석·문서·응답은 {{DOC_LANGUAGE}}
- **포맷/린트**: 훅이 자동 처리 — 모델은 신경 쓰지 않는다
- **co-locate**: 하위 요소는 상위와 같은 폴더. 배럴 re-export 금지
- **추상화**: 3회 사용부터
- **네이밍**: Boolean `is*`/`has*`/`should*`/`can*`, 핸들러 `handle*`/`on*`

상세: [`.agents/rules/code-style.md`](./.agents/rules/code-style.md), [`.agents/docs/conventions.md`](./.agents/docs/conventions.md)

## Do Not

- 시크릿·토큰 커밋
- `.agents/` 밖에 정책 문서 작성 (단일 진실 위반)
- 거대 파일 전체 read
- 기존 owner 확인 없이 병렬 구현 생성
- `tasks.md` 갱신 없이 코드만 커밋
- 검증 실패를 보고 없이 통과 처리
- 사용자 명시 허용 없는 `git push --force` / 파괴적 삭제 / 외부 배포

## Project Invariants

> **설치 후 반드시 채운다.** 이 표가 비어 있으면 하네스는 절반만 동작한다.
> 기계로 검사 가능한 항목은 `.agents/harness.json`의 `guards`에 등록한다.

| 영역 | 규칙 | 검사 방법 |
| ---- | ---- | --------- |
|      |      |           |
