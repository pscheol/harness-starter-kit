---
paths:
  - "tools/harness/**"
  - ".gitmodules"
  - ".agents/docs/specs-index.md"
  - ".agents/guards/cross-domain-allow.txt"
---
<!-- HARNESS STARTER KIT · {{PROJECT_NAME}} · 선택 모듈: multi-harness -->

# 리포 간 조율 — 상위 리포 + 도메인 submodule

기능 하나가 도메인 리포 둘 이상을 건드릴 때의 순서다. 공통 하네스는 `npx harness-kit sync units` 로 단위(배포 대상 폴더, `tools/harness/units.json`)마다 복사한다. 이 단위는 Intent 의 Unit 과 다른 것이다. Intent Unit 의 `repo` 값이 배포 단위 `id` 다.

| 단계 | 하는 일 |
|---|---|
| 1 계약 확정 | 상위 리포에 계약 Unit(`kind: contract`) 이슈를 둔다. design §6 승인이 계약 승인이다 |
| 2 병렬 구현 | 도메인 리포마다 구현 세션 1개. 리포가 다르면 worktree 없이 각자 폴더에서 한다 |
| 3 경계 검증 | 상위 리포에서 계약 시험 + `python3 scripts/harness/check_submodules.py` + 도메인 간 경로 가드 |
| 4 순서 커밋 | 제공 도메인 리포 커밋 · push → 소비 도메인 리포 → 상위 리포 포인터 커밋. 포인터를 먼저 커밋하지 않는다 |
| 5 기록 | `python3 scripts/harness/check_submodules.py --record <이슈 키>` 로 상위 `specs-index.md` 의 그 이슈 행에 도메인별 submodule SHA 를 적는다 |

- `check_submodules.py` 가 보는 것: 초기화(`-`) · 포인터(원격에 없는 커밋을 가리킴) · 작업 상태(커밋 안 된 변경이 있는데 포인터를 커밋하려 함) · 브랜치(상위와 submodule 의 이슈 키가 다름).
- `affected` 검증은 바뀐 도메인 submodule 에만 이것을 부른다.
- 도메인 파일이 다른 도메인 경로를 참조하면 `scripts/guards/no-cross-domain-paths.sh` 가 알린다. 예외는 `.agents/guards/cross-domain-allow.txt` 에 `경로 사유` 로 적는다. 경고(`harness-guard-enforce: 0`)로 시작하고 위반이 0건이 되면 1로 올린다.
- 상위 리포까지 worktree 로 만들지 않는다(submodule 이 있는 리포의 worktree 는 git 이 권하지 않는다).
