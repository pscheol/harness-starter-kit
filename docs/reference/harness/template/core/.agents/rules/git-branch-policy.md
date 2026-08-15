---
name: git-branch-policy
description: 브랜치 이름 규칙과 병합 정책. 브랜치 생성·push·MR/PR 생성 시 적용.
type: rule
applies_to:
  - claude
  - codex
  - human
priority: critical
last_updated: { { TODAY } }
---

# Git Branch Policy — {{PROJECT_NAME}}

## 핵심 규칙

공유 원격 브랜치와 MR/PR 브랜치는 **작업 내용 기준**으로 이름을 짓는다. 작업자나 도구 이름이 아니라 **무엇을 하는 작업인지**가 보여야 한다.

`codex/`, `claude/`, `agent/` 접두사는 로컬 임시 브랜치에만 허용한다. 원격에 push 하거나 MR/PR을 만들기 전에 아래 공유 브랜치 이름으로 rename 한다.

## 이름 형식

```text
<type>/<식별자>-<짧은-슬러그>     # 이슈가 있을 때
<type>/<짧은-슬러그>              # 이슈가 없는 하네스·문서·운영 작업
```

허용 type:

```text
feature   기능 개발, 요구사항 반영
fix       버그, 사용자 대면 회귀 수정
test      테스트 보강·자동화·재검증 전용
docs      문서, 하네스, 운영 규칙
refactor  동작 변경 없는 구조 개선
chore     설정, 스크립트, 의존성, 비기능 작업
release   릴리즈 준비, 패키징, 배포 후보 검증
hotfix    운영 차단 긴급 수정
spike     짧은 조사/PoC. MR 전에 다른 type으로 전환
```

예시:

```text
fix/{{PROJECT_KEY}}-20-save-fails-silently
feature/{{PROJECT_KEY}}-131-bulk-import
test/{{PROJECT_KEY}}-140-checkout-flow-retest
docs/agent-harness-setup
release/1.5.1
hotfix/{{PROJECT_KEY}}-201-startup-crash
```

## 기준 브랜치

- 작업 브랜치는 `{{DEFAULT_BRANCH}}`의 최신 상태에서 만든다.
- 작업 시작 전 `git fetch origin`을 실행한다.
- 기준 브랜치가 불명확하면 **구현을 시작하지 말고** 어느 브랜치를 기준으로 삼을지 확인한다.

## 하나의 작업 = 하나의 브랜치

- 범위가 공유된다는 사실이 문서로 남지 않는 한, 작업 하나당 브랜치 하나를 만든다.
- 브랜치는 수명을 짧게 유지한다. 오래 살아 있는 브랜치는 병합 비용을 지수로 키운다.

## 병합

- 대상 브랜치의 최신 상태를 먼저 가져온다.
- 충돌 확인은 임시 통합 브랜치에서 한다. **원본 브랜치를 rewrite 하거나 force push 하지 않는다.**
- 병합 게이트(`{{CMD_PRECOMMIT}}` 또는 동등한 검증)를 통과한 뒤 병합한다.
- 충돌·stale·테스트 실패가 있으면 병합하지 않고 되돌린다.

## 정리

- 병합된 브랜치는 원격에서 삭제한다.
- 삭제는 **읽기 전용 감사 결과를 먼저 보고**, 사람 확인 후 수행한다.

## 금지

- 사용자 명시 허용 없는 `git push --force`
- 공유 브랜치의 이력 rewrite
- 도구 접두사(`codex/`, `claude/`) 브랜치를 그대로 원격에 남기는 것
- 여러 무관한 작업을 한 브랜치에 섞는 것
