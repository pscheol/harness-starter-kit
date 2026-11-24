---
name: kns-docs
description: 'SDD 7단계 — 문서 반영. 이번 이슈가 바꾼 기능의 원고·배정을 갱신하고 기능 문서를 생성·검사한다.'
---

SDD 워크플로 원본 `.agents/rules/sdd-workflow.md` 의 「SDLC 단계」와 `/kns-docs` 절을 로드해 그대로 수행한다.

기능 문서는 메인 리포(단일 리포면 그 리포) 루트의 `tools/docs/feature_docs.py` 가 만든다. 단위·도메인 폴더에서 작업했으면 루트에서 실행한다.
생성기가 없는 리포는 이 단계를 건너뛰고 tasks 의 `[VERIFICATION]` 블록에 이유를 적는다.

핵심:
1. 범위: 이슈 requirements 의 「기능 문서」 칸(갱신할 기능 ID)과 이번 변경 파일로 바뀐 기능을 정한다. 새 기능이면 catalog 에 기능을 더한다.
2. 원본 갱신: OpenAPI 스냅숏이 바뀌었으면 `refresh openapi`, 마이그레이션이 바뀌었으면 `refresh schema` 를 실행한다(명령은 생성기 README).
3. 배정: 새 operation·테이블·캐시·화면을 catalog 기능에 배정한다. `python3 tools/docs/feature_docs.py stats` 의 미배정·중복이 0 이어야 한다.
4. 원고: `python3 tools/docs/feature_docs.py brief <기능 ID>` 를 출발점으로 원고 절 12개를 이번 변경에 맞게 고친다. 요구(FR)·정책(P)은 requirements 의 R#.#·정책 표, 흐름·시퀀스·상태는 design 의 그림에서 옮기고 코드와 대조한다.
5. 생성·검사: `python3 tools/docs/feature_docs.py build` 뒤 `python3 tools/docs/feature_docs.py check` 가 통과해야 한다. 생성물(html)은 손으로 고치지 않는다.
6. tasks Polish 의 문서 반영 작업을 체크하고, 검사 출력(통과/실패 수)을 결과에 적는다.

대상(이슈·기능): 이 명령 뒤에 이어서 적은 내용

경로: 이슈 문서는 `scripts/check-sdd-prerequisites.sh` 출력의 BASE/REQUIREMENTS/DESIGN/TASKS 로 해석한다.
검증: `bash scripts/verify.sh --files <변경 경로>` — 기능 문서 경로가 바뀌면 changed 계획이 문서 검사를 함께 고른다(`.agents/verify-checks.json`).
