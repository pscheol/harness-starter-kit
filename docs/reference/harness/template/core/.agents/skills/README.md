# .agents/skills — 스킬 카탈로그

> 이 디렉터리는 **단일 진실**이다. 모든 에이전트 도구가 여기를 참조한다.
> 도구별 노출은 `.claude/skills` 같은 심볼릭으로 처리한다.

## 스킬이란

**작업 도메인에 진입했을 때만 로드되는 절차 문서**다. 항상 읽히는 `AGENTS.md`/`rules`와 다르다.

- `rules` = 항상 적용되는 정책 ("무엇을 지켜야 하는가")
- `skills` = 특정 작업에서만 필요한 절차 ("이 작업은 어떻게 하는가")

컨텍스트는 희소 자원이므로, **작업과 무관한 절차는 로드되지 않아야 한다.** 이 분리가 스킬의 존재 이유 전부다.

## 폴더 구조

```text
.agents/skills/
├── README.md
├── _TEMPLATE/SKILL.md      # 신규 스킬 시작점
├── _project/               # 이 프로젝트 고유 스킬 (원본)
│   └── <도메인명>/SKILL.md
└── <도메인명>/             # ↑ 평면 심볼릭 (자동 생성)
```

### 평면 심볼릭이 필요한 이유

일부 도구의 스킬 탐색 글롭은 폴더 **한 단계** 아래의 `SKILL.md`만 본다. 원본이 `_project/<name>/SKILL.md`에 있으면 글롭이 닿지 않는다.

`scripts/bootstrap-harness.cjs`가 `_project/` 아래 폴더를 스캔해 평면 심볼릭을 **자동 생성**한다. 스킬을 추가할 때 스크립트를 고칠 필요는 없다.

## 등록된 스킬

| 스킬             | 호출 시점 |
| ---------------- | --------- |
| _(설치 후 추가)_ |           |

## 새 스킬 추가 절차

1. `_TEMPLATE/SKILL.md`를 `_project/<도메인명>/SKILL.md`로 복사한다.
2. frontmatter의 `name`/`description`을 작성한다.
3. 본문을 **What / Why / How / Examples / Anti-patterns** 5단으로 쓴다.
4. 부트스트랩 스크립트를 실행해 심볼릭을 만든다.
5. 위 표와 `AGENTS.md`의 스킬 목록에 한 줄씩 추가한다.

## description 작성법

description은 **모델이 이 스킬을 로드할지 0.3초 안에 판단**하는 한 줄이다.

- ✅ "Use when adding a payment provider, changing refund logic, or touching `billing/*.ts`."
- ❌ "결제 관련 가이드" — 너무 추상적이라 매칭되지 않는다
- ❌ "결제 API 사용법" — 모델이 이미 아는 일반 지식과 중복

핵심은 **"어떤 작업·파일에서 호출하는가" + "무엇을 다루는가"**다.

## 스킬로 만들지 말아야 할 것

- 모델이 이미 아는 일반 지식 (언어 문법, 표준 라이브러리 사용법)
- 항상 적용되는 정책 → `rules`로
- 한 번만 쓰는 절차 → 작업 단위의 `design.md`로
