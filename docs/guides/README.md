# 가이드 — 킷을 쓰는 사람을 위한 문서

**킷을 내 프로젝트에 적용하는 방법**을 다룬다. 킷 자체를 고치려면 [../analysis/](../analysis/) 를 본다.

| 문서 | 언제 읽나 | 담긴 것 |
|---|---|---|
| [01-getting-started.md](01-getting-started.md) | **처음 한 번** | 플러그인 설치 → 스택·아키텍처 결정 → 스캐폴딩 → 플레이스홀더 채우기 → 강제 도구 붙이기 → 첫 기능(SDD) → 검증 게이트. 자주 막히는 곳 표 포함 |
| [02-choosing-architecture.md](02-choosing-architecture.md) | 설치 전 · 구조가 안 맞다고 느낄 때 | 17변형 결정 트리 · 기존 코드 판독표 · 스택별 전체 목록 · 헷갈리는 짝 비교 · 승격/후퇴 신호 |
| [03-jvm-architecture-recipes.md](03-jvm-architecture-recipes.md) | JVM 설치 직후 | 8변형별 `settings.gradle` 등록 · 의존 선언 · 구조 테스트 배치 · 공통 함정 |

## 읽는 순서

```
처음이라면          01 → (02는 ② 단계에서) → (jvm이면 03) → 01의 ⑥⑦로 복귀
아키텍처만 고민     02
설치는 끝났는데
빌드를 못 세우겠다   03   (python·go는 설치된 ARCHITECTURE.md 의 계약 골격)
```

## 이 문서들이 다루지 않는 것

| 궁금한 것 | 볼 곳 |
|---|---|
| 스킬·커맨드 하나하나의 인자와 동작 | 리포 루트 [README.md](../../README.md) |
| 킷 내부 구조(설치 매핑·템플릿 레이어) | [../analysis/](../analysis/) |
| 킷 개발 이력과 남은 작업 | [../roadmap.md](../roadmap.md) |
| 설치된 리포의 규칙 원본 | 그 리포의 `.agents/rules/` · `ARCHITECTURE.md` |

## 용어

| 말 | 뜻 |
|---|---|
| **킷 스킬** | 플러그인이 제공. `harness-kit:` 네임스페이스가 붙는다. `hx-bootstrap` · `hx-jvm-*` · `hx-agent-add` · `hx-update` |
| **프로젝트 스킬** | `hx-bootstrap` 이 대상 리포에 설치. SDD 워크플로 9종(`hx-specify` … `hx-harness`) |
| **변형(ARCH)** | 한 스택 안의 아키텍처 선택지. 바꾸면 4개 파일이 교체된다 |
| **강제 수단** | 위반을 `scripts/verify.sh` 에서 **실패로 만드는** 장치(모듈 그래프 · ArchUnit/Konsist · import-linter · depguard) |
| **exec-plan** | `tasks/{active,check,completed}/` 의 실행 계획. `completed/` 이동은 사람이 승인 |
