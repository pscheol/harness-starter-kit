# {{PROJECT_NAME}}

## 개요

{{PROJECT_NAME}} 가 무엇을 하는지, 누가 쓰는지 두세 문장으로 쓴다. 시스템 안 위치는 [ARCHITECTURE.md](ARCHITECTURE.md) 의 구성도다.

## 구조

| 폴더 | 내용 |
|---|---|
| `.agents/` | 하네스 규칙·역할·스킬·SDD 기록 |
| `docs/features/` | 구현 기능 문서(생성물 + `_src` 원고) |
| `scripts/` | 검증 게이트·SDD·세션 조율 스크립트 |
| `tools/docs/` | 기능 문서 생성기·검사기 |

## 준비물

| 도구 | 판 | 원본 |
|---|---|---|
| Python | 3.11 이상 | 하네스 스크립트·기능 문서 생성기 |
| (스택 도구) | (판) | (빌드 설정 파일) |

## 실행

로컬 실행 방법을 쓴다. 환경 변수 원본은 `.env.example` 이다.

## 검증

| 레벨 | 명령 |
|---|---|
| changed(기본) | `bash scripts/verify.sh --files <paths>` |
| fast | `HARNESS_VERIFY_LEVEL=fast bash scripts/verify.sh` |
| full | `bash scripts/verify.sh --full` |

## 하네스

에이전트(Claude Code · Codex · Kiro · Cursor)는 `AGENTS.md` 부터 읽는다. 하네스 구조는 [하네스 설명서](.agents/docs/guides/harness-engineering.md), SDD 는 [SDD 설명서](.agents/docs/guides/sdd-pattern.md)다.

| 할 일 | 명령 |
|---|---|
| 기능 시작 | `bash scripts/new-feature.sh <slug> <이름>` |
| 기능 문서 | `python3 tools/docs/feature_docs.py build` · `check` |
| 보드 갱신 | `bash scripts/board.sh` |

## 기여

브랜치·커밋 형식은 [git 워크플로](.agents/rules/git-workflow.md), 리뷰 기준은 [리뷰 정책](.agents/rules/pr-review-policy.md)이다. 클론마다 `bash scripts/install-git-hooks.sh` 로 커밋·push hook 을 건다.
