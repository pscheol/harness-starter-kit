---
key: HK-12
area: cli
type: feat
title: CLI add · remove · outdated와 플러그인 스킬의 CLI 호출
state: completed
created: 2026-11-23
---

# Tasks — HK-12

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | R12.6 재현 기록(setup.sh → update.sh · CLI update) | R12.6 | 출력 기록 | done |
| T2 | 단위 시험(RED): `add` · `remove` · `outdated` · `legacy-lock`, `update` 보드, `cli` 예약 목록 | R12.1~R12.3 · R12.5 · R12.6 · R12.9 | 실패 수 기록 | done |
| T3 | Python 시험(RED): add · remove 동일성, update 동일성 7~10, install 동일성 12의 lock, test_install 미리 있는 파일, kit.sh, 문구 · README · 스킬 절차 | R12.1 · R12.2 · R12.4 · R12.6~R12.9 | 실패 수 기록 | done |
| T4 | setup.sh · update.sh · add-agent.sh · harness-lib.sh(표시 줄 · `-` · `--modules=`) | R12.6 · R12.1 | test_install · 동일성 | done |
| T5 | CLI core: `selection-change` · `legacy-lock` · `git` · `board`, lock · installed 손질 | R12.1~R12.3 · R12.6 · R12.9 | 단위 시험 | done |
| T6 | CLI 명령: `add` · `remove` · `outdated`, update · uninstall 손질, 인자 · 등록 | R12.1~R12.3 · R12.5 | 단위 시험 | done |
| T7 | `kit.sh` · SKILL.md 3종 · 커맨드 3종 | R12.4 · R12.5 | test_kit_wrapper · 문구 시험 | done |
| T8 | 진입 파일 · 안내 문구, README 표 | R12.7 · R12.8 | 문구 시험 · 크기 | done |
| T9 | 번들 · 플러그인 생성물, 전체 시험 | — | `gen-plugins.mjs --check` 일치 · `Ran N tests … OK` | done |

## 요구사항별 확인

| 요구 | 시험 |
|---|---|
| R12.1 | `add.test.ts` 15개, `test_cli_addremove_parity` A1~A4 |
| R12.2 | `remove.test.ts` 11개, `test_cli_addremove_parity` R1 · R2 |
| R12.3 | `outdated.test.ts` 6개(로컬 bare 저장소, 네트워크 없음) |
| R12.4 | `test_kit_wrapper` 6개, `test_template_wording.SkillProcedureTest` |
| R12.5 | 새 명령 `--json` = stdout JSON 하나 · stderr 0바이트(단위 · 동일성), `description` 바이트 수 시험, 런타임 의존 0(`test_cli_parity.CliBundleTest`) |
| R12.6 | `legacy-lock.test.ts` 7개, `test_install` 2개, `test_cli_parity` 조합 12(+ 26조합 표시 줄), `test_cli_update_parity` 9 · 10, `test_cli_addremove_parity` A2 |
| R12.7 | `test_template_wording.FullBeforeCommitTest` 3개 |
| R12.8 | `test_template_wording.ReadmeCountTest` |
| R12.9 | `update.test.ts` 보드 3개, `test_cli_update_parity` 7 · 8 |

## 검증 기록

### T1 재현(d385454, 고치기 전)

`AGENTS.md`(`# 손으로 쓴 AGENTS`)를 미리 둔 폴더에 `setup.sh --stack=python --agents=claude`:

- lock 줄 `d81375ec…6ec3 python core AGENTS.md`(탭 구분) — 해시가 그 사람 파일의 sha256과 같다.
- `update.sh --dry-run` → `update    AGENTS.md`(사람 파일을 킷 판으로 바꾼다).
- 같은 리포 사본에 CLI `update --dry-run --json` → `{"path": "AGENTS.md", "owner": "kit", "action": "update"}`.
- CLI `init`으로 깐 같은 폴더는 lock `{"owner": "user", "sha256": null}`, `update` → `skip-user`(HK-8부터 지킨다).

### RED(구현 전, 커밋 `5a5a247`의 시험 · `1ef1c3f`의 구현)

- vitest: 15파일 208개 중 41개 실패 · 167개 통과. 실패 = add 14 · remove 10 · outdated 6 · legacy-lock 5 · cli 3 · update(보드) 3. 모두 `'add' 는 아직 없다`(exit 2) · `board` 없음 · `ambiguous` 없음으로 멈춘다. legacy-lock의 "표시 줄 있음" · "init 미리 있던 파일" 2개는 이미 통과했다(CLI는 `-` · `owner: user`를 덮지 않는다).
- Python(`tests.test_cli_addremove_parity` · `test_cli_update_parity` · `test_kit_wrapper` · `test_cli_parity.CliParityTest` · `test_install` 새 2개): `Ran 31 tests in 182.447s` · `FAILED (failures=55)`.
  - addremove 6(CLI exit 2, add-agent.sh `--modules=` 모름) · update 동일성 3(#8 보드 · #9 · #10 — #7 platform-guards는 이미 통과) · cli_parity 26(하위 시험, 조합 26개 모두 lock 둘째 줄 표시 줄 없음 · #12 `-` 아님) · install 2(미리 있던 `AGENTS.md`가 update로 바뀐다) · kit_wrapper 18(하위 시험 포함, `kit.sh` 없음).
- `tests.test_template_wording`: 11개 중 실패 14(하위 시험): 문형 1(11곳) · 패턴 1 · 진입 파일 5 · README 1 · 스킬 절차 6.

### GREEN

- vitest: `tsc --noEmit` 오류 0, 15파일 208개 통과(새 파일 add 15 · remove 11 · outdated 6 · legacy-lock 7, update 보드 3 · cli 3 더함).
- `tests.test_cli_addremove_parity` 6개 · `tests.test_cli_update_parity` 10개: `Ran 16 tests in 101.386s`.
  - GREEN 중 시험 기대값 두 곳을 고쳤다. R2: 남긴 수정 파일의 상위 폴더(`.cursor` · `.cursor/commands`)는 새 설치에 없다 — 비교에서 뺀다. #8: 옛 형식 보드는 킷 파일 `specs-index.md`를 고친 것이라 update.sh · CLI 모두 `.new`를 받는다 — CLI exit 0이 아니라 4가 맞다(두 트리는 같다).
- `tests.test_kit_wrapper` 6개 OK. 첫 GREEN에서 1개 실패(legacy 갈래가 플래그 오류를 낼 때 안내 첫 줄이 없었다) → 안내 줄을 인자 해석 앞으로 옮겼다.
- `tests.test_cli_parity`(26조합 + 번들 5) · `tests.test_template_wording` 11개 · `tests.test_install` OK.
- 확인(R12.9): update 동일성 #7(platform-guards, HK-10 뒤 레이어 우선)은 RED에서 이미 통과했다. 겹침 경로는 CLI 손질 없이 update.sh와 같다. 보드 재생성(#8)만 CLI에 더했다.
- 진입 파일(R12.7): AGENTS.md + CLAUDE.md 바이트 jvm 7,802 → 7,733 · python 8,046 → 8,026 · go 8,470 → 8,450 · web 9,504 → 9,484 · electron 9,910 → 9,890.
- 세션 적재량(R12.5): 스킬 · 커맨드 `description` 6개 바이트 그대로(1,661 · 548 · 547 · 210 · 141 · 180). 킷 스킬 11개 `description` 300자 이하. 세션 시작 고정 안내(`session-start.sh`)는 고치지 않았다(1,517바이트 시험 통과).
- 번들 `dist/cli.js` 132,960바이트(gzip 35,266바이트, HK-11 101,084 · gzip 28,437에서 +31,876). `require`는 `node:` 모듈뿐, `dependencies` 0.
- 손으로 본 사람용 출력(실제 템플릿, go · claude 설치): `add codex jira-workflow --quiet` → `create 15`, 매니페스트 replace, exit 0. `remove jira-workflow --quiet` → `delete 7`, exit 0. `outdated`(lock `file:` 소스 = 킷 저장소, 태그 0) → `최신이다`, exit 0.
- 커밋마다 압축으로 푼 트리에서 `node scripts/gen-plugins.mjs --check`: `1ef1c3f` · `5a5a247` · `ddcd0c0` · `be55b73` 494개, `2a7eccf` · `c2ac442` 495개 모두 `생성물 일치`.
- 전체 시험 `python3 -m unittest discover -s tests -p "test_*.py"`: `Ran 76 tests in 797.685s` · `OK`.

## 설계와 다른 점

설계 문서(02 · 10)와 다른 점은 [design.md §13](design.md#13-설계와-다른-점), v1 스크립트와 다른 점은 [§12](design.md#12-v1-스크립트와-다른-점)에 적었다. 구현 중 design.md를 세 곳 고쳤다: §5 사전 출시 태그 규칙, §10.2 #8 기대값(exit 4), §13 D9 · D10과 02 수정 목록.

## 남은 것

- 표시 줄 없는 v1 lock의 첫 update는 킷이 바꾼 미수정 파일도 `.new`로 낸다(design §14). v1.0.8 리포마다 그 수만큼 사람이 `mv` · 병합한다.
- `remove`가 남긴 수정 파일은 `owner: user`가 된다. 같은 이름을 다시 `add`해도 사람 파일로 남는다.
- `outdated` 기본 원격 주소가 없다(D4). 배포 원격이 정해지면 `kit.source` 또는 CLI `package.json`에 넣는다.
- `kit.sh` legacy 갈래는 `--json`을 내지 못한다(v1 스크립트가 사람용 출력만 낸다). v2.1에서 legacy 갈래를 지운다.
