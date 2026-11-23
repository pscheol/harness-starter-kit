# 문서 지도

**무엇을 하려는지**에 따라 들어가는 곳이 다르다.

| 묶음 | 독자 | 언제 |
|---|---|---|
| [guides/](guides/) | 킷을 **쓰는** 사람 | 내 리포에 하네스를 깔고 운영할 때 |
| [analysis/](analysis/) | 킷을 **고치는** 사람 | 템플릿·설치 로직·강제 수단을 손볼 때 |
| [roadmap.md](roadmap.md) | 킷 개발자 | 무엇이 언제 왜 이렇게 됐는지 확인할 때 |
| [ai-dlc/](ai-dlc/index.html) | AI-DLC를 도입하려는 팀 | 방법론을 이해하고 개발·설계에 적용할 때 (HTML) |
| [harness-next/](harness-next/index.html) | 킷 개발자 · 킷을 쓰는 팀 | v2 방향·단계 계획·활용법을 볼 때 (HTML, 제안 단계) |
| [design/](design/README.md) | 킷을 고치는 개발자 · 구현 에이전트 | v2를 실제로 만들 때 보는 설계서(Markdown 12편)와 관리 페이지 화면기획서(HTML 시안) |

---

## guides/ — 사용 가이드

| 문서 | 한 줄 |
|---|---|
| [01-getting-started.md](guides/01-getting-started.md) | 설치 → 스택·아키텍처 결정 → 스캐폴딩 → 채우기 → 강제 도구 → 첫 기능 → 검증까지 순서대로 |
| [02-choosing-architecture.md](guides/02-choosing-architecture.md) | 23변형 결정 트리 · 기존 코드 판독 · 승격/후퇴 신호 |
| [03-jvm-architecture-recipes.md](guides/03-jvm-architecture-recipes.md) | jvm 8변형의 모듈 등록·의존 선언·구조 테스트 배치 |

## analysis/ — 킷 내부 구조

| 문서 | 한 줄 |
|---|---|
| [README.md](analysis/README.md) | 5종 색인 + 한 장 요약 |
| [01-overview.md](analysis/01-overview.md) | 킷이 무엇을 푸는가 · 다섯 축 · 파일 지도 |
| [02-architecture.md](analysis/02-architecture.md) | 설치 매핑(3루트 · 7세그먼트) · 변형과 계층 모델 · 규칙 원본 12종 · 치환 토큰 |
| [03-sdd-workflow.md](analysis/03-sdd-workflow.md) | SDD 9단계의 산출·게이트·되돌림 규칙 |
| [04-enforcement.md](analysis/04-enforcement.md) | 강제 수단(1곳 + N트리거) · 검증 레벨 · 완료 게이트 |

## ai-dlc/ — AI-DLC 핸드북 (HTML)

브라우저로 [ai-dlc/index.html](ai-dlc/index.html)을 연다. 외부 글꼴·스크립트 없이 오프라인으로 열린다.
그림은 [ai-dlc/diagrams/](ai-dlc/diagrams/)에 장마다 네 벌로 있다 — `.mmd`(원본) · `.excalidraw`(편집용) · `.svg`·`.png`(렌더). 고칠 때는 `.mmd`를 고치고 다시 렌더한다.
인터랙티브 그림 4장은 [ai-dlc/diagrams/archify/](ai-dlc/diagrams/archify/)에 있다 — `*.<type>.json`(Archify 명세) · `*.html`(확대·검색·추적 뷰어) · `*.preview.webp`(본문 미리보기). 고칠 때는 명세를 고치고 `archify validate`·`deliver`로 다시 만든다.

| 문서 | 한 줄 |
|---|---|
| [index.html](ai-dlc/index.html) | 한 장 요약 · 읽는 순서 · 출처 |
| [01-concepts.html](ai-dlc/01-concepts.html) | 정의 · 10가지 원칙 · Intent/Unit/Bolt · 애자일과의 차이 |
| [02-workflow.html](ai-dlc/02-workflow.html) | 세 단계 · aidlc-workflows v1(규칙 복사형)과 v2(엔진 설치형) |
| [03-landscape.html](ai-dlc/03-landscape.html) | Spec Kit · Kiro · OpenSpec · BMAD · 하네스 엔지니어링 등과 비교 |
| [04-cases.html](ai-dlc/04-cases.html) | CJ올리브영 · 샐러드랩 사례와 공통 교훈 |
| [05-apply.html](ai-dlc/05-apply.html) | 개발하면서 적용하기 · 이 킷의 SDD와 대응표 · 보강안 |
| [06-design.html](ai-dlc/06-design.html) | Intent → EARS → Unit 분해 → 계약 → 도메인 설계 → ADR |

## harness-next/ — v2 방향과 계획 (HTML, 제안 단계)

v1.0.8을 v2로 옮기는 분석과 계획이다. 킷만으로 도는 흐름과 AI-DLC·Entire 선택 모듈, 하네스별 역할, 설계→구현→검증→반영→운영 흐름, worktree 운영, 대시보드, 스킬 목록, npx 설치를 다룬다. 아직 구현되지 않았다.
스타일은 `ai-dlc/assets/`를 함께 쓴다. 그림 원본은 [harness-next/diagrams/](harness-next/diagrams/)의 `.mmd`이고 `.svg`·`.png`·`.excalidraw`는 렌더 결과다(묶음이 있는 그림의 `.excalidraw`는 통이미지 하나다).

| 문서 | 한 줄 |
|---|---|
| [index.html](harness-next/index.html) | 한 장 요약 · 흐름과 역할 · v2 구성 · 결정 상태 |
| [01-diagnosis.html](harness-next/01-diagnosis.html) | 지금 킷 · 표준 · 설치기 4종 · AI-DLC · Entire · 채널톡 · 브랜치 · 현장 두 곳 · 이 컴퓨터의 스킬 |
| [02-direction.html](harness-next/02-direction.html) | 흐름 · 킷만/모듈 켬 · 하네스별 역할 · AI-DLC/Entire 선택 모듈 · 기획물 · 검증 · worktree · 대시보드 · 스킬 목록 · 설치 엔진 · 결정 D1~D8 |
| [03-plan.html](harness-next/03-plan.html) | P17~P24 산출물·완료 기준·착수 전 확인 · 기존 프로젝트 이전 · 위험 · 릴리스 규칙 |
| [04-usage.html](harness-next/04-usage.html) | 요구사항 하나를 운영까지 · 세션 배치 · 대시보드·내 스킬 쓰는 법 · 도입 순서 · 지표 |
| [05-principles.html](harness-next/05-principles.html) | AI-DLC 원칙 대응 · 채널톡에서 가져올 것/버릴 것 · 사람 역할 · 폴더와 주인 · 이슈 키 · Jira 대응 · 고쳐 쓰는 네 층 |

## design/ — v2 설계서 (설계 초안)

harness-next의 방향을 구현하기 위한 설계서다. [README.md](design/README.md)의 공통 계약(원칙 · 용어 · 파일 배치 · 설정 형식 · 명령 · 검증 레벨)을 모든 문서가 따른다. 관리 페이지 화면기획서는 [design/screens/index.html](design/screens/index.html)(화면 10장, 디자인 시안 · 번호 설명 · 상태 · 핵심 흐름)이다.

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
