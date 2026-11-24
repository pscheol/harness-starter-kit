---
key: HK-8
area: cli
type: feat
title: npx harness-kit CLI의 뼈대와 init · plan · doctor · list를 만든다
state: check
created: 2026-11-23
---

# Tasks — HK-8

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | `packages/cli` 골격: package.json · tsconfig · build.mjs · src-hash · vitest 설정 · `pnpm install` · `.gitignore` · 루트 scripts | R1.2 | `pnpm build` | done |
| T2 | `packages/templates/layout.json` | R2.1 | layout-lib 시험 | done |
| T3 | 단위 시험 작성(RED) | R1.1 · R2.1~R2.4 · R4.1 · R4.2 · R8.1 | 실패 수 기록 | done |
| T4 | `tests/test_cli_parity.py` · `tests/cli_dist.py` 작성(RED) | R2.1 · R9.2 | 실패 수 기록 | done |
| T5 | core 구현: layout · selection · tokens · resolve · plan · apply · meta · lock · json | R2.1~R2.4 | 단위 시험 | done |
| T6 | 명령 구현: init · plan · doctor · list · 예약 명령 · 인자 · 출력 · Node 확인 | R1.1 · R2.2 · R2.3 · R4.1 · R4.2 · R8.1 | 단위 시험 | done |
| T7 | 동일성 시험 GREEN(조합 24개) | R2.1 · R4.2 | 시험 통과 | done |
| T8 | `gen-plugins.mjs`가 CLI 사본을 넣는다 · `test_generated.py` | R9.1 | `--check` 일치 | done |
| T9 | 검토 지적 반영(RED → GREEN) | R1.1 · R2.1 · R4.1 | 단위 시험 | done |
| T10 | 전체 시험 | — | `Ran N tests … OK` | done |

## 검증 기록

- T1: 개발 의존 4개(typescript 5.9.3 · esbuild 0.28.2 · vitest 5.1.1 · @types/node 18.19.130), `dependencies` 0개. pnpm 11은 esbuild 설치 스크립트를 막으므로 `pnpm-workspace.yaml`에 `allowBuilds.esbuild: true`, vitest의 `@types/node` 피어 범위(20 이상)는 `peerDependencyRules`로 18을 허용한다.
- T3 RED: vitest 시험 파일 8개 전부 실패(`src/` 모듈 없음), 시험 0개 실행.
- T4 RED: `test_cli_parity` 두 시험 묶음 모두 setUpClass 오류(번들 없음 — `src/cli.ts`가 없어 빌드 불가), 시험 0개 실행.
- T5 · T6 GREEN: vitest 8파일 120개 통과, `tsc --noEmit` 오류 0.
- T7 첫 실행: 73개 실패. 플러그인 생성물을 다시 만들지 않아 `skills/hx-bootstrap/templates/layout.json`이 없었다(CLI exit 5). `gen-plugins.mjs` 반영 후 다시 만들자 24개 조합 전부 통과.
- T7 변이 확인: 임시 템플릿 사본의 `overlap`을 `last`로 바꾸고 조합 #7(jvm · hexagonal-standalone · claude,codex · platform-guards)을 설치하면 setup.sh와 `.agents/rules/platform-invariants.md` · `scripts/run-guards.sh` 2개가 다르다. 비교가 실제 차이를 잡는다.
- T8 RED: 새 생성물 시험 4개를 이전 `gen-plugins.mjs`에 돌리면 3개 실패(사본 없음 · dist 없는 비교 · 소스 변경 감지). GREEN: `test_generated` 10개 통과, `node scripts/gen-plugins.mjs --check` → `생성물 일치: 파일 485개`.
- T9: 코드 검토(typescript-reviewer) 지적 중 9건을 시험으로 먼저 썼다. RED 10개 실패 · 119개 통과(129개). GREEN 129개 통과.
  - `tools/docs/`에 사람 파일이 있으면 `feature_docs.py`를 실행하지 않는다(design D17).
  - 상위 폴더가 끊어진 링크 → exit 3, 상위 경로가 파일 → skip-user(D16).
  - `.GIT` 같은 대소문자 변형 거부, `--adopt`는 있는 `.agents/harness.json`을 둔다.
  - Node 18.0~18.2 → exit 5(`util.parseArgs`가 18.3부터, D18).
  - `constructor` · `__proto__` 같은 이름은 모르는 명령(exit 2).
  - doctor는 lock의 리포 밖 경로를 따라가지 않고 `lock-invalid`로 낸다. 읽지 못한 파일은 내부 오류 대신 `missing`.
  - `bogus,all`처럼 모르는 이름이 섞이면 exit 2(D19). stdout EPIPE는 조용히 끝낸다.
- 최종 수치:
  - `pnpm -C packages/cli test`: `tsc --noEmit` 오류 0, vitest 8파일 129개 통과.
  - `python3 -m unittest tests.test_cli_parity`: 9개 OK(동일성 4 · 번들 5), 조합 24개, 59초(스레드 4개).
  - 번들 `dist/cli.js` 66,436바이트(gzip 19,813바이트), 플러그인 사본과 바이트가 같다.
  - `python3 -m unittest tests.test_generated`: 10개 OK.
  - 전체 시험 `python3 -m unittest discover -s tests -p "test_*.py"`: `Ran 31 tests in 315.671s` · `OK`.
