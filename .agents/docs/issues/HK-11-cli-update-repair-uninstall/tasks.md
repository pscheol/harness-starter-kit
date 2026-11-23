---
key: HK-11
area: cli
type: feat
title: CLI update(3방향 비교) · repair · uninstall
state: completed
created: 2026-11-23
---

# Tasks — HK-11

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 단위 시험 작성(RED): `update.test.ts` · `repair.test.ts` · `uninstall.test.ts`, `cli.test.ts` 예약 목록 | R3.1~R3.4 · R5.1 · R6.1 · R8.2 | 실패 수 기록 | done |
| T2 | `tests/test_cli_update_parity.py` 작성(RED) | R7.2 · R3.2 | 실패 수 기록 | done |
| T3 | core: `installed` · `update-plan` · `remove`, `plan` · `meta` · `selection` 손질 | R3.1~R3.3 · R5.1 · R6.1 | 단위 시험 | done |
| T4 | 명령: `update` · `repair` · `uninstall`, 인자 · 등록 · 안내 문구 | R3.4 · R6.1 · R8.2 | 단위 시험 | done |
| T5 | 동일성 시험 GREEN(조합 6개) | R7.2 · R3.2 | 시험 통과 | done |
| T6 | 번들 · 플러그인 생성물 갱신 | — | `gen-plugins.mjs --check` 일치 | done |
| T7 | 전체 시험 | — | `Ran N tests … OK` | done |

## 요구사항별 확인

| 요구 | 시험 |
|---|---|
| R3.1 | `update.test.ts` 판정 1~3(update · new · conflict `.new` · `--accept-all` `.bak`), 동일성 #2 · #6 |
| R3.2 | `update.test.ts` v1 lock · v1 메타(모르는 키 · v1 백업 · doctor), 동일성 #1~#6(setup.sh 설치 → CLI update, lock v2 · 메타 v2) |
| R3.3 | `update.test.ts` user · external · pack · `--forget` · orphan · `--prune`, 동일성 #4 · #5 |
| R3.4 | `update.test.ts` `--dry-run` 쓰기 0 · exit 4 · `diff -u` 목록 |
| R5.1 | `repair.test.ts` 9개 |
| R6.1 | `uninstall.test.ts` 10개, `update.test.ts` 설계 02 §5 완료 기준 3 |
| R7.2 | `tests/test_cli_update_parity.py` 조합 6개 |
| R8.2 | 세 명령 `--json` 출력이 stdout JSON 하나, stderr 0바이트(단위 · 동일성 시험이 본다). 킷은 모델을 부르지 않는다(런타임 의존 0, `node:` 모듈만) |

## 검증 기록

- T1 RED: vitest 11파일 165개 중 39개 실패 · 126개 통과. 실패 39개 = update 17 · uninstall 10 · repair 9 · `cli.test.ts` 예약 명령 아님 3. 모두 `'update' 는 아직 없다`(exit 2)로 멈춘다. `tsc --noEmit` 오류 0.
- T2 RED: `test_cli_update_parity` 6개 전부 실패(CLI exit 2, 예약 명령). update.sh 쪽은 6개 모두 exit 0.
- T3 · T4 GREEN: vitest 11파일 165개 통과, `tsc --noEmit` 오류 0.
- T5 GREEN: `test_cli_update_parity` 6개 통과(31초, 스레드 4개).
- T5 변이 확인: `.new`를 실행 비트로 쓰게 바꾸면 #2가 `권한 비트` 2건(`0o644≠0o755`)으로 실패한다. 되돌린 뒤 소스 해시가 같다(`1be7cc4050d9`).
- T6: 번들 `dist/cli.js` 101,084바이트(gzip 28,444바이트, HK-8 66,436바이트에서 +34,648). `node scripts/gen-plugins.mjs --check` → `생성물 일치: 파일 493개`.
- 손으로 본 사람용 출력(실제 템플릿, 고친 규칙 1개 · 지운 규칙 1개): `update --dry-run` exit 4(conflict 1 · restore 1 · same 214, `diff -u` 한 줄), `repair` exit 0(restore 1 · drifted 1), `uninstall --dry-run --quiet` exit 4(지움 218 · 남김 1).
- 최종 수치:
  - `pnpm -C packages/cli test`: `tsc --noEmit` 오류 0, vitest 11파일 165개 통과.
  - `python3 -m unittest tests.test_cli_update_parity tests.test_cli_parity tests.test_generated`: `Ran 25 tests in 86.816s` · `OK`.
  - 전체 시험 `python3 -m unittest discover -s tests -p "test_*.py"`: `Ran 43 tests in 461.255s` · `OK`.
