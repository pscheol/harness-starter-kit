---
name: testing-policy
description: 테스트 종류 선택 기준과 mock 정책. 테스트 작성·리뷰 시 적용.
type: rule
applies_to:
  - claude
  - codex
  - copilot-review
path_scope:
  - '**/*.test.*'
  - '**/*.spec.*'
  - '**/__tests__/**'
priority: critical
last_updated: { { TODAY } }
---

# Testing Policy — {{PROJECT_NAME}}

## 선택 트리

1. **Unit** — 순수 함수, 유틸리티, 변환 로직. 외부 I/O 없음.
2. **Integration** — 경계를 넘는 동작(저장소, API, 프로세스 간 통신).
3. **E2E** — 핵심 사용자 흐름. 느리므로 개수를 제한한다.

## 구조 (AAA)

```text
// Arrange — 입력과 상태를 준비한다
// Act     — 대상 동작을 한 번 실행한다
// Assert  — 관찰 가능한 결과를 검증한다
```

테스트 이름은 **동작**을 설명한다.

```text
returns empty list when no item matches the query
throws when the API key is missing
falls back to substring search when the cache is unavailable
```

## Mock 정책

- **외부 모듈을 mock 해야 unit 이 성립한다면, 그건 unit 이 아니다.** 설계를 다시 본다.
- 경계(네트워크·파일시스템·시계·랜덤)만 대체한다.
- 대체한 경계는 **계약을 명세**한다. 구현 세부에 결합된 mock은 리팩터링을 막는다.

## 커버리지

- 변경된 코드에 대한 커버리지를 본다. 전체 수치를 목표로 삼지 않는다.
- 새 기능에는 **성공 케이스와 최소 1개의 실패 케이스**를 넣는다.
- 커버리지 수치는 리뷰 코멘트 대상이 아니다. CI가 본다.

## 결정성

- `sleep`이나 고정 타임아웃에 의존하지 않는다. 조건 대기를 쓴다.
- 시간·랜덤·순서에 의존하는 테스트는 그 의존을 주입 가능하게 만든다.
- 불안정한 테스트는 고치거나 격리한다. 재시도로 덮지 않는다.

## 공유 환경 보호

> 설치 후 채운다. 공유 서버·공용 계정·공용 fixture 중 **파괴적 테스트에 쓰면 안 되는 대상**을 적는다.

- 보호 대상:
- 대신 사용할 것:

## 자동화로 잡히는 영역

- [x] 테스트 실행 → CI
- [x] 타입 오류 → 타입체커
- [x] `.only` 잔존 → 린터

## 안티-규칙

- ❌ "테스트가 부족하다" 일반론 — 변경된 코드에 한해서만
- ❌ 외부 모듈 mock 제안 (정책상 금지)
- ❌ 스냅샷 무조건 추가 권장 — 회귀가 명확한 경우만
- ❌ 실행 환경이 다른 코드를 부적합한 러너에서 테스트하라는 제안
