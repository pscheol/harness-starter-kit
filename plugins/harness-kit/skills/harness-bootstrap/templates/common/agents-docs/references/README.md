<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}} 치환 후 사용 -->

# 참고 자료

에이전트가 작업할 때 참고할 외부·내부 자료를 모아두는 곳이다.
가능하면 `*-llms.txt` 형태로 요약해 두면 컨텍스트를 덜 쓴다.

## 문서 위치 구분

- `docs/` — 사람이 읽는 기획·분석 원본(PRD·아키텍처·ERD·API 명세·백로그).
- `.agents/docs/` — 에이전트가 보는 SDD 문서(`product-<slug>-specs/{requirements,design,tasks}`·`decisions`)와 생성물.
- `references/`(이 디렉터리) — 판단할 때 곁에 두고 보는 자료(외부 라이브러리 요약·코드에서 뽑은 지도·참고 구현).

## 프로젝트 내 참고 코드

<!-- [STACK 예시] 프로젝트가 참고하는 디자인 시스템·구현 레퍼런스로 치환한다. -->
- `docs/<refs>/<design-system>/` — 자체/외부 디자인 시스템 기준(프론트엔드 우선 참고).
- `docs/<refs>/<reference-impl>/` — 참고할 오픈소스/모노레포 구현 패턴.

프론트엔드 규약은 `.agents/rules/`(frontend 등)에 있다.

## 코드에서 뽑은 내부 참고 자료

<!-- [STACK 예시] 코드에서 파생한 사용 현황 지도로 치환한다. 원본은 코드, 소스 변경 시 갱신. -->
- `<tool>-usage.md` — 특정 도구/프레임워크 어디에 어떻게 쓰이는지 정리한 지도(적용 지점·트리거·패턴·env). 기준은 코드다.

## 기획·분석 원본

`docs/` (PRD, 아키텍처, ERD, API 명세, 백로그). 목록은 프로젝트 source-docs 문서.

## llms.txt (아직 없음)

외부 라이브러리/프레임워크의 핵심 사용법을 `<name>-llms.txt`로 요약해 여기에 둔다.
<!-- [STACK 예시] 프로젝트에서 쓰는 라이브러리로 치환한다. -->
예: `<framework>-llms.txt`, `<library>-llms.txt`.
