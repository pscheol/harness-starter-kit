---
key: HK-25
area: cli
type: feat
title: v1.0.8 설치본 첫 업데이트의 구별 불가 파일을 병합하고, 빈 platform-guards 모듈을 없앤다
status: approved
created: 2026-11-24
---

# Design — HK-25

근거: [requirements.md](requirements.md) R1~R3, [HK-12 design](../HK-12-cli-add-remove-outdated-skills/design.md) §7(표시 줄 `# pre-existing: -`), [HK-11 design](../HK-11-cli-update-repair-uninstall/design.md) §3.1(판정 표), [HK-13 design](../HK-13-projection-engine/design.md) §5.1 · §6.3 · D12 · §15, [HK-10 design](../HK-10-setup-layer-and-token-fixes/design.md) §2.4.

## 1. 지금 동작(40f76d6)

| 항목 | 지금 |
|---|---|
| 표시 줄 없는 v1 lock의 `sha(C) = B ≠ sha(D)` | update.sh · CLI 모두 conflict, `<경로>.new`, 새 lock 해시 `-` · `null` |
| v1.0.8 → v2 첫 update(jvm · all 실측, `test_projection_upgrade`) | 킷이 바꾼 미수정 파일마다 `.new`. 배치 원본(`.agents/rules` 등)이 `.new` 대기라 배치를 미룬다(HK-13 D12) |
| v1 `CLAUDE.md`(lock copy 항목, `sha(C) = B`) | 배치가 새 파일(`@AGENTS.md` + 킷 블록)로 통째 바꾼다. 원본은 남지 않는다 |
| `platform-guards` 모듈 | 파일 3개(`.agents/rules/platform-invariants.md` · `scripts/run-guards.sh` · `scripts/guards/_template.sh`)가 common과 바이트가 같다(HK-10 §2.4). 모듈만의 파일은 `ABOUT` 하나 |

## 2. R1 — 첫 update의 구별 불가 파일

### 2.1 대상

update에서 lock이 표시 줄 없는 v1이고, copy 항목(`owner: kit`)이 `sha(C) = B ≠ sha(D)`인 파일(HK-12 R12.6의 "가리지 못한" 파일). `--accept-all`이면 지금처럼 `.bak`으로 덮는다(사람이 새 판을 고른 것이다). update만 한다. add · remove · uninstall은 HK-12 그대로다.

### 2.2 갈래(위에서부터 처음 맞는 것)

| # | 조건 | 종류 | 결과 | 새 lock |
|---|---|---|---|---|
| 1 | 경로가 `.agents/rules/` · `.agents/skills/` · `.agents/roles/` 아래 | `kit` | D를 쓴다 | `kit`, sha(D) |
| 2 | `.md` · `.txt`이고 C의 앞 20줄에 `HARNESS STARTER KIT`가 있다 | `kit` | D를 쓴다 | `kit`, sha(D) |
| 3 | `.md` · `.txt` | `lines` | 줄 병합(§2.3). 할 수 없으면 #5 | `kit`, sha(D) |
| 4 | `.json` | `keys` | 키 병합(§2.4). 해석할 수 없으면 #5 | `kit`, sha(D) |
| 5 | 그 밖(코드 · 설정) | — | 지금처럼 `<경로>.new` | `-` · `null` |

- #1 · #2 · #3 · #4는 쓰기 전에 C를 `.agents/state/merge-backup/<UTC 시각 YYYYMMDDTHHMMSSZ>/<경로>`에 복사한다. 한 번의 update는 시각 폴더 하나를 쓴다.
- 확장자는 소문자로 비교한다. 새 lock은 늘 표시 줄이 있으므로(HK-12 §7.3) 병합은 첫 update에 한 번만 일어난다.
- 기준 해시를 sha(D)로 두는 이유: 병합본은 "킷 판 + 사람 줄"이다. 다음 update에서 킷이 그 파일을 바꾸면 수정본으로 보고 `.new`를 낸다. sha(병합본)으로 두면 다음 update가 사람 줄을 지운다.

#1 · #2는 "구별 불가"를 줄이는 결정이다.
- #1(HK-13 §15 미결 질문의 답): 배치 원본 폴더의 이름은 킷 이름이다(HK-13 §6.3이 포인터 경로를 같은 이유로 킷 파일로 본다). 바로 새 판으로 바꾸면 `.new`가 생기지 않아 배치를 미루지 않는다(D12 대기 없음). 미루면 첫 update 뒤 옛 포인터가 남고, 줄 병합하면 옛 규칙 문장이 규칙 복사본마다 실린다. 원본은 백업에 있다.
- #2: 킷 머리 줄은 킷 템플릿에만 있다(지금 템플릿 md 178개 중 127개, v1.0.8 스택 `AGENTS.md` 5개 모두 1행). 머리 줄이 있는 파일을 줄 병합하면 바뀐 옛 킷 문장이 표지 묶음으로 남는다. `AGENTS.md`는 세션마다 실려(README 원칙 10) 상시 양이 v1.0.8보다 는다(`test_projection_upgrade.test_session_context_does_not_grow_after_upgrade`). 사람이 고친 옛 킷 파일(lock 없는 옛 설치에 setup.sh를 다시 돌린 리포)의 수정은 백업에 남는다.

### 2.3 줄 병합(`lines`)

C · D를 UTF-8(엄격)로 읽는다. 실패하면 할 수 없다. `\n`으로 나누고 끝 줄바꿈은 D를 따른다.

1. 뜻 있는 줄 = `[A-Za-z0-9]`나 U+0080 이상 글자가 하나라도 있는 줄. 빈 줄 · `---` · ` ``` ` · `|---|` 같은 줄은 기준점이 되지 않는다.
2. 기준점: C와 D 양쪽에 있는 뜻 있는 줄만 남긴 두 수열의 LCS(앞에서부터 같으면 짝, 아니면 아래 칸 길이 ≥ 오른쪽 칸이면 C를 한 칸 넘긴다). 칸 수가 1,000,000을 넘으면 할 수 없다(`.new`).
3. 사람 묶음 = 이웃한 두 기준점 사이의 C 줄. 묶음에서 D에 있는 뜻 있는 줄을 뺀다(두 판에 같은 줄은 한 번만). 뜻 있는 줄이 남지 않으면 묶음을 버린다. 앞뒤 빈 줄(공백 · 탭 · `\r`뿐인 줄)을 깎는다.
4. 자리 = 다음 기준점의 D 줄 바로 앞(없으면 D 끝). D 첫 줄이 `---`이고 다음 `---`가 있으면 그 줄 뒤보다 앞에는 넣지 않는다(머리 `paths`를 깨지 않는다).
5. 묶음을 `<!-- harness-kit: 설치 전 내용(병합) -->` · `<!-- /harness-kit -->` 줄로 감싸 넣는다. 묶음이 없으면 결과는 D와 바이트가 같다.

### 2.4 키 병합(`keys`)

- C · D를 엄격한 JSON으로 읽는다: UTF-8, BOM · 주석 · 끝 쉼표 · `NaN` · 같은 객체 안 중복 키 · 짝 없는 서로게이트는 해석 실패. 둘 다 최상위가 객체여야 한다.
- 결과 = D의 키 순서로 D 값, 두 쪽 값이 모두 객체면 재귀로 병합. 그 뒤에 C에만 있는 키를 C 순서로 붙인다. 배열 · 값은 D 판(킷 키는 새 판 값).
- C에만 있는 키가 어디에도 없으면 결과는 D 바이트 그대로. 있으면 들여쓰기 2칸 · `": "` · 끝 줄바꿈으로 쓴다. 숫자는 원래 글자 그대로, 문자열은 `JSON.stringify` · `json.dumps(ensure_ascii=False)`와 같은 이스케이프.

### 2.5 `CLAUDE.md`(배치 merge 항목)

`CLAUDE.md`는 v2에서 copy가 아니라 배치 merge다(HK-13 §5.1). 표시 줄 없는 v1 lock에서 v1 copy 항목이 `sha(C) = B`이고 C에 킷 블록이 없으면 배치가 지금처럼 새 파일(`@AGENTS.md` + 킷 블록)로 바꾼다. 그 전에 C를 백업하고 목록에 `kit`로 낸다(조건: `claude`를 골랐고 템플릿에 `projection.json`이 있다).

- 머리 줄로 가리지 않는 이유: v1.0.8 스택 `CLAUDE.md` 5개 중 머리 줄이 있는 것은 jvm 1개다. 머리 줄 없는 킷 판 4개를 사람 파일로 보고 블록만 덧붙이면 옛 안내(2KB 안팎)가 세션마다 남는다.
- 배치 엔진(TS · Python)은 바꾸지 않는다. 백업은 update 명령(update.sh · CLI `update`)이 배치 전에 한다.

### 2.6 출력

- 파일 줄: `kit`는 `update`(이유 `v1 lock — 원본은 merge-backup`), `lines` · `keys`는 새 판정 `merge`.
- 끝에 한 번(병합 · 백업이 있을 때만): `v1 lock 첫 업데이트 — 병합 N · 킷 판 M(원본: .agents/state/merge-backup/<시각>/)` 한 줄, `lines` · `keys` 파일 목록, 안내 한 줄(표지 묶음을 보고 필요 없으면 지운다). `kit` 파일은 파일 줄에만 나온다(목록을 두 번 내지 않는다). `CLAUDE.md`는 파일 줄이 배치 쪽에 있어 목록에 `kit`로 한 번 낸다.
- update.sh 개수 줄 끝에 ` merge=N`(N > 0일 때만).
- CLI `--json`: `counts.merge`, `ops`의 `merge` · `backup`, `merged: [{path, kind, backup}]`(없으면 `[]`). 병합만 있으면 exit 0이다(사람이 고를 `.new`가 없다).

### 2.7 구현

| 쪽 | 자리 | 내용 |
|---|---|---|
| Python | `packages/legacy-setup/hx-update/v1_merge.py`(새, 설치되지 않는다) | `python3 -B v1_merge.py <설치 경로> <C> <D> <결과>` → stdout 한 단어 `kit` · `lines` · `keys` · `new`. `new`면 결과를 쓰지 않는다. 표준 라이브러리만 |
| update.sh | `process_file` 가리지 못한 갈래 | 도우미 결과로 백업 · 쓰기 · 판정 줄. `python3`가 없으면 경고 한 줄 뒤 `.new`(지금 동작) |
| update.sh | 배치 전 | §2.5 `CLAUDE.md` 백업 · 목록 |
| CLI | `core/v1-merge.ts`(새) | 같은 알고리즘(`classifyV1` · `mergeLines` · `mergeJson`) |
| CLI | `core/v1-first-update.ts`(새) | update 계획의 가리지 못한 conflict를 `kit` · `merge`로 바꾼다, `CLAUDE.md` 백업 판정, 백업 쓰기 |
| CLI | `commands/update.ts` · `core/update-plan.ts` | 판정 `merge`, overlay에 병합본, 출력 |

TS ↔ Python 동일성: `packages/cli/test/fixtures/v1-merge/<사례>/`(C · D · 기대 결과)를 두 구현에 넣어 바이트를 비교한다.

## 3. R2 — `platform-guards` 모듈 삭제

| 자리 | 바꿈 |
|---|---|
| `packages/templates/optional/platform-guards/` | 지운다(4파일) |
| `layout.json` `modules` | `["jira-workflow", "multi-harness"]` |
| `harness-lib.sh` | `HARNESS_ALL_MODULES`에서 뺀다. `HARNESS_RETIRED_MODULES="platform-guards"`. `harness_normalize_modules` 출력 `<고른 것>\|<모르는 것>\|<없앤 것>` |
| setup.sh · add-agent.sh · kit.sh · CLI `init` · `plan` · `add` · `remove` | 없앤 이름은 `· platform-guards 모듈은 공통 층에 포함됨 — 따로 켤 것이 없다` 한 줄을 내고 넘긴다. 다른 이름이 없으면 아무것도 쓰지 않고 exit 0 |
| update.sh · CLI `update` · `add` · `remove` | 메타 `modules`의 없앤 이름은 `· platform-guards 모듈은 공통 층에 포함됨 — 메타에서 뺀다(파일은 그대로)` 한 줄과 함께 뺀다. 파일 3개는 common 판과 같아 same, lock 레이어만 `common` |
| CLI JSON | `init` · `plan` · `add` · `remove` `retiredModules`, `update` `retiredModules`(`droppedModules`와 따로) |
| 문서 | 루트 `README.md` · `docs/guides/01-getting-started.md` · 플러그인 `commands/bootstrap.md` · `hx-bootstrap/{SKILL,README,manifest}.md` · `hx-agent-add/SKILL.md` · `hx-web-setup` · `hx-electron-setup` SKILL.md · CLI `main.ts` 도움말 · 스택 `verify.sh` 5종 · `common/scripts/run-guards.sh` 주석 · `docs/design/02-cli-engine.md` |

`docs/analysis/` · `docs/roadmap.md` · `docs/reference/` · `docs/harness-next/`는 v1 분석 · 지난 기록 · 참조 원본이라 고치지 않는다. `docs/design/10-modules.md`에는 platform-guards 줄이 없다.

## 4. R3 — 시험

### 4.1 동일성(Python)

| 시험 | 조합 | 기대 |
|---|---|---|
| `test_cli_update_parity` #09(바꿈) | jvm · hexagonal · claude, 미리 둔 사람 `AGENTS.md`, 표시 줄 지운 lock | 두 트리가 같다. `AGENTS.md` = 킷 판 + 사람 묶음, 킷이 바꾼 규칙은 새 판(`.new` 없음), 킷이 바꾼 스크립트는 `.new`. 백업이 두 쪽에 있다 |
| `test_cli_update_parity` #11(새) | python · layered · claude,kiro, 미리 둔 사람 문서 · JSON · 스크립트 · `CLAUDE.md` + 머리 줄 있는 문서를 킷이 바꿈 | 두 트리가 같다. 문서 `lines` · JSON `keys` · 스크립트 `.new` · 머리 줄 문서 `kit` · `CLAUDE.md` 백업(`kit`). 같은 뜻 있는 줄이 두 번 나오지 않는다. 두 번째 update는 병합하지 않는다 |
| `test_cli_update_parity` #07(바꿈) | python · layered · claude,kiro, 메타에 `platform-guards`, 겹침 3경로 lock 레이어 `mod/platform-guards` | 두 트리가 같다. 메타 `modules` = `[]`, 두 출력에 안내 한 줄, lock 레이어 `common`, `.new` 0 |
| `test_cli_parity` #07 · #10 | `--modules=platform-guards` · `platform-guards,jira-workflow` | 두 설치가 같다. 메타 `modules` = `[]` · `["jira-workflow"]`, 두 출력에 안내 |
| `test_cli_parity` #25 | 겹침 시험을 `jira-workflow`에 둔 사본 파일로 옮긴다 | 뒤 레이어(모듈) 판, lock 한 줄(HK-10 R10.1 그대로) |
| `test_cli_addremove_parity` A3 · R1 | `add platform-guards claude` · `remove codex platform-guards` | 두 결과가 같다. 안내, 메타에 없음 |
| `test_kit_wrapper` | legacy `add cursor platform-guards` | CLI와 같은 트리, 메타 `modules` = `[]` |
| `test_projection_upgrade` | v1.0.8 → 첫 update | 배치를 미루지 않는다(`defer` 0), 상시 양 ≤ v1.0.8, 규칙 `.new` 0 |
| `test_template_wording` | 모듈 목록에서 뺀다 | manifest 수 일치 |

### 4.2 단위(vitest)

| 파일 | 본다 |
|---|---|
| `v1-merge.test.ts`(새) | 사례 fixture마다 TS 결과 = 기대 = `python3 v1_merge.py` 결과. 갈래(`kit` 경로 · 머리 줄 · `lines` · `keys` · `new` · 해석 실패 · 칸 수 상한) |
| `v1-first-update.test.ts`(새) | update: 판정 `merge` · `kit`, 백업, 기준 해시 sha(D), `--json merged`, `--dry-run` 쓰기 0, `--accept-all`은 `.bak`, 두 번째 update는 병합 없음, `CLAUDE.md` 백업 |
| `selection.test.ts` · `add.test.ts` · `remove.test.ts` · `cli.test.ts` · `plan.test.ts` · `update.test.ts` | 없앤 이름 안내 · exit 0, 겹침 fixture를 `jira-workflow`로, 메타의 없앤 이름 |

## 5. 설계와 다른 점

| # | 설계 · 요구 | 이 구현 | 이유 |
|---|---|---|---|
| D1 | R1 문서는 줄 병합 | 킷 머리 줄이 있는 문서와 `.agents/rules` · `skills` · `roles` 아래 파일은 새 판 + 백업(`kit`) | §2.2. 킷이 쓴 판은 "구별 불가"가 아니다. 줄 병합하면 옛 킷 문장이 진입 파일 · 규칙 복사본에 남아 상시 양이 는다 |
| D2 | R1 코드는 `.new` | `.agents/skills/` 아래 코드도 `kit` | 스킬 폴더 하나에 `.new`가 있으면 그 스킬 배치를 미룬다(HK-13 D12) |
| D3 | R1 대상 "구별 불가 파일" · 문서는 줄 병합 | `CLAUDE.md`(배치 merge)는 HK-13대로 새 파일로 바꾸고 원본을 백업한다(§2.5) | 배치가 통째 바꾸면 사람 파일이 백업 없이 사라진다. 줄 병합하면 옛 킷 안내가 세션마다 실린다 |
| D4 | 02 §4 "update가 수정본을 3방향 텍스트 병합"을 하지 않는다 | 표시 줄 없는 v1 lock의 첫 update에서만 줄 · 키 병합 | 사용자 결정(R1). 병합본은 표지로 감싸고 원본을 백업한다 |
| D5 | HK-11 U1 · HK-12 `--accept-all` | 가리지 못한 파일도 `--accept-all`이면 `.bak` | 사람이 새 판을 골랐다 |

## 6. 확인 필요

- 병합본은 기준 해시가 sha(D)라 그 뒤 update에서 킷 판이 그대로여도 `.new`를 받는다(HK-11 §9 "sha(D) = B면 그대로 두는 줄" 미결). 사람이 표지 묶음을 지우면 같음이 된다.
- CLI `add` · `remove`가 첫 update보다 먼저 돌면 lock이 v2(B = null)로 바뀌어 R1 대상이 아니다(`.new`). update.sh 쪽 add-agent.sh는 표시 줄을 쓰지 않아 그 뒤 update가 병합한다.
- 머리 줄 규칙(#2)은 사람이 머리 줄을 지운 옛 킷 파일을 사람 파일로 본다(줄 병합 — 안전한 쪽).
- 사람이 설치 전부터 둔 `CLAUDE.md`는 첫 update 뒤 백업에만 남는다. 사람이 블록 밖으로 옮긴다(끝 안내가 그 경로를 낸다).
