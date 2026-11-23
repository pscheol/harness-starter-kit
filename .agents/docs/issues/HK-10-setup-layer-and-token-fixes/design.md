---
key: HK-10
area: install
type: fix
title: setup.sh의 층 겹침 순서와 치환값 특수 문자를 고친다
status: approved
created: 2026-11-23
---

# Design — HK-10

근거: [requirements.md](requirements.md), [HK-8 design](../HK-8-cli-engine-core/design.md) §10 D1 · D2, [설계 02 §3.5 · §3.6 · §3.15](../../../../docs/design/02-cli-engine.md).

## 1. 지금 동작(d1019b4)

| 경로 | 같은 설치 경로가 두 레이어에 있을 때 | 결과 |
|---|---|---|
| setup.sh 첫 설치 | 앞 레이어를 쓰고, 뒤 레이어는 "있으면 skip"으로 건너뛴다. lock에는 두 줄(둘 다 앞 판 해시) | 앞 레이어 판 |
| update.sh 첫 실행 | 두 레이어를 차례로 처리한다. 뒤 레이어 줄이 lock 해시 = 지금 해시라 update | 뒤 레이어 판 |
| update.sh 두 번째 실행 | 앞 레이어 줄: 지금(뒤 판) ≠ 앞 판, lock 첫 줄 해시(앞 판) ≠ 지금 → conflict | 앞 판이 `.new`로 매번 생긴다 |
| CLI `init` | `layout.json` `overlap: first` | 앞 레이어 판 |

겹치는 경로는 `platform-guards` 모듈을 켤 때 4개다(`.agents/rules/platform-invariants.md` · `.kiro/steering/platform-invariants.md` · `scripts/run-guards.sh` · `scripts/guards/_template.sh`). 다른 레이어 짝(스택 ↔ 변형, 도메인 ↔ 스택)에는 겹침이 없다(템플릿 전부를 레이어 짝마다 대조해 확인).

치환: `harness_subst`가 `sed -e "s|{{K}}|v|g"`를 쓴다. 값에 `|`가 있으면 sed 구문 오류로 setup.sh가 멈추고(`set -e`), `&`는 일치 문자열, `\`는 이스케이프로 읽힌다. `harness_write_manifest`는 값을 그대로 JSON에 넣어 `\`가 든 값에서 깨진 JSON을 쓴다. `harness_load_tokens`는 메타 JSON 문자열을 sed로 읽어 `\\`를 풀지 않는다(update가 다른 값으로 렌더한다).

## 2. R10.1 뒤 레이어가 이긴다

레이어 순서: common → domains/<도메인> → stacks/<스택>(`arch/` 제외) → stacks/<스택>/arch/<변형> → optional/<모듈>(고른 순서). setup.sh · update.sh · CLI가 같은 순서다.

### 2.1 공용 함수(`hx-bootstrap/lib/harness-lib.sh`)

| 함수 | 하는 일 |
|---|---|
| `harness_list_layer <루트> [arch 제외]` | 지금 두 스크립트의 `list_layer`(같은 본문)를 옮긴다 |
| `harness_layer_roots <templates> <domain_dir> <domain> <stack> <arch> <modules>` | `"<루트>\|<라벨>\|<arch 제외>"` 줄. setup.sh의 `layer_roots`와 update.sh의 `run_layer` 호출 순서를 하나로 합친다 |
| `harness_candidates <에이전트 목록>` | stdin의 레이어 줄을 읽어 `"<라벨>\t<소속>\t<템플릿 경로>\t<설치 경로>"`를 낸다. 고르지 않은 에이전트 파일은 `HARNESS_EXCLUDED`에 센다(리다이렉트로 불러 지금 셸에서 돈다) |
| `harness_last_wins <후보> <이긴 것> <진 것>` | awk로 설치 경로마다 마지막 줄만 남긴다(원래 순서 유지). 진 후보는 `"<진 라벨>\t<이긴 라벨>\t<설치 경로>"` |

### 2.2 setup.sh

- 계획: `harness_layer_roots | harness_candidates "$AGENTS_SEL" > 후보` → `harness_last_wins` → 이긴 줄만 쓰기 루프로 처리한다(지금 `copy_tree` 본문). 같은 경로는 한 번만 쓰고 lock에 한 줄(이긴 레이어 라벨)만 남긴다.
- 진 후보마다 `  ⤳ 겹침 — 뒤 레이어가 이긴다 [<진 라벨> → <이긴 라벨>] <경로>` 한 줄, 끝 요약에 `겹침(뒤 레이어)=N`(N > 0일 때만).
- `--list-agents`의 수: 모든 에이전트로 후보를 만들어 이긴 줄을 센다(겹침을 두 번 세지 않는다).
- 임시 파일은 `mktemp -d` 한 폴더, `EXIT` trap이 지운다.

### 2.3 update.sh

같은 후보 · 이긴 줄로 `process_file`을 부른다. 새 lock도 경로마다 한 줄이다. 옛 lock(겹침 경로 두 줄)은 `harness_lock_hash`가 첫 줄을 읽는다(그대로 둔다).

| 옛 설치 | 첫 줄 해시 | 새 update 판정 |
|---|---|---|
| 옛 setup.sh만 | 앞 판 = 지금 | 뒤 판으로 update(내용이 같으면 same) |
| 옛 setup.sh + 옛 update | 앞 판 ≠ 지금(뒤 판) | 킷 뒤 판 = 지금이면 same. 킷 뒤 판이 바뀌었으면 conflict(사람이 고친 것으로 보는 안전한 쪽) |

### 2.4 `platform-guards` 모듈 파일

모듈의 4파일은 v1.0.7 판이고 common 판(v1.0.8)이 더 새롭다.

- `scripts/run-guards.sh`: common에만 하네스 루트로 `cd`하는 3줄이 있다(다른 폴더에서 부르면 모듈 판은 가드를 못 찾는다).
- `.agents/rules/platform-invariants.md`: common에 불변식 항목 2개가 더 있다.
- `.kiro/steering/platform-invariants.md`: 모듈 판에만 주석 한 줄이 더 있다. `inclusion: always`라 Kiro 세션마다 읽힌다.

뒤 레이어 우선으로 바꾸면 모듈을 켠 설치가 옛 판으로 내려간다. 그래서 모듈의 4파일을 common 판과 바이트가 같게 맞춘다. 설치 결과 바이트는 지금(setup.sh 첫 설치 = common 판)과 같고, Kiro 상시 컨텍스트도 늘지 않는다.

### 2.5 CLI

- `packages/templates/layout.json`: `"overlap": "last"`. 해석 코드(`resolve.ts`)는 이미 두 값을 받는다.
- 시험: `layout.test.ts`가 `last`를 기대한다. `plan.test.ts`의 겹침 시험은 기본(실제 layout)에서 뒤 레이어가 이기고, `overlap: first`로 바꾸면 앞 레이어가 이기는 것을 본다.
- CLI는 실행할 때 `layout.json`을 읽는다. 번들 소스 해시(`packages/cli/src/**` 등)에 `layout.json`이 없으므로 번들은 바뀌지 않는다. 그래도 `pnpm build` → `gen-plugins.mjs` 순서로 돌려 생성물을 확인한다.

## 3. R10.2 치환값 그대로 넣기

| 함수 | 바꿈 |
|---|---|
| `harness_subst` | `sed` → `LC_ALL=C awk`. 토큰 값은 환경변수(`HX_SUBST_<이름>`)로 넘겨 `ENVIRON`으로 읽는다(`-v`는 `\`를 해석한다). `RS="\001"`로 파일 전체를 한 레코드로 읽고 `index` · `substr`로 리터럴 치환한다. 토큰은 `HARNESS_TOKENS` 순서(= `layout.json` `tokens`), 빈 값은 건너뛴다. 마지막 줄바꿈이 없는 파일 · 빈 파일 · CRLF도 바이트가 그대로다(macOS awk 20200816에서 확인) |
| `harness_json_str` | 새로. awk로 `"` · `\` · 제어 문자를 JSON 이스케이프한다. Node `JSON.stringify`와 같은 출력(7가지 값으로 확인) |
| `harness_write_manifest` | `unit` · `title` · `stack`을 `harness_json_str`로 쓴다. CLI `manifestContent`와 바이트가 같다 |
| `harness_load_tokens` | `python3`가 있으면 메타를 JSON으로 읽는다(값을 NUL로 나눠 한 번에 받는다). 없으면 지금처럼 sed |
| 머리 | `shopt -u patsub_replacement 2>/dev/null \|\| true` — bash 5.2 이상에서 `${v//p/r}`의 `&`가 일치 문자열이 되는 것을 끈다(`harness_dest_name`). bash 3.2에는 없는 옵션이라 오류를 버린다 |

전제: 템플릿에 NUL · `\001` 바이트가 없다(CLI는 NUL이 든 파일을 치환하지 않는다). 시험이 전제를 확인한다.

## 4. R10.3 시험

### 4.1 동일성 매트릭스(`tests/test_cli_parity.py`)

`Case`에 `patch`(템플릿 경로 → 덧붙일 줄)를 더한다. `patch`가 있으면 `plugins/harness-kit`을 임시 폴더에 복사해 그 파일에 줄을 붙이고, setup.sh와 CLI(`--templates`)가 그 사본을 쓴다.

| # | 조합 | 노리는 것 |
|---|---|---|
| 25 | python · layered · all · platform-guards + 모듈 4파일에 표시 줄 | 겹침 경로에서 두 설치 모두 뒤 레이어(모듈) 판. lock은 경로당 한 줄, 레이어 `mod/platform-guards` ↔ `optional/platform-guards` |
| 26 | go · hexagonal · claude, `PROJECT_NAME="A&B \| C\D"` · `SERVICE_NAME="notes&api\|v2\x"` | 특수 문자 값 리터럴 치환, `.agents/harness.json`이 JSON으로 읽히고 `title`이 값과 같다 |

새 시험:

- `test_overlap_later_layer_wins`: #25에서 4경로의 표시 줄, #07 · #10 · #13 · #25에서 겹침 경로의 lock 레이어가 모듈.
- `test_special_tokens_are_literal`: #26 두 설치의 `AGENTS.md`에 값이 그대로 있고 `{{PROJECT_NAME}}`이 없다. `harness.json` `title` = 값.
- `test_templates_have_no_nul_or_soh`: §3 전제.
- 지금 24조합과 `test_same_files_bytes_and_modes` · `test_meta_and_lock_mean_the_same` · `test_doctor_passes_on_both_installs`는 26조합 전부에 돈다.

### 4.2 setup.sh ↔ update.sh(`tests/test_install.py`)

- `test_overlap_later_layer_wins_on_install_and_update`: 모듈 `run-guards.sh`에 표시 줄을 붙인 킷 사본으로 platform-guards 설치 → 표시 줄이 있다, lock에 그 경로 한 줄. update 두 번 → 두 번 모두 `conflict=0`, `.new` 없음, 표시 줄 유지.
- `test_special_token_values_survive_install_and_update`: `PROJECT_NAME="A&B | C\D"`로 설치(지금은 sed 오류로 exit 1) → `AGENTS.md`에 값 그대로. update → `update=0` · `conflict=0`.

### 4.3 CLI 단위 시험

`pnpm -C packages/cli test`(지금 129개): `layout.test.ts` · `plan.test.ts` 기대값을 §2.5대로 바꾼다.

## 5. 설계 문서와 다른 점

| 문서 | 이 구현 | 이유 |
|---|---|---|
| 설계 02 §3.6 "`harness_subst`가 `&` · `\|` · `\`를 이스케이프" | sed 이스케이프 대신 awk 리터럴 치환 | 값 안의 줄바꿈까지 그대로 넣고, sed · bash 판마다 다른 이스케이프 규칙(bash 5.2 `patsub_replacement`)을 피한다. 결과는 CLI의 `split`/`join`과 같다 |
| 설계 02 §3.15 #8 `web · feature-sliced`에 `R&D\|Lab` | 새 조합 #26(go · hexagonal)에 `A&B \| C\D` · `notes&api\|v2\x` | 기존 #10을 바꾸지 않고(24조합 유지) `\`까지 넣은 조합을 더한다 |
| HK-8 design §3 · §10 D1 `overlap: first` | `last` | 이 이슈가 D1 · D2의 "setup.sh를 고치면 `last`로" 조건을 채운다. HK-8 문서는 그때 기록이라 고치지 않는다 |
| 요구에 없음 | `platform-guards` 모듈 4파일을 common 판으로 맞춘다 | §2.4 — 바꾸지 않으면 R10.1이 모듈 설치를 옛 판으로 내린다 |
