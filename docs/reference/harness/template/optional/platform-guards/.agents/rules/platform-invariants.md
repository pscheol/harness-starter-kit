---
name: platform-invariants
description: 프로젝트 고유 불변 조건과 그것을 검사하는 가드 스크립트의 관계. 가드 추가/수정 시 적용.
type: rule
applies_to:
  - claude
  - codex
  - human
path_scope:
  - 'scripts/**'
  - '.agents/harness.json'
priority: critical
last_updated: { { TODAY } }
---

# Platform Invariants — {{PROJECT_NAME}}

## 불변 조건이란

**코드 전체에서 항상 참이어야 하는 조건**이다. 깨지면 회귀가 된다.

전형적인 후보:

- 보안 경계 옵션이 모든 진입점에 명시되어 있다
- 카탈로그/스키마와 실제 구현이 동기화되어 있다
- 리소스를 여는 코드에는 정리 코드가 짝으로 있다
- 짝을 이뤄 갱신해야 하는 설정 파일이 함께 갱신된다
- 상태 머신이 허용되지 않은 전이를 하지 않는다

## 문서 → 가드 승격

불변 조건은 세 단계로 다룬다.

| 단계          | 위치                                   | 효과                          |
| ------------- | -------------------------------------- | ----------------------------- |
| 1. 문서       | `golden-rules.md` 불변 조건 표         | 알고는 있으나 지켜지지 않는다 |
| 2. 가드(경고) | `scripts/*.sh` + `harness.json#guards` | 위반이 보인다                 |
| 3. 가드(강제) | `enforceEnv=1`                         | 위반이 막힌다                 |

**2단계를 건너뛰고 3단계로 가지 않는다.** 기존 위반이 남은 상태에서 강제하면 전원의 커밋이 막히고, 가드가 제거된다.

## 가드 작성 기준

좋은 가드:

1. **빠르다** — 수 초 내. 느린 가드는 SKIP 된다.
2. **오탐이 거의 없다** — 오탐 한 번이면 신뢰를 잃는다.
3. **고치는 법을 알려준다** — 파일:라인 + 무엇을 어떻게 바꿔야 하는지.

```bash
# 나쁜 메시지
✗ violation found

# 좋은 메시지
✗ src/api/handlers/upload.ts:23: 경계 입력이 검증되지 않았습니다.
    핸들러 시작부에서 스키마 검증을 통과시킨 뒤 도메인 로직에 넘기세요.
    정책: .agents/rules/security-policy.md
```

## 등록

`.agents/harness.json`:

```json
{
  "guards": [
    {
      "name": "guard name",
      "command": "bash scripts/check-something.sh",
      "enforceEnv": "ENFORCE_SOMETHING",
      "skipEnv": "SKIP_SOMETHING"
    }
  ]
}
```

## 이 프로젝트의 불변 조건

> 설치 후 채운다.

| 불변 조건 | 깨졌을 때의 증상 | 가드 | 단계 |
| --------- | ---------------- | ---- | ---- |
|           |                  |      |      |
