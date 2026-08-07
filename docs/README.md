# 문서 지도

세 묶음이다. **무엇을 하려는지**에 따라 들어가는 곳이 다르다.

| 묶음 | 독자 | 언제 |
|---|---|---|
| [guides/](guides/) | 킷을 **쓰는** 사람 | 내 리포에 하네스를 깔고 운영할 때 |
| [analysis/](analysis/) | 킷을 **고치는** 사람 | 템플릿·설치 로직·강제 수단을 손볼 때 |
| [roadmap.md](roadmap.md) | 킷 개발자 | 무엇이 언제 왜 이렇게 됐는지 확인할 때 |

---

## guides/ — 사용 가이드

| 문서 | 한 줄 |
|---|---|
| [01-getting-started.md](guides/01-getting-started.md) | 설치 → 스택·아키텍처 결정 → 스캐폴딩 → 채우기 → 강제 도구 → 첫 기능 → 검증까지 순서대로 |
| [02-choosing-architecture.md](guides/02-choosing-architecture.md) | 17변형 결정 트리 · 기존 코드 판독 · 승격/후퇴 신호 |
| [03-jvm-architecture-recipes.md](guides/03-jvm-architecture-recipes.md) | jvm 8변형의 모듈 등록·의존 선언·구조 테스트 배치 |

## analysis/ — 킷 내부 구조

| 문서 | 한 줄 |
|---|---|
| [README.md](analysis/README.md) | 5종 색인 + 한 장 요약 |
| [01-overview.md](analysis/01-overview.md) | 킷이 무엇을 푸는가 · 4대 축 · 파일 지도 |
| [02-architecture.md](analysis/02-architecture.md) | 설치 매핑(3루트 · 7세그먼트) · 변형과 계층 모델 · 규칙 원본 12종 · 치환 토큰 |
| [03-sdd-workflow.md](analysis/03-sdd-workflow.md) | SDD 9단계의 산출·게이트·되돌림 규칙 |
| [04-enforcement.md](analysis/04-enforcement.md) | 강제 수단(1곳 + N트리거) · 검증 레벨 · 완료 게이트 |

## roadmap.md — 계획과 완료 이력

Phase 단위로 무엇을 왜 그렇게 정했는지, 검증은 어떻게 했는지가 남아 있다.
**새 변형·스택을 추가할 때는 여기 "변형/스택을 늘릴 때" 절을 먼저 본다.**

---

## 자주 찾는 것

| 궁금한 것 | 볼 곳 |
|---|---|
| 어떤 아키텍처를 골라야 하나 | [guides/02](guides/02-choosing-architecture.md) 결정 트리 |
| 설치했는데 다음에 뭘 하나 | [guides/01](guides/01-getting-started.md) ④⑤ · `setup.sh` 가 출력한 "다음 단계" |
| `settings.gradle` 을 어떻게 쓰나 | [guides/03](guides/03-jvm-architecture-recipes.md) |
| 레이어를 어겼는데 왜 통과하나 | [guides/03](guides/03-jvm-architecture-recipes.md) §0·§10 · [analysis/04](analysis/04-enforcement.md) |
| 스킬·커맨드 인자 | 루트 [README.md](../README.md) |
| 새 변형을 킷에 추가하려면 | [roadmap.md](roadmap.md) · [analysis/02](analysis/02-architecture.md) |
| 규칙 원본이 어디 있나 | 설치된 리포의 `.agents/rules/` (12종) · 목차는 그 리포의 `AGENTS.md` |
