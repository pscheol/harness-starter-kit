---
key: HK-5
area: verify
type: feat
title: 바꾼 모듈과 그 모듈을 쓰는 모듈만 검사하는 affected 레벨을 더한다
status: approved
created: 2026-11-23
---

# Requirements — HK-5 affected 레벨 (v1.1)

근거: [설계 01 R1 · §3.0 · §3.1](../../../../docs/design/01-v1.1-verify-and-issues.md). 사용자 문제: "verify.sh가 전체를 검증해 1~2시간 넘게 걸린다. 수정한 기능만 검증해야 한다."

- **R1.1** `verify.sh --affected`는 `merge-base(HEAD, origin/<git.base>)`부터 HEAD까지 바뀐 파일과 작업 트리 변경(색인 · 미색인 · 추적 안 된 파일, ignore 제외)을 합쳐 변경 집합으로 삼는다.
- **R1.2** 변경 파일마다 스택별 규칙(Gradle · pnpm · uv · Go, §3.1 표)으로 모듈을 정하고, 그 모듈을 쓰는 모듈을 전이적으로 더한다.
- **R1.3** 고른 모듈의 검사만 돌린다. 프로젝트 전체 명령은 빌드 계약 파일이 바뀐 경우에만 쓰고 `widened`에 이유를 남긴다.
- **R1.4** 모듈을 정하지 못한 파일은 그 파일이 속한 단위(`.agents/harness.json` 폴더)의 검사로 넓히고 이유를 남긴다. full로 올리지 않는다.
- **R1.5** `--affected --plan`은 명령 목록만 JSON으로 내고 아무것도 실행하지 않는다.
- **R1.6** base ref가 없으면 상태 `incomplete`와 `git fetch` 안내를 낸다.
- **R1.7** 레벨 진입(§3.0): 인자 > `HARNESS_VERIFY_LEVEL` > 기본 changed. `--affected`·`--changed`를 받는다.
