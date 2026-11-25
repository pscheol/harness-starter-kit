---
key: HK-11
area: cli
type: feat
title: CLI update(3방향 비교) · repair · uninstall
status: approved
created: 2026-11-23
---

# Design — HK-11

근거: [requirements.md](requirements.md), [설계 02](../../../../docs/design/02-cli-engine.md) §3.2 · §3.9 · §3.10 · §3.12 · §3.13, [HK-8 design](../HK-8-cli-engine-core/design.md). R7.2의 기준 동작은 `packages/legacy-setup/hx-update/update.sh`(v1.0.8)다.

## 1. 모듈

| 파일 | 책임 |
|---|---|
| `core/installed.ts` (새) | 메타 · lock 읽기(없음 · 깨짐 exit 3), lock 경로 검사, op 나누기, 메타에서 선택값 · 토큰 |
| `core/update-plan.ts` (새) | §3.2 판정 표 → 작업 목록 · 새 lock 항목 |
| `core/remove.ts` (새) | 파일 지우기 · 빈 폴더 지우기(킷 항목의 상위 폴더만) |
| `commands/update.ts` · `repair.ts` · `uninstall.ts` (새) | 명령 흐름 · 적용 · 출력 |
| `core/plan.ts` | `AncestorCheck` · `existing` 을 밖으로 낸다. `manifestContent`는 `stack` · `agents`만 받는다 |
| `core/meta.ts` | `mergeMetaForUpdate`(v1 · v2 → v2, 모르는 키 보존), `GIT_DEFAULTS` · `DEFAULT_FLOW` |
| `core/selection.ts` | `agentsOrigin`에 `meta`를 더한다 |
| `cli/args.ts` · `main.ts` · `commands/reserved.ts` · `commands/doctor.ts` · `commands/init.ts` | 플래그 · 명령 등록, 예약 목록에서 셋을 뺀다, 안내 문구의 "다음 조각"을 뺀다 |

`layout.json`의 `overlap`과 `core/resolve.ts`의 겹침 해석은 바꾸지 않는다(HK-10 몫). 모든 명령은 같은 `resolveCandidates`로 D를 만들기 때문에 HK-10이 `overlap`을 바꾸면 update · repair도 같이 따라간다.

## 2. 공통: 설치 상태

### 2.1 읽기

| 대상 | 없음 | 깨짐 | v1 |
|---|---|---|---|
| 메타 `.agents/harness-kit.json` | exit 3 "설치 안 됨" | exit 3 | 메모리에서 v2(HK-8 `readMeta`) |
| lock `.agents/harness-kit.lock` | exit 3(사람 파일과 킷 파일을 가리지 못한다) | exit 3 | 메모리에서 v2(HK-8 `parseLockText`, 주인은 모두 `kit`) |

- lock 경로에 절대 경로 · `..` · `.git` 조각이 있으면 아무것도 쓰기 전에 exit 3.
- op 나누기: `copy`와 `none`만 다룬다. `mirror` · `render` · `merge` 항목이 하나라도 있으면 쓰기 전에 exit 3 `op '<op>' 는 이 판(<CLI 버전>)에서 지원하지 않는다`, 안내 "P18 판 CLI". 명령마다 op별 `switch`가 있고 P18은 그 갈래에 처리기를 넣는다.
- 쓰기 경로는 HK-8 `AncestorCheck`로 본다: 상위 폴더가 끊어진 링크이거나 링크로 리포 밖을 가리키면 exit 3, 상위 경로가 파일이면 그 아래는 "파일이 아니다"로 다룬다.

### 2.2 메타에서 선택값 · 토큰(update · repair)

- 스택 · 변형: 메타 값. 그 폴더가 킷에 없으면 exit 3.
- 도메인: 메타 `domain` → 비면 스택 기본 도메인(update.sh `harness_domain_of`와 같다).
- 하네스: 메타 `agents` 그대로(`agentsOrigin: meta`).
- 모듈: 메타 `modules` 중 `optional/<m>/`이 있는 것. 없는 모듈은 `droppedModules`로 경고하고 뺀다(update.sh와 같다). 그 모듈 파일은 orphan이 된다.
- 토큰(키마다): 같은 이름 환경변수(빈 값 제외) > 메타 `tokens`에 키가 있으면 그 값(빈 문자열 포함) > 스택 기본값 > `tokenDefaults`. update.sh `harness_load_tokens`가 환경변수를 먼저 본다.

## 3. update

### 3.1 판정(위에서부터 처음 맞는 줄)

D = 새 킷이 원하는 내용(치환 후), C = 지금 파일, B = lock `sha256`, O = lock `owner`.

| 조건 | 판정 | 쓰기 | 새 lock 항목 |
|---|---|---|---|
| `--forget`에 든 경로 | forget | 없음 | `{op: none, owner: user}` |
| O = `user` | skip-user | 없음 | 그대로 |
| O = `external:*` | skip-external | 없음 | 그대로 |
| O = `pack:*` | skip-pack | 없음 | 그대로 |
| op = `none`(그 밖 주인) · 모르는 주인 | skip-user | 없음 | 그대로 |
| D 없음(킷에서 빠짐), C 일반 파일, `--prune`, sha(C) = B | delete | C 지움 | 뺀다 |
| D 없음, C 없음, `--prune` | delete | 없음 | 뺀다 |
| D 없음(그 밖) | orphan(`modified` = sha(C) ≠ B) | 없음 | 그대로 |
| C가 링크 · 폴더 · 상위가 파일 | skip-user(`reason`) | 없음 | lock에 있으면 그대로, 없으면 `owner: user` |
| lock에 없음, C 없음 | new | D | `kit`, sha(D) |
| lock에 없음, sha(C) = sha(D) | same | 없음 | `kit`, sha(D) |
| lock에 없음, 다름 | skip-user | 없음 | `owner: user`, `sha256: null` |
| C 없음 | restore | D | `kit`, sha(D) |
| sha(C) = sha(D) | same | 없음 | `kit`, sha(D) |
| B ≠ null, sha(C) = B | update | D | `kit`, sha(D) |
| 그 밖, `--accept-all` | replace | C → `<경로>.bak`(rename), D | `kit`, sha(D) |
| 그 밖 | conflict | `<경로>.new` = D(실행 비트 없음). 있으면 덮고 `newRefreshed: true` | `kit`, B 그대로(null 포함) |

- `layer`는 D가 있으면 이기는 판의 레이어, 없으면 lock 값.
- `.new` · `.bak` 자리에 일반 파일이 아닌 것이 있으면 쓰지 않고 conflict(`reason`)로 남긴다.
- 실행 비트: new · restore · update · replace는 layout `executable`(HK-8과 같다).
- `--forget <경로>`(반복): lock에도 D에도 없는 경로 · 안전하지 않은 경로는 exit 2.

### 3.2 버전 · 플래그

- 메타 `kit.version`이 CLI보다 새것이면 exit 3. `--to <CLI 버전>`이면 진행한다(내려가는 update를 명시).
- `--to`에 CLI 버전이 아닌 값을 주면 exit 2(`npx harness-kit@<버전> update`를 안내). 소스(`github:` · `file:` 등)는 받지 않는다. 템플릿 폴더는 `--templates`다.
- `--packs`(P18) · `--tools`(P22)는 exit 2와 제공 단계.
- `--dry-run`: 판정만 낸다. 쓰지 않는다. 종료 코드는 실제 실행과 같다.

### 3.3 적용 순서

1. 파일: new · restore · update(임시 파일 + rename) → replace(`rename C → .bak`, D 쓰기) → conflict(`.new`) → delete(파일 지우기, 비게 된 상위 폴더 지우기 — 리포 폴더는 지우지 않는다).
2. `.agents/harness.json`이 없을 때만 매니페스트를 쓴다(update.sh와 같다).
3. lock이 v1이면 원래 내용을 `.agents/state/harness-kit.lock.v1.bak`에 둔다(02 §3.9 규칙 5).
4. lock v2: `kit.version` = CLI 버전, `kit.source` = 이번 템플릿 자리, `packs`는 이전 값.
5. 메타 v2(마지막): `mergeMetaForUpdate`.
   - 바꾸는 키: `schema` · `kit.version` · `stack` · `arch` · `domain` · `agents` · `modules`(뺀 모듈 제외) · `tokens`(이전 값 위에 이번 값) · `updatedAt`(오늘). `installedAt`은 있으면 둔다.
   - 없을 때만 채우는 키: `flow` · `git`의 `worktreeRoot` · `maxPerRepo` · `ide` · `issueKey` · `verify` · `packs`.
   - 그 밖의 키는 값과 순서를 둔다(v1 `harness_write_meta`와 같은 규칙). v1 키 `kitVersion`은 `kit.version`으로 옮기고 지운다.

중간에 멈추면 다시 돌린다. 쓴 파일은 same이 되고, `.bak`으로 옮긴 뒤 멈춘 파일은 restore가 된다.

### 3.4 출력 · 종료 코드

- exit 4: conflict ≥ 1, 또는 `--prune`인데 고친 orphan(지우지 않음) ≥ 1. 그 밖은 0.
- 사람용: 킷 버전(이전 → CLI) · 메타 · lock 형식, 선택값, same이 아닌 판정 줄, 개수 한 줄, conflict가 있으면 `diff -u <경로> <경로>.new` 목록(리포 폴더 기준). `--quiet`면 conflict 줄과 개수만.
- `--json`: `command` · `target` · `templates` · `dryRun` · `kit {from, to}` · `formats {meta, lock}` · `selection` · `droppedModules` · `counts` · `ops`(same 제외, 내용 바이트 없음) · `conflicts [{path, new, diff}]` · `generated` · `state`.

## 4. repair

| lock 항목 | 하는 일 |
|---|---|
| `copy` · `kit`, C 일반 파일, sha(C) = B | ok(개수만) |
| `copy` · `kit`, C 일반 파일, 다름(B = null 포함) | drifted — 쓰지 않는다(개수만) |
| `copy` · `kit`, C 없음, lock `kit.version` = CLI, D 있음, B = null 또는 sha(D) = B | restore — D를 쓰고 B := sha(D) |
| `copy` · `kit`, C 없음, lock `kit.version` ≠ CLI(v1 lock은 버전이 없다) | needs-update — 쓰지 않고 `harness-kit update`를 안내 |
| `copy` · `kit`, C 없음, sha(D) ≠ B | needs-update — 같은 판 번호인데 킷 내용이 기록과 다르다 |
| `copy` · `kit`, C 없음, D 없음 | unrestorable — 킷에 없다. `update --prune` · `--forget`을 안내 |
| `copy` · `kit`, C가 링크 · 폴더 | drifted(쓰지 않는다) |
| 주인 `user` · `external:*` · `pack:*`, op `none` | 보지 않는다(skipped 개수) |

- `--only missing,drifted,stale,merge`(쉼표 목록): `missing`이 없으면 되살리지 않는다. `drifted`(copy)는 고치지 않으므로 보고만 바뀐다. `stale` · `merge`는 render · mirror · merge 항목 몫이라 이 판에는 대상이 없다(그 op는 §2.1에서 exit 3). 모르는 값은 exit 2.
- 템플릿은 되살릴 항목이 있을 때만 찾는다.
- 쓰기: restore가 하나라도 있고 `--dry-run`이 아닐 때만 파일 · lock(v2, 버전 · 소스 그대로)을 쓴다. 메타는 쓰지 않는다. 되살릴 것이 없으면 아무것도 쓰지 않는다.
- exit 4: needs-update · unrestorable ≥ 1. 그 밖은 0.

## 5. uninstall

### 5.1 계획

| 대상 | 판정 |
|---|---|
| lock `copy` · 주인 `kit`(또는 `pack:*`이고 `--keep-packs` 없음), C 일반 파일, B ≠ null, sha(C) = B | delete |
| 같은 항목, C 없음 | absent(개수만) |
| 같은 항목, 그 밖(B = null · 다름 · 링크 · 폴더) | keep-modified |
| 그 항목 옆 `<경로>.new`(일반 파일) | delete(`reason: .new`) |
| 주인 `user` · `external:*`, op `none`, `pack:*` + `--keep-packs` | keep-user · keep-external · keep-pack(개수만) |
| `.agents/harness.json` | 메타의 스택 · 하네스 · 토큰으로 만든 내용과 바이트가 같으면 delete, 다르면 keep-modified, 없으면 건너뜀 |
| 메타 · lock | `--keep-state`가 없으면 delete(마지막) |

### 5.2 적용

1. TTY이고 `--yes` · `--json` · `--dry-run`이 없으면 지울 목록(`--quiet`면 개수만)과 남길 목록을 stderr에 보이고 `지울까? [Y/n]`. 아니오면 exit 130, 아무것도 지우지 않는다.
2. TTY가 아니거나 `--json`인데 `--yes`가 없으면(dry-run 제외) exit 2, 아무것도 지우지 않는다.
3. 파일 · `.new` · 매니페스트를 지운다.
4. git hook 연결: 리포 폴더가 git 최상위이고 `git config --local --get core.hooksPath`가 `scripts/git-hooks`면 `git config --local --unset core.hooksPath`. git이 없거나 git 리포가 아니면 건너뛴다. 결과는 `gitHooks.status`(`unset` · `kept` · `none` · `no-git`).
5. lock → 메타를 지운다(`--keep-state`면 둔다). `.agents/state/`는 둔다.
6. 비게 된 폴더 중 lock 항목 · 매니페스트 · 상태 파일의 상위 폴더만 깊은 것부터 지운다. 리포 폴더는 지우지 않는다.

- exit 4: keep-modified ≥ 1(`--dry-run`도 같다). 사람용 · JSON 모두 keep-modified 목록을 낸다. delete 목록은 `--dry-run`과 TTY 확인에서만 낸다(나머지는 개수).

## 6. 시험 계획

### 6.1 단위(vitest)

| 파일 | 본다 |
|---|---|
| `update.test.ts` | update · new · restore · same · conflict(`.new` 내용 · 권한 · B 유지 · 갱신된 `.new`) · `--accept-all`(`.bak`) · `--dry-run` 쓰기 0 · exit 4 · `diff -u` · lock에 없는 사람 파일 skip-user · `user` · `external:*` · `pack:*` · orphan · `--prune`(빈 폴더 포함) · `--forget` · v1 lock · v1 메타 → v2(모르는 키 보존, v1 백업) · 버전(새 설치 exit 3, `--to`) · 지원 안 하는 op exit 3 · `--packs` · `--tools` · 모듈 빠짐 · 메타 토큰 · 실제 템플릿에서 설계 02 §5 완료 기준 3 |
| `repair.test.ts` | missing 되살림 · drifted 그대로 · 버전 다름 · sha(D) ≠ B · v1 lock · `--only` · `--dry-run` · 할 일 없으면 쓰기 0 · 지원 안 하는 op |
| `uninstall.test.ts` | 깨끗한 설치 → 사람 파일만 남음 · 고친 파일 keep-modified exit 4 · `.new` 지움 · 매니페스트 · `--keep-state` · non-TTY `--yes` 없음 exit 2 · TTY 확인(아니오 130) · `--dry-run` · `core.hooksPath` · v1 lock `-` 해시 |
| `cli.test.ts` | 예약 명령 목록에서 update · repair · uninstall이 빠진다 |

### 6.2 동일성(`tests/test_cli_update_parity.py`)

- 옛 킷: 플러그인 사본(`.claude-plugin` · `skills/hx-bootstrap` · `skills/hx-update`)에 시험 파일 3개(`common/zz-hk11-old/only.md` 등)를 더한다. 새 킷: 옛 킷 사본에서 템플릿 몇 개를 고치고 · 더하고 · 뺀다. 고를 파일은 템플릿에서 찾는다(다른 레이어에 같은 경로가 없는 `common/agents-rules/*.md` · `common/scripts/*.sh`).
- 조합마다 옛 setup.sh로 한 번 깔고 두 벌로 복사한다(바이트 · 권한 유지). 같은 사람 수정을 두 벌에 한다. 한 벌에 새 킷의 update.sh, 다른 벌에 `node <cli> update --json --templates <새 킷 템플릿>`. 환경에는 토큰 변수가 없다.
- 비교: 파일 목록 · 바이트 · 권한 비트 · 폴더 목록. 뺀다: lock · 메타 · `.agents/state/`. lock · 메타는 의미로 본다(CLI lock 경로 = 옛 v1 경로 ∪ update.sh 새 lock 경로, kit 항목 해시 = update.sh 새 lock 해시, 메타 선택값 · 토큰 같음).
- 두 쪽 기대값은 모두 같은 트리에서 나온다. HK-9 · HK-10이 템플릿 · layout · update.sh를 바꿔도 시험은 그대로 두 결과를 비교한다.

| # | 스택 · 변형 · 하네스 | 사람 수정 | CLI 플래그 | 기대 |
|---|---|---|---|---|
| 1 | jvm · hexagonal · all | 없음, 메타에 모르는 키 | — | 같다. exit 0. 메타 키 보존 · v1 백업 · doctor `--check` 0 |
| 2 | python · hexagonal · claude,kiro | 킷이 바꾼 파일 · 안 바꾼 파일 고침, 킷 파일 하나 지움, 묵은 `.new` 하나 | — | 같다(`.new` 2개, 지운 파일 되살림). CLI exit 4, conflicts = `.new` 목록 |
| 3 | go · hexagonal · codex | 킷에서 빠질 파일 하나 고침 | — | 같다. orphan 수 = 뺀 템플릿 수 |
| 4 | 3과 같음 | 3과 같음 | `--prune` | CLI = update.sh 결과 − 안 고친 orphan(빈 폴더 포함). 고친 orphan은 남고 exit 4 |
| 5 | web · nextjs-app · claude | 킷 밖 사람 파일, 새 킷 경로에 미리 둔 사람 파일 | — | update.sh 결과 − 그 경로의 `.new`(§7 U1). 두 번째 CLI update는 쓰기 0 |
| 6 | jvm · layered · claude | 2와 같은 두 파일 고침 | `--accept-all` | 같다(`.bak` 2개). exit 0 |

`platform-guards`(겹치는 경로 4개)는 조합에서 뺀다(§7 U2). HK-10이 겹침 순서를 맞춘 뒤 조합을 더한다.

## 7. update.sh와 다른 점

| # | update.sh | CLI update | 이유 |
|---|---|---|---|
| U1 | lock에 없는 경로에 다른 내용 파일이 있으면 conflict(`.new`, lock `-`) | skip-user, lock `owner: user` | 설계 02 §3.5 · §3.10(프로젝트가 이긴다). update.sh는 그 파일에 매번 `.new`를 만든다 |
| U2 | 겹치는 경로를 레이어마다 다시 판정한다. 첫 update에서 뒤 레이어 판으로 바꾸고, 다음 update에서 앞 레이어 판을 `.new`로 낸다 | layout `overlap`(지금 `first`)의 이기는 판 하나만 본다 | 겹침 순서는 HK-10이 setup.sh · layout과 같이 고친다 |
| U3 | `--prune` · `--forget` · `--to` 없음, exit 늘 0 | 있음, conflict면 exit 4 | 설계 02 §3.3 · §3.10 |
| U4 | 교체할 때 기존 권한 비트를 두고 `chmod +x`만 더한다 | layout `executable`로 새로 쓴다 | 사람이 권한만 바꾼 경우에만 다르다. 동일성 조합에는 없다 |
| U5 | 새 lock에서 orphan 줄을 뺀다 | orphan 항목을 둔다 | 다음 `--prune`이 지울 수 있어야 한다(lock만 다르다) |
| U6 | lock v1 · 메타 v1을 쓴다 | lock v2 · 메타 v2, v1 lock 백업 | R3.2 · 02 §3.9 규칙 5 |

## 8. 설계와 다른 점

| # | 설계 02 | 이 구현 | 이유 |
|---|---|---|---|
| D1 | §3.10 `--accept-all` 줄의 lock "B 그대로" | `replace` 판정, B := sha(D) | 새 판을 썼으므로 다음 update에서 미수정으로 봐야 한다. update.sh와 같다 |
| D2 | §3.2 `--yes`: TTY가 아니면 자동으로 켠다 | uninstall은 TTY가 아니면(또는 `--json`) `--yes`가 있어야 지운다(없으면 exit 2) | 지우는 명령은 확인 없이 돌지 않게 한다(코디네이터 제약). init · update · repair는 그대로 |
| D3 | §3.10 exit 4는 conflict | `--prune`에서 고친 orphan을 남겨도 exit 4. repair는 되살리지 못한 missing이 있으면 exit 4 | §3.2 코드 4 "수정본이라 지우지 않은 파일" · 사람이 update를 돌려야 하는 결과 |
| D4 | §1 엔진이 mirror · render · merge를 읽고 쓴다 | 그 op가 lock에 있으면 exit 3(P18) | 어댑터가 P18이다. op별 갈래는 만들어 둔다 |
| D5 | §3.3 `--to <버전\|소스>` | CLI 자기 버전만 받는다(내려가는 update 명시용) | 다른 판 템플릿을 받는 경로(npm · GitHub)는 네트워크가 필요하다. 이번 범위 밖 |
| D6 | §3.3 `--packs` · `--tools` · `--allow-unverified` | `--packs` · `--tools`는 exit 2와 제공 단계, `--allow-unverified`는 모르는 플래그 | 팩(P18) · 외부 도구(P22)가 없다 |
| D7 | §3.12 missing(copy)은 판 번호가 같으면 다시 쓴다 | 판 번호가 같고 B = null 또는 sha(D) = B일 때만 | `--templates`로 같은 판 번호의 다른 내용을 넣지 않는다 |
| D8 | §3.13 `.agents/harness.json` 언급 없음 | 킷 판과 같으면 지우고 다르면 남긴다 | 설계 02 §5 완료 기준 3(남는 킷 파일은 고친 파일 하나) |
| D9 | §3.13 3단계 `git config --get core.hooksPath` | 리포 폴더가 git 최상위일 때 `--local`로 읽고 지운다 | 상위 리포 안 하위 폴더에서 그 리포 설정을 지우지 않는다. install-git-hooks.sh가 같은 조건으로 건다 |
| D10 | §3.6 토큰: 플래그 > 환경 > 메타 > 기본값 | update · repair는 토큰 플래그가 없다. 메타에 키가 있으면 빈 값도 그대로 쓴다 | update.sh는 빈 값을 치환하지 않는다. 빈 값을 기본값으로 채우면 설치 때와 내용이 달라져 그 토큰이 든 파일이 모두 바뀐다 |
| D11 | §3.7 `ops`에 모든 작업 | update `--json`은 same을, uninstall은 delete를(`--dry-run` · 확인 제외) 개수로만 낸다 | 세션에 붙는 출력을 줄인다(250줄 → 몇 줄) |

## 9. 확인 필요

- v1 lock은 setup.sh가 건너뛴 기존 사람 파일(예: 미리 있던 `AGENTS.md`)의 해시를 그 파일 내용으로 적는다(`inherited_hash`). 첫 update에서 sha(C) = B라 update.sh와 CLI 모두 사람 파일을 킷 판으로 바꾼다. 미리 둔 `AGENTS.md` 한 개로 setup.sh → update.sh를 돌리면 `update AGENTS.md`가 나온다. v1 lock만으로는 가릴 수 없다. 사람이 정할 것: 그대로 둘지, v1 lock에서 처음 update할 때 `sha(C) = B ≠ sha(D)`인 파일을 conflict로 낮출지.
- 사람이 고친 파일은 킷이 그 파일을 바꾸지 않았어도(sha(D) = B) update마다 `.new`를 받는다(설계 02 §3.10 표 · update.sh와 같다). `sha(D) = B`면 그대로 두는 줄을 더할지 사람이 정한다.
- uninstall은 `feature_docs.py build`가 만든 `docs/features/` HTML을 남긴다(lock에 없는 생성물).
- HK-9가 update.sh 끝에 보드 재생성을 넣으면 CLI update도 같은 일을 해야 동일성 시험 #1~#6이 같다. HK-9 병합 뒤 다시 맞춘다.
