---
key: HK-22
area: release
type: feat
title: v1 → v2 이전 · 릴리스 스크립트 · 두 구성 e2e · knots · hdr 복사본 실측
state: check
created: 2026-11-24
---

# Tasks — HK-22a

| ID | 할 일 | 요구 | 상태 |
|---|---|---|---|
| T1 | `scripts/release.sh` + `CHANGELOG.md` + `tests/test_release.py` | MG-R8 · R9 | done |
| T2 | 다섯 값(과 원본 매니페스트 둘)을 `2.0.0-alpha.0` 으로 맞춤 — update.sh 가 읽는 plugin.json 이 1.0.8 이던 것 | MG-R8 | done |
| T3 | 두 구성 e2e: 샌드박스 · 구성 A · B 두 설치 순서 · 대본 에이전트 · 가짜 도구 · E1 E5 E6, S3~S9 · E2 E3 E4 E9 코드 | MG-R7 | done(S3~S9 는 아래 "실행 못 한 것") |
| T4 | 모듈별 세션 적재량 기록(실제 도구) | design 10 §3.7 | done |
| T5 | MG-R10 · R11 확인, v1 SDD 배치 5개 시험 | MG-R10 · R11 | done |
| T6 | AI-DLC Intent 의 intent 게이트 승인 고침(e2e 가 찾음) | MG-R7 | done |
| T7 | knots · hdr 복사본 실측 | §3.2 · §3.3 | done |
| T8 | 이전 안내서 `docs/migration-guide.md` | §3.1 · §3.8 | done |
| T9 | 생성물 · 전체 시험 · 기록 | 완료 기준 | done |

## MG-R 결과

| 요구 | 결과 | 근거 |
|---|---|---|
| MG-R7 | **부분**. 구성 A · B(두 설치 순서) 설치 · doctor · `intent.py check` · E1 · E5 · E6 은 stub · real 모두 통과. S3 이후(승인 API 필요: E2 · E3 · E4 · E9, S4~S9)는 에이전트 세션 안이라 서버가 읽기 전용이라 `skip` 으로 기록 — 코드는 있고 **사람 터미널 · CI 에서 돌려야 한다**. E8 은 안 만들었다(D10) | `tests/e2e/two_configs.py`, `tests/e2e/test_two_configs.py` 5개 |
| MG-R8 | 통과. 다섯 값(+원본 둘)을 한 번에 바꾸고 `--check` 가 다르면 exit 1, 쓴 줄이 `"version"` 한 줄뿐이 아니면 되돌린다 | `test_release.py` 17개(임시 리포 15 + 실제 값 2) |
| MG-R9 | 통과. 로컬 주석 태그만 만들고 push 하지 않는다(시험이 스크립트의 `git push` 가 안내 문구에만 있음을 본다) | `test_release.py` |
| MG-R10 | 있다. v1 lock → v2(HK-25 시험 + knots 복사본에서 실제로 바꿈), v1 SDD 배치 읽기(5개) | design.md §5 |
| MG-R11 | 있다. `kit.sh` 가 Node 없을 때 `setup.sh` · `update.sh` · `add-agent.sh` 로 내려간다 | `test_kit_wrapper.py` |

완료 기준(설계 11 §5): 5(dry-run · `--check`) 통과, 6(`git diff HEAD~1 --stat` 이 다섯 파일 + 생성물뿐, 바뀐 줄은 `"version"` 한 줄) 통과 — `test_release` 와 `test_generated`, 7(v1 1.0.7 fixture 의 `update` + 이슈 5개) 통과, 1 · 2 · 3 · 4 는 아래.

## 두 구성 e2e 결과

실행: `python3 tests/e2e/two_configs.py --mode stub|real`(각각 세 구성 합계 약 25초 · 약 30초, 일회용 HOME).

| 판정 | 내용 | stub | real |
|---|---|---|---|
| 설치 순서 | A · B-forward(킷 → aidlc → entire) · B-reverse(entire → aidlc → 킷 `init`) 뒤 `doctor --check` exit 0 | 통과 | 통과 |
| `intent.py check`(S2) | A 는 대본 intent.md · units.json, B 는 AI-DLC 산출물 → `sync aidlc` | 통과 | 통과 |
| E1 | units.json 키 집합이 A · B 에서 같다 | 통과 | 통과 |
| E5 | `update` · `repair` · `uninstall`(복사본) 뒤 외부 파일 · 훅 항목 sha256 불변(stub: 파일 8 · 훅 4, real: 파일 405 · 훅 27) | 통과 | 통과 |
| E6 | `remove entire` → `remove aidlc` 뒤 외부 파일 불변 · lock 의 외부 항목 0 · `flow` kit/none · modules `[]` | 통과 | 통과 |
| 실제 홈 불변 | 전역 `core.hooksPath` · `~/.gitconfig` · `~/.claude/settings.json` sha256 | — | 통과 |
| E2 E3 E4 E9 · S3~S9 | 승인 API 필요 | 건너뜀 | 건너뜀 |
| E7 | 진행 탭과 보드 일치 | 만들지 않음(HK-17 `overview.test.ts` · `v1-sdd-layout.test.ts` 가 같은 비교를 한다) | — |
| E8 | 운영 기록 → intake | 만들지 않음 | — |

### 모듈별 세션 적재량(실제 도구 aidlc 2.11.4 · entire 0.13.4, 하네스 claude, `doctor --json` 의 `load`)

| 구성 | kit | external:aidlc | external:entire | 합계 |
|---|---|---|---|---|
| A 킷만 | 10,189 B · 훅 13 | — | — | 10,189 B |
| B 킷 + AI-DLC + Entire | 10,189 B · 훅 14 | 73,333 B · 훅 17 (규칙 1 · 스킬 설명 43 · 에이전트 설명 14 · 진입 파일 9) | 0 B · 훅 10 | 83,522 B (추정 약 27,800토큰) |

- AI-DLC 가 더하는 것: 73,333바이트 + 훅 17개 + 킷 쪽 `harness-aidlc-freshness` Stop 훅 1개(최대 512바이트, 새 산출물이 있을 때만). Entire: 글 0바이트, 훅 10개(구현 하네스 하나에만).
- 두 설치 순서의 값이 같다. codex 는 킷만(8,361 B · 훅 8) — 두 도구는 claude 에만 켠다.
- 릴리스 노트에는 `python3 tests/e2e/two_configs.py --mode real --json-out <파일>` 의 `measurements.load` 를 붙인다.

### 실행 못 한 것

이 이슈를 만든 세션은 에이전트 세션이라 대시보드 서버가 `읽기 전용(부모 프로세스 claude)` 로 떠 승인 API(PIN)가 닫혀 있었다. 판정을 피하지 않고(부모를 끊는 방식은 쓰지 않았다) 그 단계들을 `skip` 으로 기록했다. 코드는 `tests/e2e/scenario.py`(S3 · S4) · `deliver.py`(S5~S9)에 있고, 앞 조건을 알 수 없는 승인(`mr` · `done` · `deploy`)은 fixture 를 추정으로 만들어 첫 실행에서 실패할 수 있다.

## knots · hdr 복사본 실측(2026-11-24)

방법: 원본은 읽기만. `git clone --no-hardlinks` 로 `/tmp/hk22/copies/` 에 복사 → 일회용 HOME · `HARNESS_KIT_CONFIG_DIR` 로 `doctor` → `update --dry-run` → 적용(복사본). 원본 쓰기 0, `git worktree add` 안 함. 복사본은 이 작업이 끝날 때 지웠다.

| | knots-platform | hr-vision-3d(hdr) |
|---|---|---|
| 원본 | `~/developments/drimaes/knots-platform` | `~/developments/drimaes/hdr-vision-3d/hr-vision-3d-parent` |
| 복사본 기준 | 브랜치 `feat/speech-recognition-redesign` 의 커밋 `66ac2824a`(`develop` 아님) | 브랜치 `dev` 의 커밋 `acb669d` |
| 킷 판 | 1.0.7, v1 lock(TSV) | 없음(손으로 만든 하네스) |

### knots — K1 `doctor` → K2 `update`

| 항목 | 값 |
|---|---|
| `doctor`(읽기 전용, exit 0) | lock-v1 · version-mismatch(1.0.7 → 2.0.0-alpha.0) · drifted 100 · missing 7 · 오류 13 · 경고 2 · 정보 102 · 배치 오류 6. 하네스 설정에 `external:aidlc` 훅 17개(`external-hooks-left`) |
| `update --dry-run` 계획 | new 141 · update 0 · same 69 · **conflict 47** · orphan 2 · skip-user 53 |
| 적용(복사본, exit 4 = 사람 판단 필요) | 바뀐 기존 파일 5개(`.agents/harness-kit.json` · lock · `.claude/settings.json` · `.codex/config.toml` · `.codex/hooks.json`), **`.new` 48개**(리포 `.gitignore` 가 `*.new` 를 무시해 `git status` · `git ls-files --others` 에는 안 보인다 — `find` 로 센다). AI-DLC 관련 변경 0 |
| 적용 뒤 `doctor --check`(exit 1) | ok 210 · drifted 93 · missing 1 · 오류 7 · 경고 49 · 정보 94 — `.new` 병합 전 상태 |
| `board.sh` | 이전 전후 출력 같음 |
| 세션 적재량(claude) | 61,957 → **76,079 B**(kit 13,083 → 27,205, user 48,874 그대로), 훅 20 → 30(aidlc 17 그대로, kit 3 → 13) |
| 세션 적재량(codex · kiro) | 13,749 → 14,751 B · 34,054 → 56,420 B |
| 진입 파일 | `AGENTS.md` 12,360 + `CLAUDE.md` 723 B 그대로(`.new` 에 새 판이 있다) |

해석: 설계 11 K1 이 말한 "`foreign` 362 · 배포 단위 23곳"은 이 브랜치 복사본에서는 나오지 않는다 — `foreign` 이라는 상태가 CLI 에 없고(AI-DLC 파일은 `add aidlc` 전에는 `user` 소유로 보인다), `scripts/sync.py` · `units.json` 이 이 브랜치에 없다. 늘어난 적재량은 킷 스킬 설명 15 · 역할 6 · 규칙 복사본이 `.claude/` 로 생기는 것이다(v1 설치본은 `.claude/skills` 가 없었다). 세션 적재량 증가는 토큰 원칙상 눈에 띄는 숫자라 이전 MR 에 적고 사람이 받아들이게 한다. 승인 전 점검에서 `update --dry-run --json` 의 `counts` 와 `doctor --json` 의 `load` 를 같이 붙인다.

### hdr — H1 `init --adopt`

| 항목 | 값 |
|---|---|
| `init --adopt --dry-run`(exit 0) | 생성 304 · 교체 0 · 건너뜀(사람 파일) 4 — `.gitignore` · `AGENTS.md` · `ARCHITECTURE.md` · `README.md` · 하네스 제외 2 · 배치 create 47 · merge 1 |
| 적용(복사본) | 새 파일 50, 바뀐 기존 파일 **2개**: `CLAUDE.md`(킷 블록 병합, 380 → 1,136 B) · `.agents/docs/product-specs/index.md`(보드 블록 6줄 덧붙음) — 설계 11 H1 의 "기존 파일 sha256 변경 0건"과 다르다 |
| `doctor --check` | exit 0, 경고 1(`.gitignore` 에 `.agents/state/` · `.agents/local/` · `.agents/reports/` 없음) |
| 세션 적재량(claude) | 진입 파일 6,715(`AGENTS.md` 6,335 + `CLAUDE.md` 380) → 23,054 B(kit 16,719 + user 6,335), 훅 0 → 13 |
| `.new` | 0개 |
| 스택 | `--stack python` 으로 쟀다(hdr 의 실제 스택 판단은 사람이). 하네스는 claude 만 |

## 시험 결과

| 시험 | 결과 |
|---|---|
| `pnpm -C packages/cli test`(tsc + vitest) | 41 파일 · 486 통과 |
| `pnpm -C packages/dashboard test` | 20 파일 · 158 중 155 통과 + 시간 초과 3(`overview` 1 · `projects` 2, 기계가 바빠 60초 제한 — 두 파일을 단독으로 다시 돌려 8 통과) |
| 킷 python 전체 `unittest discover -s tests -p "test_*.py"` | 137 중 136 통과 + 오류 1(`test_install.test_harness_scripts_suite_passes_in_install` 의 설치본 시험이 1,200초 제한 초과 — 다른 에이전트의 시험이 동시에 돌았다. 같은 시험을 단독으로 돌려 아래 669 통과). 2,150초 |
| 설치본 시험(`<설치>/scripts/tests`) | 669 통과(1,327초) |
| `node scripts/gen-plugins.mjs --check` | 생성물 일치(파일 477개) |
| `python3 -m unittest tests.test_release tests.test_generated` | 27 통과 |
| `python3 -m unittest discover -s tests/e2e -p "test_*.py"` | 5 통과(stub, 약 13초) |
| `python3 tests/e2e/two_configs.py --mode real` | 통과 19 · 실패 0 · 건너뜀 7 |
| 새 dashboard 시험 `intent-aidlc-gate` 3 · `v1-sdd-layout` 2 | 통과 |

## 건드린 공유 파일

`packages/dashboard/src/flow.ts` · `packages/dashboard/src/writers/approvals.ts`(intent 게이트가 `intent.json` 을 대상으로 읽는 만큼, 두 곳 약 20줄), 생성물 `plugins/harness-kit/**`(번들 · 매니페스트 버전). 템플릿 파일은 바꾸지 않아 `manifest.md` 수는 그대로다.

### 통합 브랜치에 합친 뒤(2026-11-24)

킷 쪽 바뀐 곳이 문서 두 커밋뿐이라 무거운 묶음(킷 python · 설치본)은 위 결과를 그대로 쓰고, 바뀐 곳에 닿는 시험만 다시 돌렸다.

| 시험 | 결과 |
|---|---|
| `node scripts/gen-plugins.mjs --check` | 생성물 일치(477개) |
| `pnpm -C packages/dashboard test` | 158 중 157 통과 · 1 시간 초과(`projects.test.ts --root`, 부하) — 그 파일만 다시 돌려 4 통과 |
| `tests.test_release` + `tests.test_generated` | 27 통과 |
| e2e stub `unittest`(`pnpm test:e2e` 로 새로 묶음 — 킷 `discover -s tests` 는 `tests/e2e` 를 줍지 않는다) | 5 통과 |

## HK-22b 이름 바꾸기

| ID | 작업 | 근거 | 상태 |
|---|---|---|---|
| T-B1 | 기계적 이름 바꾸기(471개 파일 내용 · 47개 파일 이동 · 플러그인 폴더 `plugins/kns`) | design §7 | done |
| T-B2 | 옛 상태 파일 · schema 읽기, 쓰기 명령이 새 이름으로 옮기기, `doctor legacy-names`, 고치지 않은 `hx-*` 킷 스킬 지우기 | design §7 | done |
| T-B3 | Node 없는 경로(`update.sh` · `add-agent.sh` · `setup.sh`)의 옛 상태 파일 옮기기 | design §7 | done |
| T-B4 | Kiro 설치기 `kns-<명령>` · 옛 설치 치우기, 플러그인 `commands/` 빼기 | design §7 | done |
| T-B5 | `check_external.py` | 설계 11 §3.9 | done |
| T-B6 | README · CHANGELOG · 이전 안내서 1.1 · ROADMAP | — | done |
| T-B7 | 전체 시험 | — | 진행 |

새 시험: `packages/cli/test/legacy-names.test.ts`(5개 — doctor 는 옮기지 않음 · update 가 옮김 · init 은 옛 메타를 설치로 봄 · hx- 스킬 지움/남김), `tests/test_install.py::test_update_moves_legacy_state_names`(update.sh), `tests/harness_scripts/test_check_external.py`(3개).
