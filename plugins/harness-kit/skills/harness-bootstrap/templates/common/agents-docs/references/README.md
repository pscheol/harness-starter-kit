<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}} 치환 후 사용 -->

# 참고 자료 (References)

에이전트가 추론에 활용할 외부/내부 참고 자료를 모은다.
가능하면 **LLM 친화 포맷(`*-llms.txt`)**으로 요약해 컨텍스트 효율을 높인다.

## 문서 위치 구분

- `docs/` — 사람이 읽는 기획/분석 **원본**(PRD·아키텍처·ERD·API 명세·백로그).
- `.agents/docs/` — 에이전트용 SDD 정본(`product-<slug>-specs/{requirements,design,tasks}`·`decisions`)과 생성물.
- `references/`(이 디렉터리) — 추론 보조용 **참고 자료**(외부 라이브러리 요약·코드 파생 지도·참고 구현).

## 프로젝트 내 참고 코드

<!-- [STACK 예시] 프로젝트가 참고하는 디자인 시스템·구현 레퍼런스로 치환한다. -->
- `docs/<refs>/<design-system>/` — 자체/외부 디자인 시스템 기준(프론트엔드 우선 참고).
- `docs/<refs>/<reference-impl>/` — 참고할 오픈소스/모노레포 구현 패턴.

상세 프론트엔드 규약은 규칙 정본 `.agents/rules/`(frontend 등) 참고.

## 내부 아키텍처 참고 (코드 파생)

<!-- [STACK 예시] 코드에서 파생한 사용 현황 지도로 치환한다. 정본은 코드, 소스 변경 시 갱신. -->
- `<tool>-usage.md` — 특정 도구/프레임워크 사용 현황 지도(적용 지점·트리거·패턴·env). 정본은 코드.

## 기획/분석 원본

`docs/` (PRD, 아키텍처, ERD, API 명세, 백로그). 목록은 프로젝트 source-docs 문서.

## llms.txt (예정)

외부 라이브러리/프레임워크의 핵심 사용법을 `<name>-llms.txt`로 요약해 여기에 둔다.
<!-- [STACK 예시] 프로젝트에서 쓰는 라이브러리로 치환한다. -->
예: `<framework>-llms.txt`, `<library>-llms.txt`.
