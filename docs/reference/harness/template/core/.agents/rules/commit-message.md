---
name: commit-message
description: 커밋 메시지 형식·언어·본문 정책. 모든 커밋 작성 시 적용.
type: rule
applies_to:
  - claude
  - codex
  - human
path_scope: []
priority: standard
last_updated: { { TODAY } }
---

# Commit Message — {{PROJECT_NAME}}

## 형식

```text
<한 줄 요약>

<본문: 왜 이렇게 했는가>
```

- 요약은 50자 이내. 본문은 한 줄 비우고 작성한다.
- 언어는 {{DOC_LANGUAGE}}를 기본으로 하되, **기존 이력과 일관성**을 우선한다.
- 접두사 규약(`feat:`, `fix:` 등)은 기존 이력에 있을 때만 따른다. 없으면 강제하지 않는다.

## 반드시 담을 것

요약은 **무엇을 바꿨는지**, 본문은 **왜 그렇게 했는지**를 담는다. 코드는 무엇을 했는지 이미 말하고 있으므로, 커밋 메시지의 가치는 거의 전부 "왜"에 있다.

```text
스트림 정리 누락 수정

작업 종료 시 취소 호출이 빠져 연결이 남고 메모리가 누수됐다.
수명주기 정리 단계에서 취소를 호출하도록 변경.
```

## 작업 단위 연결

SDD 태스크를 완료한 커밋은 태스크를 명시한다.

```text
<요약> [tasks: <작업단위>#2.1]
```

코드 변경과 `tasks.md` 체크박스 갱신은 **같은 커밋**에 넣는다.

## 병합 커밋

fast-forward가 아니라 병합 커밋이 생기는 경우:

```text
<식별자> merge <source> into <target>

- Source commit: <sha>
- Target base: <sha>
- Request: <요청 근거>
- Verification: <실행한 게이트>
```

## 나쁜 예

- `fix` — 무엇을 고쳤는지 없음
- `WIP` — 병합 전에 정리한다
- `update` — 변화량 명사만 남고 이유가 없음

## 자동화

- [ ] 메시지 형식 검사 (도입 시 commitlint 등으로 강제)

→ 현재는 작성자 규율에 의존한다.

## 안티-규칙

- ❌ 기존 이력과 다른 언어·규약을 새로 강제
- ❌ 단일 단어 메시지 허용
- ❌ 본문 없이 "X 추가" / "Y 수정"만 — **왜**를 한 줄 더 쓴다
