---
key: HK-12
area: cli
type: feat
title: CLI add · remove · outdated와 플러그인 스킬의 CLI 호출
status: in-review
created: 2026-11-23
---

# Design — HK-12

근거: [requirements.md](requirements.md), [설계 02](../../../../docs/design/02-cli-engine.md) §3.2 · §3.3 · §3.9 · §3.14 · §5, [10 §3.1](../../../../docs/design/10-modules.md)(v1 모듈 부분), [HK-8 design](../HK-8-cli-engine-core/design.md), [HK-11 design](../HK-11-cli-update-repair-uninstall/design.md) §9. 기준 동작은 `packages/legacy-setup/hx-agent-add/add-agent.sh`(= setup.sh 재실행) · `hx-update/update.sh`다.

## 0. 요구

R12.1~R12.5는 [requirements.md](requirements.md) 그대로다. 코디네이터가 남은 후속 넷을 R12.6~R12.9로 더했다.

- **R12.6** 설치 전부터 있던 파일(예: `AGENTS.md`)을 update가 덮지 않는다.
  - setup.sh는 그런 파일을 lock에 기준 해시 `-`(킷 판과 바이트가 같으면 그 해시)로 적는다. CLI `init`은 `owner: user`로 적는다(HK-8부터 그렇다, 시험으로 묶는다).
  - 이 판 전의 v1 lock(표시 줄 없음)은 미리 있던 파일과 킷 파일을 가리지 못한다. update.sh · CLI 모두 `sha(C) = B ≠ sha(D)`인 파일을 바꾸지 않고 `.new`를 쓴다. 새 lock에는 기준 해시를 `-` · `null`로 둔다.
  - setup.sh ↔ CLI 동일성 시험(`test_cli_parity` · `test_cli_update_parity`)에 조합을 더한다.
- **R12.7** 스택 진입 파일(`AGENTS.md` · `CLAUDE.md`)과 같은 문구가 "커밋 · 푸시 전에 full"을 시키지 않는다. 문구는 "MR 전에는 `bash scripts/verify.sh --affected`, 전체 검증(full)은 CI가 돈다"다. `tests/test_template_wording.py`가 이 문형을 센다. 진입 파일 바이트는 늘지 않는다.
- **R12.8** 루트 `README.md`의 파일 수 표가 낡지 않는다.
- **R12.9** CLI `update`가 HK-9 update.sh의 보드 재생성 · HK-10 뒤 레이어 우선과 같은 결과를 낸다. `platform-guards` 조합을 동일성 시험에 더한다.

## 1. 지금 동작(d385454)

| 항목 | 지금 |
|---|---|
| `add` · `remove` · `outdated` | 예약 명령, exit 2 "P17(다음 조각)" |
| add-agent.sh | `--agents=`만 받는다. 메타의 도메인 · 모듈 · 토큰으로 setup.sh를 합친 하네스 목록으로 다시 돈다. 모듈 추가는 `setup.sh --modules=`를 다시 돌리라고 안내만 한다 |
| 스킬 3종 | SKILL.md 절차가 `setup.sh` · `update.sh` · `add-agent.sh`를 직접 부른다. CLI 사본 `bin/harness-kit.js`는 깔리지만 아무도 부르지 않는다 |
| 미리 있던 파일 | `AGENTS.md`를 미리 두고 setup.sh → update.sh를 돌리면 `update AGENTS.md`(사람 파일이 킷 판으로 바뀐다). 같은 리포에 CLI `update`도 `update`다. CLI `init`으로 깔면 `owner: user`라 `skip-user`다(재현 기록은 tasks.md) |
| CLI `update` 보드 | 보드를 다시 만들지 않는다. update.sh는 HK-9부터 `board.sh --check` 실패 시 한 번 다시 만든다 |
| 진입 파일 문구 | 스택 5종 `AGENTS.md`와 jvm `CLAUDE.md`가 "`full`은 커밋·푸시 전에 직접 실행" |
| README 표 | core 187/191 · 합 277/285(v1.0.8). manifest는 198/202 · 289/297(HK-9이 맞췄다) |

## 2. 모듈

| 파일 | 책임 |
|---|---|
| `core/selection-change.ts` (새) | 이름 해석(하네스 · v1 모듈 · 나중 단계 모듈), 새 선택값, 두 선택값의 D 비교(몫 · 빠지는 경로 · 이기는 판이 바뀐 경로) |
| `core/legacy-lock.ts` (새) | 표시 줄 없는 v1 lock의 기준 해시 풀기(R12.6) |
| `core/git.ts` (새) | `gitEnv` · `git ls-remote --tags` · 태그 → 최신 semver |
| `core/board.ts` (새) | update 뒤 보드 확인 · 재생성(R12.9, update.sh `rebuild_board`와 같은 조건) |
| `commands/add.ts` · `remove.ts` · `outdated.ts` (새) | 명령 흐름 · 적용 · 출력 |
| `core/lock.ts` | v1 표시 줄 읽기(`ambiguous`) |
| `core/installed.ts` | `Installed.lockAmbiguous` |
| `commands/update.ts` · `uninstall.ts` | v1 lock 해시 풀기, 보드(update) |
| `cli/args.ts` · `cli/context.ts` · `main.ts` · `commands/reserved.ts` · `commands/init.ts` | 위치 인자(add · remove), 플래그 · 명령 등록 · 예약 목록 · 안내 문구 |
| `legacy-setup/hx-bootstrap/lib/harness-lib.sh` · `setup.sh` | lock 표시 줄, 미리 있던 파일의 해시 |
| `legacy-setup/hx-update/update.sh` | 표시 줄 없는 lock의 `sha(C) = B ≠ sha(D)` → conflict |
| `legacy-setup/hx-agent-add/add-agent.sh` | `--modules=` |
| `plugin/skills/hx-bootstrap/kit.sh` (새) | Node 18.3 이상이면 CLI, 아니면 v1 스크립트로 내려가는 갈래(R12.4) |
| `plugin/skills/{hx-bootstrap,hx-update,hx-agent-add}/SKILL.md` · `plugin/commands/*.md` | 절차가 `kit.sh`를 부른다. `description`은 그대로 |

## 3. add (R12.1)

```text
harness-kit add <이름>… [--dry-run] [--json] [--templates 폴더] [--cwd 폴더]
```

### 3.1 이름

| 이름 | 처리 |
|---|---|
| layout `harnesses`(`claude` `codex` `cursor` `kiro`) | 하네스 |
| layout `modules`(`jira-workflow` `platform-guards` `multi-harness`) | v1 모듈. `optional/<m>/`이 없으면 exit 5 |
| `aidlc` · `entire` · `notion` | exit 2 `'<이름>' 모듈은 P22(외부 도구 · 접수 출처 모듈, 설계 10)에서 제공한다` |
| 그 밖 · 빈 목록 | exit 2와 가능한 이름 |

- 이름은 공백 · 쉼표로 받는다. 적은 순서를 지키고 중복은 뺀다. `all`은 받지 않는다(하네스 전체인지 모듈 전체인지 갈리지 않는다).
- 이미 켠 이름은 경고 한 줄(`이미 켜져 있다 — 그 몫에서 빠진 파일만 채운다`)과 함께 그대로 다룬다.
- 새 선택값: 메타 `agents` 뒤에 새 하네스, 메타 `modules` 뒤에 새 모듈(add-agent.sh의 `MERGED`와 같은 순서 — 모듈 순서가 레이어 순서다).

### 3.2 계획

D_old = 메타 선택값의 D, D_new = 새 선택값의 D(둘 다 HK-11 `wanted`, 토큰은 HK-11 `tokensFromMeta`).

- **몫(share)**: 고른 이름마다 "그 이름을 뺀 선택값"의 D에 없는 D_new 경로. 새 이름이면 D_new − D_old다.
- 몫의 경로마다(위에서부터 처음 맞는 줄):

| 조건 | 판정 | 쓰기 | lock |
|---|---|---|---|
| lock 주인이 `user` · `external:*` · `pack:*` · op `none` | skip-user · skip-external · skip-pack | 없음 | 그대로 |
| 상위 경로가 파일 · C가 링크 · 폴더 | skip-user(`reason`) | 없음 | lock에 있으면 그대로, 없으면 `owner: user` |
| C 없음 | create(lock에 있으면 restore) | D | `kit`, sha(D) |
| lock에 없음, sha(C) = sha(D) | same | 없음 | `kit`, sha(D) |
| lock에 없음, 다름 | skip-user(`사람이 둔 파일이다`) | 없음 | `owner: user`, `sha256: null` |
| lock에 있음(C 있음) | keep | 없음 | 그대로(`layer`만 이기는 판) |

- 몫 밖에서 이기는 판의 레이어가 바뀐 경로(예: `platform-guards`를 켜면 common과 겹치는 4개): 파일은 쓰지 않고 lock `layer`만 새 이기는 판으로 바꾼다. 내용은 다음 `update`가 3방향 비교로 맞춘다. setup.sh 재실행도 있는 파일을 건너뛰고 lock에 새 레이어 · 옛 해시를 적는다.
- 그 밖의 lock 항목(킷에서 빠진 orphan 포함)은 그대로 둔다.

### 3.3 매니페스트 · 메타 · lock · 기능 문서

- `.agents/harness.json`: 하네스 목록이 바뀌면 다시 쓴다. 지금 파일이 없거나 옛 선택값으로 만든 내용과 바이트가 같으면 새 내용을 쓴다(setup.sh는 늘 덮는다). 다르면(사람이 고침) `.agents/harness.json.new`에 새 내용을 쓰고 conflict, exit 4.
- 메타 v2: HK-11 `mergeMetaForUpdate`로 `agents` · `modules` · `tokens` · `updatedAt`을 바꾼다. `kit.version`은 설치 값 그대로다(킷 파일을 올리지 않았다). 모르는 키는 둔다.
- lock v2: 항목은 위 표. `kit.version` · `kit.source`는 이전 값(v1 lock이면 메타 `kit.version`, 소스 `null`). v1 lock이면 원래 내용을 `.agents/state/harness-kit.lock.v1.bak`에 둔다(02 §3.9 규칙 5).
- 설치된 킷이 CLI보다 새것이면 exit 3(update와 같다). 같지 않은 옛 판이어도 진행한다(add-agent.sh와 같다).
- 적용 순서: 파일(임시 파일 + rename) → 매니페스트(`.new`) → 기능 문서 → v1 백업 → lock → 메타(마지막). 기능 문서는 lock의 `tools/docs/` 항목이 모두 `kit`이고 지금 파일 해시가 기준과 같을 때만 `feature_docs.py build`를 돌린다(HK-8 D17과 같은 이유). setup.sh는 늘 돌린다.
- `--dry-run`: 판정만 낸다. 종료 코드는 실제 실행과 같다.

### 3.4 출력 · 종료 코드

- exit 0. 매니페스트 conflict가 있으면 4. 이름 오류 2, 설치 안 됨 · 버전 3, 모듈 템플릿 없음 · 쓰기 권한 5.
- `--json`: `command` · `target` · `templates` · `dryRun` · `names {harnesses, modules, already}` · `selection {before, after}` · `counts` · `ops`(keep · same 제외) · `conflicts` · `generated` · `featureDocs` · `state`.

## 4. remove (R12.2)

```text
harness-kit remove <이름>… [--dry-run] [--json] [--templates 폴더] [--cwd 폴더]
```

- 이름 규칙은 add와 같다. 켜져 있지 않은 이름은 경고 한 줄 뒤 건너뛴다. 하네스를 모두 빼면 exit 2(`uninstall`을 안내).
- 새 선택값: 메타에서 그 이름을 뺀다. **빠지는 경로** = D_old − D_new.

| 빠지는 경로의 lock 항목 | 판정 | 쓰기 | lock |
|---|---|---|---|
| 없음 · 주인이 `kit`이 아님 · op `none` | keep-user · keep-external · keep-pack | 없음 | 그대로 |
| `kit`, C 없음 | absent | 없음 | 뺀다 |
| `kit`, C 일반 파일, sha(C) = B, 해시를 풀 수 있다(§7.3) | delete(`<경로>.new`가 있으면 같이) | 지움 | 뺀다 |
| `kit`, 그 밖(B = null · 다름 · 링크 · 폴더) | keep-modified | 없음 | `owner: user`, `sha256: null`(다음 update가 orphan으로 보지 않는다) |

- 남는 경로 중 이기는 판의 레이어가 바뀐 경로(예: `platform-guards`를 빼면 겹치는 4개가 common 판으로): update 판정 표(HK-11 §3.1)의 same · update · restore · conflict만 쓴다. 고치지 않았으면 새 판으로 바꾸고, 고쳤으면 `.new`.
- 지운 파일의 비게 된 상위 폴더를 지운다(리포 폴더는 두고). 매니페스트 · 메타 · lock · 기능 문서는 add와 같다.
- exit 4: keep-modified · conflict ≥ 1. 사람용 · JSON 모두 그 목록을 낸다.

## 5. outdated (R12.3)

```text
harness-kit outdated [--check] [--source <git 원격|경로>] [--json] [--cwd 폴더]
```

- 설치 버전: 메타 `kit.version`(없음 · 깨짐 exit 3, v1 메타는 메모리에서 v2). CLI 버전: 번들 버전.
- 소스(처음 맞는 것): `--source` > 환경변수 `HARNESS_KIT_SOURCE` > lock `kit.source`가 `github:<owner>/<repo>[#…]`이면 `https://github.com/<owner>/<repo>.git` · `git+<url>`이면 `<url>` · `file:<폴더>`이면 그 폴더의 git 최상위 > 없음.
- 최신 태그: `git ls-remote --tags --refs <소스>`(시간 제한 15초, `GIT_TERMINAL_PROMPT=0`). `refs/tags/v?<semver>`만 본다. 사전 출시 태그(`-alpha.0` 등)는 설치 판이나 CLI 판이 사전 출시일 때만 센다(그 줄을 고른 사람). `stable`은 사전 출시가 아닌 것 중 가장 큰 것. `-`로 시작하는 소스는 exit 2.
- 소스가 없거나 git이 없거나 `ls-remote`가 실패하면 최신 칸은 "확인 못 함"(`latest.status: unknown`, `reason`)이고 exit 0.
- `newest` = CLI 버전과 최신 태그 중 큰 것. `newest > 설치 버전`이면 "새 판이 있다"와 올리는 명령(`harness-kit update` 또는 `npx harness-kit@<최신> update`)을 낸다. `--check`면 그때 exit 1.
- 팩(P18) · 외부 도구(P22) 칸은 이번에 없다.

## 6. 스킬 전환 (R12.4 · R12.5)

### 6.1 `kit.sh`

자리: 플러그인 `skills/hx-bootstrap/kit.sh`(원본 `packages/plugin/skills/hx-bootstrap/kit.sh`, 실행 비트). bash 3.2와 POSIX 도구만 쓴다.

```text
bash "$SKILL_DIR/kit.sh" <명령> [CLI 플래그…]     # hx-update · hx-agent-add 는 "$SKILL_DIR/../hx-bootstrap/kit.sh"
bash "$SKILL_DIR/kit.sh" --which                  # cli | legacy 한 줄
```

1. Node 판정: `${HARNESS_KIT_NODE:-node} -e 'process.stdout.write(process.versions.node)'`. 실행되지 않거나 18.3 미만이면 legacy.
2. cli: `exec node "<kit.sh 폴더>/bin/harness-kit.js" "$@"`(인자 그대로).
3. legacy: 첫 줄에 `Node 18.3 이상이 없어 <스크립트> 로 실행한다(v2.0 동안만 — v2.1 부터는 Node 가 필요하다)`를 내고 v1 스크립트로 옮긴다.

| 명령 | v1 스크립트 | 옮기는 플래그 | 받지 않는 플래그(exit 2) |
|---|---|---|---|
| `init` · `plan` | `setup.sh`(plan은 `--dry-run`) | `--stack` `--arch` `--domain` `--lang` `--agents` `--modules` → `--k=v`, `--force` `--dry-run`, `--name` `--slug` `--package-ns` `--protected-path` `--token K=V` → 같은 이름 환경변수, `--cwd` → 위치 인자 | `--adopt` `--issue-source` `--issue-prefix` `--base` `--templates` |
| `update` | `update.sh` | `--dry-run` `--accept-all` `--cwd` | `--prune` `--forget` `--to` `--packs` `--tools` `--templates` |
| `add` | `add-agent.sh` | 이름 → `--agents=` · `--modules=`, `--dry-run` `--cwd` | `--templates` |
| 그 밖 | — | — | exit 5 `Node 18.3 이상이 필요하다: <명령>` |

- `--yes` · `--json` · `--quiet` · `--no-color`는 legacy에서 버린다. `--json`이면 한 줄 `JSON 출력은 CLI 에서만 낸다`를 더한다(스킬은 사람용 출력을 그대로 보인다).
- 플래그는 `--k v` · `--k=v` 둘 다 받는다(CLI `parseArgs`와 같다).

### 6.2 SKILL.md · 커맨드

- 절차의 실행 줄을 `kit.sh`로 바꾼다. 문장 하나로 갈래를 적는다: "`kit.sh`는 Node 18.3 이상이면 `bin/harness-kit.js`(CLI)를, 없거나 낮으면 `setup.sh`(· `update.sh` · `add-agent.sh`)를 부른다".
- 스킬은 `--json` 출력의 요약(개수 · same이 아닌 판정)을 사람에게 보이고, exit 4면 `conflicts`(`.new` 목록, `diff -u` 줄)를 그대로 보인다. `.new` 병합은 사람이 고른다.
- `hx-agent-add`는 `add` · `remove`를 적는다. 빼기는 CLI에만 있다(legacy exit 5).
- `description`(세션마다 실린다)은 한 글자도 바꾸지 않는다. 시험이 지금 바이트 수 이하인지 본다.

## 7. 미리 있던 파일 (R12.6)

### 7.1 lock v1 표시 줄

setup.sh · update.sh가 쓰는 v1 lock 둘째 줄에 `# pre-existing: -`를 둔다. 뜻: "이 lock은 설치 전부터 있던 파일을 해시 `-`(또는 킷 판과 같은 해시)로 적었다". 읽는 쪽은 `#` 줄을 건너뛰므로 옛 도구와 호환된다.

| lock | 표시 줄 | `sha(C) = B ≠ sha(D)` |
|---|---|---|
| v1, 표시 줄 있음(이 판 setup.sh · update.sh) | 있음 | update(킷이 쓴 파일이다) |
| v1, 표시 줄 없음(v1.0.8 이하) | 없음 | 가리지 못한다 → conflict, `.new`, 새 lock 해시 `-` · `null` |
| v2(CLI) | — | update(미리 있던 파일은 `owner: user`) |

### 7.2 setup.sh

- `inherited_hash`: 이전 lock에 그 경로가 있으면 그 해시(지금과 같다). 없으면(설치 전부터 있던 파일) 템플릿을 렌더해 바이트가 같으면 그 해시, 다르거나 일반 파일이 아니면 `-`.
- 표시 줄: 이전 lock이 없거나 표시 줄이 있거나 `--force`면 쓴다. 이전 lock에 표시 줄이 없으면(옛 lock에 덧설치 · add-agent.sh) 쓰지 않는다 — 물려받은 해시가 여전히 가려지지 않기 때문이다.

### 7.3 update.sh · CLI

- update.sh: 이번 lock에 표시 줄이 없고 `lock_sha = cur_sha`이면 update 대신 conflict 줄로 간다(`--accept-all`이면 `.bak` 덮기). 새 lock 해시는 `-`, 줄 끝에 `(v1 lock — 미리 있던 파일인지 가릴 수 없다)`. 새 lock은 늘 표시 줄이 있다.
- CLI(`core/legacy-lock.ts`): 표시 줄 없는 v1 lock이면, 쓰기 명령이 판정 전에 `kit` · `copy` 항목마다 `sha(C) = B`이고 (D가 없거나 sha(D) ≠ B)면 B를 `null`로 바꾼다. 그 뒤는 HK-11 판정 그대로다(conflict `.new`, orphan은 고친 파일로 남고 `--prune`이 지우지 않는다). 쓰는 명령: `update` · `add` · `remove` · `uninstall`(uninstall은 메타 선택값으로 D를 만든다. 템플릿을 못 찾으면 `sha(C) = B` 항목을 모두 남긴다).
- 판정에 `reason: "v1 lock — 미리 있던 파일인지 가릴 수 없다"`를 붙인다.

## 8. 문구 (R12.7)

| 파일 | 지금 | 바꿈 |
|---|---|---|
| `stacks/{jvm,python,go,web,electron}/root/AGENTS.md` 검증 레벨 줄 | "… `full`은 커밋·푸시 전에 직접 `bash scripts/verify.sh`를 실행해 통과시킨다" | "MR 전에는 `bash scripts/verify.sh --affected`, … `full`은 CI가 돈다" |
| `stacks/jvm/root/CLAUDE.md` 20행 | "… `full`은 커밋·푸시 전에 직접 실행해 통과시킨다" | "MR 전에는 `--affected`, `full`은 CI가 돈다" |
| `common/agents-docs/guides/harness-engineering.md` 27행 | "커밋·푸시 전에 full 이 돈다" | "MR 전에 affected, full 은 CI 가 돈다" |
| `stacks/jvm/arch/multimodule/agents-rules/tech.md` 229행 | "커밋 전에는 반드시 `scripts/verify.sh` 전체를 돌린다" | "MR 전에는 `bash scripts/verify.sh --affected`를 돌린다(전체는 CI)" |
| `legacy-setup/hx-bootstrap/setup.sh` 끝 안내 | "full 은 커밋·푸시 전에 직접 실행한다" | "MR 전에는 --affected, full 은 CI 가 돈다" |

- 시험 `TemplateWordingTest.test_no_full_before_commit`: `packages/templates` · `packages/legacy-setup` · `packages/plugin` 문서에서 "(커밋|푸시) … 전 … (full|전체)" · "(full|전체) … (커밋|푸시) … 전" 문형(한 문장 안, 40자 이내)을 센다. 0이어야 한다. 제외 목록은 HK-7과 같다.
- 진입 파일 크기 시험: 스택마다 `AGENTS.md` + `CLAUDE.md` 바이트가 이 판 전 값(jvm 7,802 · python 8,046 · go 8,470 · web 9,504 · electron 9,910) 이하.

## 9. README (R12.8)

루트 `README.md`의 스택군 × 하네스 표(core 187/191)와 모듈 수 문장(`multi-harness` 8)을 지운다. 대신 한 줄: 파일 수의 원본은 [hx-bootstrap manifest](../../../../plugins/harness-kit/skills/hx-bootstrap/manifest.md) 「에이전트 선택」 표이고 시험이 템플릿과 맞춘다, 정확한 수는 `harness-kit plan --json`이 낸다. 숫자가 두 곳에 있으면 한 곳이 낡는다(HK-16이 `common/scripts/harness/`에 파일을 더한다).

시험 `ReadmeCountTest`: README에 `| \`jvm\` · \`python\` · \`go\` | <숫자>` 같은 수 표가 없고, manifest 링크가 있으며, 그 파일에 「에이전트 선택」 절이 있다.

## 10. update 동일성 (R12.9)

### 10.1 보드

CLI `update`가 쓰기를 마친 뒤(`--dry-run`이 아닐 때) update.sh `rebuild_board`와 같은 조건으로 돈다.

- `scripts/board.sh`가 일반 파일이고 `python3`가 있다.
- 이번 판정에서 `scripts/board.sh` · `scripts/sdd-layout.py` · `scripts/harness/*`가 conflict · skip-user가 아니다(사람이 고친 · 둔 보드 코드를 실행하지 않는다. update.sh는 conflict만 본다).
- `bash scripts/board.sh --check`가 0이면 아무것도 하지 않는다. 아니면 `bash scripts/board.sh`를 한 번 돌린다. 실패하면 경고만 하고 종료 코드는 바꾸지 않는다.
- JSON `board: {status: ok|rebuilt|failed|skipped, reason?}`, 사람용 한 줄(`rebuilt` · `failed`일 때만).

### 10.2 조합(`tests/test_cli_update_parity.py`에 더한다)

| # | 스택 · 변형 · 하네스 · 모듈 | 사람 수정 · 준비 | 기대 |
|---|---|---|---|
| 7 | python · layered · claude,kiro · platform-guards | 새 킷이 모듈 `run-guards.sh`(이기는 판)와 common `platform-invariants.md`(지는 판)를 바꾼다 | 두 결과가 같다. `run-guards.sh`만 update, `.new` 0, lock 레이어 `optional/platform-guards` |
| 8 | go · hexagonal · codex | 옛 구조 이슈 + 옛 형식 보드(HK-9 시험과 같다) | 두 결과가 같다(보드 다시 만듦). 옛 보드는 킷 파일 `specs-index.md`를 고친 것이라 두 쪽 모두 그 `.new`를 받는다 — CLI exit 4, JSON `board.status = rebuilt` |
| 9 | jvm · hexagonal · claude | `AGENTS.md`를 미리 두고 설치, lock 표시 줄을 지운다(v1.0.8 lock) | 두 결과가 같다. `AGENTS.md`는 사람 판, `AGENTS.md.new`와 킷이 바꾼 규칙의 `.new`. CLI exit 4. 새 lock 해시 `-` · `null` |
| 10 | 9와 같음, 표시 줄 둠(이 판 setup.sh) | — | 두 결과가 같다. `AGENTS.md.new`(해시 `-`), 킷이 바꾼 규칙은 update |

## 11. 시험 계획

### 11.1 단위(vitest)

| 파일 | 본다 |
|---|---|
| `add.test.ts` | 하네스 추가(몫만 생성, 메타 · 매니페스트 · lock) · 모듈 추가 · 겹침 레이어만 바뀜 · 사람 파일 skip-user · 이미 켠 이름은 빠진 몫만 · 나중 단계 모듈 exit 2(P22) · 모르는 이름 · `all` exit 2 · 설치 안 됨 exit 3 · `--dry-run` 쓰기 0 · 매니페스트 수정본 `.new` exit 4 · v1 lock → v2 · 백업 · 새 설치 = init(같은 선택값)과 트리 같음 |
| `remove.test.ts` | 미수정 몫 지움 · 빈 폴더 · `.new` 같이 지움 · 고친 파일 keep-modified exit 4 · lock `owner: user` · 겹침 경로를 common 판으로 · 하네스 전부 빼기 exit 2 · 꺼진 이름 경고 · add → remove = 처음 init과 트리 같음 · `--dry-run` |
| `outdated.test.ts` | bare 저장소 태그(`v1.0.8` `v2.0.0-alpha.0` `v2.1.0` `v2.2.0-rc.1` `junk`) → 최신 · `--check` exit 1/0 · 소스 없음 · 없는 경로 → 확인 못 함 exit 0 · `-` 시작 소스 exit 2 · lock `kit.source` `file:` · 설치 안 됨 exit 3 |
| `legacy-lock.test.ts` | 표시 줄 있는 · 없는 v1 lock의 `ambiguous`, update에서 미리 있던 `AGENTS.md`가 `.new` · null, `--prune`이 지우지 않음, uninstall이 남김, 표시 줄 있으면 그대로 update |
| `update.test.ts` | 보드: 옛 형식이면 다시 만들고 맞으면 그대로, 보드 코드가 사람 판이면 건너뜀 |
| `cli.test.ts` | 예약 목록에서 add · remove · outdated가 빠진다. add · remove만 위치 인자 |

### 11.2 Python

| 파일 | 본다 |
|---|---|
| `tests/test_cli_addremove_parity.py` (새) | §11.3 |
| `tests/test_cli_update_parity.py` | §10.2 조합 7~10 |
| `tests/test_cli_parity.py` | 조합 12(미리 있는 파일 2개)의 setup.sh lock 해시가 `-`, 표시 줄 |
| `tests/test_install.py` | 미리 있는 파일(다른 내용 · 같은 내용) → lock `-` · 해시, update.sh가 `.new` |
| `tests/test_kit_wrapper.py` (새) | `kit.sh --which`(Node 없음 · 16 · 18.2 · 18.3 · 실제), legacy 갈래가 setup.sh · update.sh · add-agent.sh로 같은 트리를 만든다(CLI 갈래와 비교), 받지 않는 플래그 exit 2, CLI 전용 명령 exit 5 |
| `tests/test_template_wording.py` | §8 문형 · 진입 파일 크기 · §9 README · 스킬 절차(`kit.sh` · `bin/harness-kit.js` · 갈래 문장) · `description` 길이 |

### 11.3 add · remove 동일성

setup.sh로 일부 하네스 · 모듈만 깔고 두 벌로 복사한다. 한 벌에 add-agent.sh, 다른 벌에 `node <cli> add`. 파일 목록 · 바이트 · 권한 · 폴더를 비교한다(lock · 메타 · `.agents/state/` 제외). lock은 의미로 본다(킷 항목 해시 = add-agent.sh lock 해시, `owner: user` ↔ `-`).

| # | 처음 설치 | 사람 준비 | 추가 | 기대 |
|---|---|---|---|---|
| A1 | jvm · hexagonal · claude | — | `codex` | 같다 |
| A2 | python · layered · claude,kiro | `.cursor/commands/hx-specify.md`에 사람 파일 | `cursor jira-workflow` | 같다. 그 파일은 사람 판, lock `owner: user` |
| A3 | web · nextjs-app · codex | — | `platform-guards claude` | 같다. 겹침 4경로 lock 레이어 = 모듈 |
| A4 | go · hexagonal · claude · jira-workflow | — | `kiro multi-harness` | 같다(모듈의 Kiro 파일 포함) |

빼기는 v1 스크립트가 없다. setup.sh로 크게 깔고 CLI `remove`한 결과를 같은 선택값의 setup.sh 새 설치와 비교한다.

| # | 처음 설치 | 사람 수정 | 빼기 | 기대 |
|---|---|---|---|---|
| R1 | electron · main-renderer · claude,codex,kiro · jira-workflow,platform-guards | — | `codex platform-guards` | 새 설치(claude,kiro · jira-workflow)와 같다. exit 0 |
| R2 | python · hexagonal · claude,cursor | cursor 파일 하나 고침 | `cursor` | 새 설치(claude) + 고친 그 파일. exit 4, lock `owner: user` |

## 12. v1 스크립트와 다른 점

| # | v1 | CLI | 이유 |
|---|---|---|---|
| A1 | add-agent.sh(setup.sh 재실행)는 지금 선택값 전체에서 빠진 파일을 모두 채운다 | `add`는 고른 이름의 몫만 채운다. 다른 빠진 파일은 `repair` · `update` 몫 | 02 §3.3 "그 몫만 깐다". 동일성 조합에는 빠진 파일이 없다 |
| A2 | 메타 `kitVersion`을 플러그인 판으로 올린다 | `kit.version`을 둔다 | 기존 킷 파일을 올리지 않았다. 다음 `update`가 판 차이를 본다 |
| A3 | lock을 새로 쓰며 orphan 줄을 버린다 | lock 항목을 모두 둔다 | `update --prune`이 지울 수 있어야 한다(HK-11 U5와 같다) |
| A4 | 매니페스트를 늘 덮는다 | 사람이 고쳤으면 `.new` · exit 4 | 프로젝트 파일을 덮지 않는다(02 §3.10) |
| A5 | 빼기가 없다 | `remove` | R12.2 |
| A6 | `--force` | 없음 | 02 §3.3 add 플래그는 `--dry-run`뿐이다 |
| A7 | update.sh는 보드 코드가 conflict일 때만 보드를 건너뛴다 | skip-user일 때도 건너뛴다 | 사람이 둔 코드를 실행하지 않는다(HK-8 D17) |

## 13. 설계와 다른 점

| # | 설계 | 이 구현 | 이유 |
|---|---|---|---|
| D1 | 10 §3.1 모듈마다 `module.json` | v1 모듈은 layout `modules` + `optional/<m>/` 폴더로 정한다. `module.json`은 만들지 않는다 | v1 모듈은 킷 파일뿐(`kind: kit`)이다. 훅 · 설정 병합 · 외부 경로가 있는 선언은 P18 · P22에서 쓴다. 만들면 setup.sh도 그 파일을 빼야 한다(HK-8 D3) |
| D2 | 02 §3.3 add 모듈에 `notion` | `notion`은 `aidlc` · `entire`와 같이 exit 2 · P22 | 코디네이터 범위(외부 도구 · 접수 출처 모듈은 P22) |
| D3 | 02 §3.3 remove "병합 키를 뺀다" | 병합 키가 없다(copy만) | merge op는 P18 |
| D4 | 02 §3.3 outdated "소스의 최신 태그" | 소스는 `--source` · `HARNESS_KIT_SOURCE` · lock `kit.source`에서 정한다. 기본 원격 주소는 없다 | 배포 원격(D3 `npx github:<owner>/…`)의 주인 이름이 킷에 없다. 정해지면 `kit.source`에 들어간다 |
| D5 | 02 §3.14 "node --version 이 v18 이상" | 18.3 이상(`kit.sh`가 판정) | HK-8 D18(`parseArgs`가 18.3부터) |
| D6 | 02 §3.14 스킬이 CLI를 직접 부른다 | 스킬은 `kit.sh`를 부르고 `kit.sh`가 CLI · v1 스크립트를 고른다 | 갈래를 문서가 아니라 코드에 두고 시험한다 |
| D7 | 02 §3.9 v1 읽기 규칙 1~4 | 둘째 줄 `# pre-existing: -`가 없으면 `sha(C) = B ≠ sha(D)`를 가리지 못한 것으로 본다(§7) | R12.6. 옛 lock은 미리 있던 파일을 그 파일 해시로 적었다 |
| D8 | 02 §3.2 `outdated` 코드 0 1 3 | 소스가 `-`로 시작하면 exit 2 | 인자로 읽히는 값을 git에 넘기지 않는다 |
| D9 | 02 §3.13 uninstall은 lock만 본다 | 표시 줄 없는 v1 lock이면 메타 선택값으로 D를 만들어 `sha(C) = B ≠ sha(D)`를 남긴다(템플릿을 못 찾으면 `sha(C) = B`를 모두 남긴다) | R12.6 — 옛 lock에서 미리 있던 사람 파일을 지우지 않는다 |
| D10 | 02 §3.3 remove: 남는 경로는 언급 없음 | 이기는 판이 바뀐 남는 경로는 update 판정(same · update · conflict)으로 맞춘다. add는 파일을 두고 레이어만 바꾼다 | remove는 v1 스크립트가 없어 새 설치와 같은 트리가 기준이다. add는 add-agent.sh(있는 파일을 건너뛴다)와 같아야 한다 |

고친 설계 문서(사실과 달라진 줄만): `docs/design/02-cli-engine.md` R7.1 "18 미만" → "18.3 미만", §3.14 절차 2 · 3의 "v18 이상 · 18 미만" → "18.3 이상(갈래는 `kit.sh`) · 18.3 미만".

## 14. 확인 필요

- 표시 줄 없는 v1 lock의 첫 update는 킷이 바꾼 미수정 파일도 `.new`로 낸다(미리 있던 파일과 가리지 못한다). v1.0.8 → v2 첫 update에서 `.new`가 그 수만큼 생긴다. 사람이 `mv`로 받으면 다음부터 정상이다. → HK-25가 바꿨다: 문서는 줄 병합, JSON은 키 병합, 배치 원본 · 킷 머리 줄 문서는 새 판(원본 백업), 코드만 `.new`.
- `remove`가 고친 파일을 `owner: user`로 바꾸면 같은 이름을 다시 `add`해도 그 파일은 사람 파일로 남는다. 킷 판을 다시 받으려면 파일을 지우고 `add`(또는 `repair`)한다.
- `outdated` 기본 소스: 배포 원격 주소가 정해지면 CLI `package.json` `repository`로 넣을지 사람이 정한다.
- `platform-guards` 모듈은 HK-10 뒤 모듈만의 파일이 없다(4개 모두 common과 겹친다). `add platform-guards`는 lock 레이어만 바꾼다.
