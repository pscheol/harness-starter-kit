---
key: HK-22
area: release
type: feat
title: v1 → v2 이전 · 릴리스 스크립트 · 두 구성 e2e · knots · hdr 복사본 실측
status: in-review
created: 2026-11-24
---

# Design — HK-22a (릴리스 스크립트 · 두 구성 e2e · 이전 안내서 · 복사본 실측)

근거: [requirements](requirements.md), [설계 11](../../../../docs/design/11-migration-and-release.md) MG-R1~R11 · §3.1~§3.9 · §5, [13](../../../../docs/design/13-aidlc-coverage.md), [10](../../../../docs/design/10-modules.md) §3.7. 선행: HK-19 · HK-26 · HK-20a · HK-21(통합 브랜치 `3ba69e3`).

이름은 아직 바꾸지 않았다(`harness-kit` · `hx-`). 제품 이름 바꾸기는 따로 한다.

## 1. 범위

| 이 이슈 | 이 이슈가 아닌 것 |
|---|---|
| MG-R8 · R9 `scripts/release.sh`, 다섯 값 맞추기, `CHANGELOG.md` | 실제 knots · hdr 리포 이전(공지로 나중에, 사람이 한다) |
| MG-R7 두 구성 e2e(`tests/e2e/`) · 모듈별 세션 적재량 기록 | `e2e-real` 을 CI 러너에 까는 방법(설계 11 §6) |
| MG-R10 · R11 확인 · 시험 보태기 | HK-20b(jira-workflow v2 · notion · multi-harness) |
| §3.2 · §3.3 복사본 실측, 이전 안내서(`docs/migration-guide.md`) | `check_external.py`(설계 11 §3.9, 없다 — 안내서에 대체 방법) |

## 2. 파일

| 자리 | 내용 |
|---|---|
| `scripts/release.sh` | `<버전> [--dry-run] [--no-commit]` · `--check`. 단계는 설계 11 §3.5 그대로(§3 편차 표) |
| `CHANGELOG.md` | `## <버전>` 절이 없으면 release 가 멈춘다 |
| `tests/test_release.py` | 임시 git 리포에서 15개(`--check` · `--dry-run` · 쓰기 · 커밋 · 태그 · 실패 경로) + 이 리포의 실제 다섯 값이 같은지 · update.sh 와 CLI 가 같은 판을 읽는지 2개 |
| `tests/e2e/two_configs.py` | 진입점. `--mode stub|real` · `--config` · `--json-out` · `--keep` |
| `tests/e2e/{sandbox,flow,scenario,deliver}.py` | 일회용 HOME · 리포 · 대시보드 · API(sandbox) / 구성 하나의 순서와 E1 · E2 비교(flow) / S0~S4(scenario) / S5~S9(deliver) |
| `tests/e2e/fixtures/` | `requirement.md`(스토리 6 · 도메인 2 · 외부 통합 1) · `make_sample_repo.py`(python 스택, 패키지 2 · 시험 10) · `scripted.py`(대본 에이전트가 쓰는 파일 · AI-DLC 산출물) |
| `tests/e2e/stubs/{aidlc,entire}` | 가짜 도구(받은 인자를 `$E2E_LOG` 에 적고 알려진 모양의 파일 · 훅을 만든다) |
| `tests/e2e/test_two_configs.py` | `unittest` 로 stub 모드 전체를 돌려 실패 0 · 구성별 판정을 본다(일반 시험에는 들어가지 않는다) |
| `packages/dashboard/test/v1-sdd-layout.test.ts` | v1 SDD 배치 이슈 5개가 진행 목록에 보인다(MG-R10) |
| `packages/dashboard/src/{flow.ts,writers/approvals.ts}` · `test/intent-aidlc-gate.test.ts` | AI-DLC Intent(intent.json 만 있음)의 intent 게이트 승인(§4 발견 1) |
| `docs/migration-guide.md` | 사람이 따라 하는 이전 안내서(§3.1 공통 절차 · §3.8 되돌리기 · 리포별 순서) |

## 3. 설계와 다르게 한 것

| # | 설계 | 이 이슈 | 이유 |
|---|---|---|---|
| D1 | release 가 `plugins/harness-kit/**` 두 매니페스트의 `.version` 을 바꾼다 | 원본 `packages/plugin/**` 두 매니페스트도 같이 바꾸고, `--check` 가 일곱 값을 본다 | `plugins/` 는 생성물이라 원본을 안 바꾸면 `gen-plugins.mjs` 가 되돌린다 |
| D2 | 새 버전은 지금 버전보다 커야 한다 | 값이 갈라져 있을 때만 같은 값을 허용(맞추기) | update.sh 가 읽는 plugin.json 이 1.0.8, CLI 는 2.0.0-alpha.0 이던 것을 같은 값으로 맞추려면 필요했다. 값이 같으면 같은 버전은 거절한다 |
| D3 | `--dry-run` 은 1~4 를 한다 | 작업 트리 · 브랜치 · CHANGELOG 문제는 경고만 하고 exit 0 | 완료 기준 5(`9.9.9 --dry-run` 이 계획을 출력)가 어느 브랜치 · 어느 작업 트리에서도 돌아야 한다. 실제 실행은 exit 3 · 1 |
| D4 | 4a `pnpm -r build` 뒤 `gen-plugins` | 기본 `pnpm -s gen`(= build:ui + build + gen-plugins) | 루트 스크립트가 이미 그 순서다. `HK_RELEASE_BUILD_CMD` 로 바꾼다(시험용) |
| D5 | (없음) | `--no-commit` 추가, 환경 변수 `HK_RELEASE_BUILD_CMD` · `HK_RELEASE_TEST_CMD` · `HK_RELEASE_ANY_BRANCH` · `HK_RELEASE_ROOT` | 값 맞추기를 커밋 · 태그 없이 하고(이 이슈 커밋 `chore: 다섯 버전 값을…`), 시험이 35분짜리 전체 시험을 부르지 않게 하려고 |
| D6 | 태그를 만든다 | 주석 태그 `v<버전>` 을 **로컬**에 만들기만 한다 | MG-R9. push 는 마지막 줄 안내 문구에만 있고 시험이 그것을 본다 |
| D7 | e2e 는 `tests/e2e/test_two_configs.py` 하나 | `two_configs.py`(진입 · 보고서) + `test_two_configs.py`(unittest 껍데기) | 보고서(JSON)와 모듈별 적재량 표를 릴리스 노트에 붙여야 해서 |
| D8 | S2 B: AI-DLC 산출물 fixture → `sync aidlc` | `intake` 가 만든 킷용 `intent.md` · `questions.md` 틀을 사람이 지운다 | `flow.design = aidlc` 인데도 `intake` 가 킷 설계 틀을 만들고, 그 틀과 `intent.json` 이 같이 있으면 `intent.py check` 가 빈 틀을 검사해 실패한다. **킷 쪽 보완 후보**(§4 발견 2) |
| D9 | E4 체크포인트는 구현 하네스 커밋에만 | stub 모드만 본다(가짜 entire 가 구현 커밋에 ref 를 만든다). real 모드는 건너뜀 | 실제 Entire 체크포인트는 Claude Code 세션 훅이 만든다. 대본 에이전트는 훅을 부르지 못한다 |
| D10 | E8(운영 기록 → `intake --from ops:`) | 이 판의 e2e 는 돌리지 않는다(건너뜀으로 기록) | 운영 기록 fixture(출처 있는 실측 값 · NX 행)를 만드는 데 시간이 더 든다. 후속 |
| D11 | E5 의 "외부 파일 sha256 불변" | `.entire/logs/` 는 제외 | Entire 가 돌 때마다 스스로 쓰는 실행 기록이다. 역순 설치에서는 `add` 때 이미 있어 lock 에 외부 소유로 잡혀 매번 달라진다(§4 발견 3) |
| D12 | S3~S9 승인은 대시보드 서버 + PIN 으로 | 에이전트 세션 안에서 돌리면 서버가 읽기 전용이라 S3 이후를 `skip` 으로 기록한다 | 승인 API 를 에이전트가 쓰지 못하게 한 DB-R22 를 피하지 않는다. **사람 터미널 · CI 에서 돌려야 S3~S9(E2 · E3 · E4 · E9 포함)가 실행된다** |

## 4. e2e 로 찾은 것

1. **AI-DLC Intent 는 intent 게이트를 승인할 방법이 없었다.** 관리 페이지 승인 API 가 `intent.md` 가 없으면 404 였고, 진행 모델(`flow.ts`)도 `intent.md` 만 읽어 승인 상태가 영원히 `none` 이었다. 터미널 `approve.py` 는 intent 게이트를 관리 페이지와 같은 처리로 미룬다. `from_unit.py` 는 이미 `intent.json` 을 대상으로 읽는다. → 승인 API 와 진행 모델이 `intent.md` 가 없고 `intent.json` 이 있으면 그 파일(sha256)을 대상으로 하게 고쳤다(머리 status 는 쓰지 않는다). 시험 `intent-aidlc-gate.test.ts` 3개.
2. `flow.design = aidlc` 인데도 `harness-kit intake` 가 `intent.md` · `questions.md` 틀을 만든다. `sync aidlc` 뒤에 둘이 같이 있으면 `intent.py check` 가 빈 틀을 검사한다. 이 e2e 는 사람이 틀을 지우는 것으로 우회했다(D8). 보완 후보: aidlc 일 때 intake 는 `intake.md` 만 만든다. 이 이슈에서는 고치지 않았다.
3. `.entire/**` 가 `externalPaths` 라 Entire 의 실행 기록(`.entire/logs/entire.log`)이 외부 소유로 등록되고, 킷 명령과 무관하게 커밋마다 바뀐다. `external-hooks-left` · 스냅숏 비교에서 거짓 양성이 된다. 보완 후보: `externalPaths` 에서 `.entire/logs/**` 제외.
4. 실제 Entire 는 비대화형에서 git 신원(전역 `user.name` · `user.email`)이 없으면 `enable` 이 실패한다. e2e 는 일회용 `GIT_CONFIG_GLOBAL` 에 신원을 둔다. 이전에 실제 홈으로 돌려 전역 훅 폴더가 바뀐 일은 이 환경에서는 일어나지 않는다(전역 `core.hooksPath` 는 바뀌지 않았다 — 시험 끝에 실제 전역 설정 · `~/.claude/settings.json` sha256 이 같음을 본다).
5. 복사본 실측(§tasks.md): `init --adopt` 가 기존 파일 두 개(`CLAUDE.md` 킷 블록 병합, `.agents/docs/product-specs/index.md` 보드 블록 덧붙임)를 바꾼다. 설계 11 H1 의 "기존 파일 sha256 변경 0건"과 다르다 — 안내서에 적었다.
6. 리포 `.gitignore` 가 `*.new` 를 무시하면 설계 11 §3.9 의 `.new` 점검 명령(`git ls-files --others --exclude-standard '*.new'`)이 항상 0줄이다(knots 복사본). 안내서는 `find` 를 쓴다.

## 5. 호환(MG-R10 · R11) 확인

| 요구 | 확인 | 근거 |
|---|---|---|
| MG-R10 v1 lock(TSV) → v2 | 있다(HK-25) | `legacy-lock.test.ts` · `v1-first-update.test.ts` · `v1-merge.test.ts` · `test_cli_update_parity` · knots 복사본에서 `update` 가 "메타 v1 · lock v1 → 2.0.0-alpha.0" 으로 바꿨다 |
| MG-R10 v1 SDD 배치 읽기 | 있다(HK-9 · HK-3) · 5개 시험을 보탰다 | `v1-sdd-layout.test.ts`(5개 상태가 board 와 같다 · 승인 API 가 옛 키로 쓰지 않는다), `overview.test.ts` |
| MG-R11 Node 없는 환경 `setup.sh` | 있다(HK-12) | `tests/test_kit_wrapper.py`(`--which` · 내려가는 갈래 · CLI 전용 플래그 exit 2) — 이번에 `update.sh` 가 읽는 plugin.json 판이 CLI 와 같아졌다(`tests/test_release.py`) |

## 6. 사람이 확인할 것

- **승인 API 가 열리는 사람 터미널 · CI 에서 `python3 tests/e2e/two_configs.py --mode stub` 와 `--mode real` 을 한 번씩 돌려, S3~S9(E2 · E3 · E4 · E9)의 결과를 본다.** 이 이슈를 만든 세션은 에이전트 세션이라 그 단계들이 `skip` 이었다. 특히 `mr` · `done` · `deploy` 승인의 앞 조건은 fixture 를 추정으로 만들어 첫 실행에서 실패할 수 있다(실패 이유가 `note` 에 나온다).
- `release.sh` 를 실제로 한 번 돌려 보기(`HK_RELEASE_*` 없이): 커밋 · 로컬 태그까지 가고 push 는 하지 않는다.
- 복사본이 `feat/speech-recognition-redesign` 의 마지막 커밋이라 knots 에서 `sync.py` · `units.json` 이 없다(설계 11 K3 의 23곳 비교는 하지 못했다). `develop` 기준으로 다시 본다.
