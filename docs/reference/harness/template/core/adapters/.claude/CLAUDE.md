# .claude/CLAUDE.md — {{PROJECT_NAME}} (협업 베이스)

> Claude Code가 항상 자동 로드하는 베이스 컨텍스트.
> 아키텍처 상세는 [`/AGENTS.md`](../AGENTS.md), 정책·스킬은 [`/.agents/`](../.agents/) 참조.
> **본 파일은 한 페이지 분량으로 유지한다** — 토큰 절약.

## 프로젝트 개요

(2~3문장)

## 자주 쓰는 명령

```bash
{{CMD_INSTALL}}
{{CMD_DEV}}
{{CMD_LINT}}
{{CMD_TYPECHECK}}
{{CMD_TEST}}
{{CMD_BUILD}}
{{CMD_PRECOMMIT}}
```

## 컨벤션 (요약)

- **포맷/린트**: PostToolUse 훅이 자동 실행 — 모델은 신경 X
- **언어**: 응답·문서·주석은 {{DOC_LANGUAGE}}, 코드 식별자는 원문
- **co-locate**: 하위 요소는 상위와 같은 폴더. 배럴 re-export 금지
- **추상화**: 3회 사용부터

## 자동화 위임 영역 (코멘트·수정 금지)

포맷 · 린트 · 타입 오류 · import 순서 · 미사용 변수 · 테스트 실행

## 협업 규칙 (TL;DR)

1. **3줄 요약** — 변경 후 무엇이 / 왜 / 다음 단계
2. **불필요한 추상화 금지** — 1회 사용은 인라인
3. **파괴적 명령은 사전 확인**
4. **모르면 묻기** — 라이브러리 API는 공식 문서 확인 후 적용
5. **거대 파일 주의** — 전체 read 금지, 부분 read + Edit

## 단일 진실 위치

- [`/AGENTS.md`](../AGENTS.md) — 본 저장소의 단일 진실 본문
- [`/.agents/rules/`](../.agents/rules/) — 정책
- [`/.agents/skills/`](../.agents/skills/) — 도메인 절차
- [`/.agents/docs/product-specs/`](../.agents/docs/product-specs/) — 작업 명세
