---
key: HK-10
area: install
type: fix
title: setup.sh의 층 겹침 순서와 치환값 특수 문자를 고친다
state: completed
created: 2026-11-23
---

# Tasks — HK-10

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN). setup.sh와 CLI는 같은 커밋에서 바꾼다(R10.3).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 시험 작성(RED): 동일성 #25 · #26과 새 시험 3개, install 시험 2개, CLI 시험 기대값 | R10.1~R10.3 | 실패 수 기록 | done |
| T2 | `harness-lib.sh` 후보 · 뒤 레이어 우선 함수, setup.sh · update.sh 적용 | R10.1 | install 시험 | done |
| T3 | `platform-guards` 모듈 4파일을 common 판으로 | R10.1 | 바이트 비교 | done |
| T4 | `layout.json` `overlap: last` · CLI 시험 | R10.1 · R10.3 | `pnpm -C packages/cli test` | done |
| T5 | `harness_subst` awk 리터럴 · `harness_json_str` · `harness_load_tokens` | R10.2 | install · 동일성 시험 | done |
| T6 | 생성(`pnpm build` · `gen-plugins.mjs`) · 동일성 26조합 · 전체 시험 | R10.3 | `Ran N tests … OK` | done |

## 검증 기록

- 사전 확인: 템플릿 레이어 짝을 모두 대조해 겹치는 설치 경로는 common ↔ `platform-guards`의 4개뿐이다(3개 내용 다름, `_template.sh`만 같음). awk 리터럴 치환은 macOS awk 20200816에서 마지막 줄바꿈 없음 · 빈 파일 · CRLF · 값 안 줄바꿈을 바이트 그대로 냈다. `harness_json_str`은 7가지 값(`&` · `|` · `\` · `"` · 탭 · 줄바꿈 · 한글 · `\001`)에서 Node `JSON.stringify`와 같았다.
- T1 RED(구현 전, 커밋 `ba9e16a` 위):
  - `tests/test_cli_parity.CliParityTest` 7개: 하위 시험 26개 실패.
    - `test_overlap_later_layer_wins` 22개: #25 네 경로 × 두 설치의 표시 줄 8, lock 레이어 14(#07 3 · #10 3 · #13 4 · #25 4 — 두 설치 모두 앞 레이어 `common`).
    - #26(특수 문자): `test_same_files_bytes_and_modes` · `test_meta_and_lock_mean_the_same` · `test_doctor_passes_on_both_installs` 각 1과 `test_special_tokens_are_literal` 1 — setup.sh가 `sed: bad flag in substitute command`로 멈췄다.
    - `test_templates_have_no_nul_or_soh_bytes`는 통과(전제 확인).
  - `tests/test_install` 새 2개 실패: 첫 설치가 common 판 `run-guards.sh`를 깔았다 · `PROJECT_NAME="A&B | C\D"` 설치가 exit 1.
  - `pnpm -C packages/cli test`: 129개 중 2개 실패(`layout.test.ts` `last` 기대, `plan.test.ts` 실제 layout에서 뒤 레이어 기대).
- T2~T5 GREEN:
  - `pnpm -C packages/cli test`: `tsc --noEmit` 오류 0, 8파일 129개 통과.
  - `tests/test_install` 4개 OK(새 2개 + 기존 update 시험 2개). update 두 번 모두 `update=0 … conflict=0`, `.new` 0개.
  - `tests/test_cli_parity` 12개 OK(동일성 7 · 번들 5), 26조합, 61초.
  - 손 확인: python · claude,kiro · platform-guards 설치가 겹침 4줄과 `겹침(뒤 레이어)=4`를 내고 lock은 경로당 한 줄. `--list-agents` core 198(모듈 core 3이 겹쳐 늘지 않음). `--dry-run`은 파일을 쓰지 않는다. `hx-agent-add --agents=codex` → `write=8, skip=270`, 이어서 update `same=278 conflict=0`.
- T6:
  - `pnpm build` → `dist/cli.js 66436 bytes · src-sha256 944e2a4a75a4`(CLI 소스는 바뀌지 않았다). `node scripts/gen-plugins.mjs --check` → `생성물 일치: 파일 494개`.
  - 전체 시험(커밋 `805bfe0`): `Ran 45 tests in 534.980s` · `OK`(HK-9 뒤 40개 + 동일성 3 + install 2).

## 바꾼 기존 시험과 이유

| 시험 | 바뀐 단언 | 이유 |
|---|---|---|
| `packages/cli/test/layout.test.ts` 「실제 layout.json 을 읽는다」 | `overlap` `first` → `last` | R10.1 |
| `packages/cli/test/plan.test.ts` 겹침 두 시험 | 기본(실제 layout)에서 모듈 판 · `winner: optional/platform-guards` · 작업 1개. `first`는 패치로 따로 본다 | R10.1 |
| `packages/cli/test/cli.test.ts` 「init 이 파일 · 메타 v2 · lock v2 · 매니페스트를 쓴다」 | `scripts/guards/_template.sh` lock 레이어 `common` → `optional/platform-guards` | R10.1 — RED 목록에 없던 시험이다. 레이어 값을 고정해 둔 시험이라 `layout.json`을 바꾼 뒤 실패했다 |
| `tests/test_cli_parity.py` `install_pair` · `setup_args` · `cli_args` | 조합마다 setup.sh · 템플릿 경로를 받는다(기본값은 지금과 같다) | #25가 템플릿 사본을 쓴다 |
| `tests/test_install.py` `install()` | `setup` 인자(기본 `SETUP`) | 새 겹침 시험이 플러그인 사본을 쓴다 |

## 설계와 다른 점

설계 문서(02 · HK-8)와 다른 점은 [design.md §5](design.md#5-설계-문서와-다른-점)에 적었다. 구현 중 design.md를 한 곳 고쳤다.

| design.md(커밋 `ba9e16a`) | 구현 | 이유 |
|---|---|---|
| §3 `harness_load_tokens`가 값을 NUL로 나눠 python 한 번에 받는다 | `harness_meta_token`이 토큰마다 python을 한 번 부른다(9번) | 프로세스 치환 안의 heredoc · NUL 읽기를 bash 3.2에서 피한다. update · add-agent에서만 돌아 설치 시간에는 영향이 없다 |

## 남은 것

- `harness_dest_name`(`__PROJECT_SLUG__` 경로 토큰)은 bash 대체 문법이다. `shopt -u patsub_replacement`로 bash 5.2 이상의 `&` 해석을 끈다. 이 장비에는 bash 3.2만 있어 5.2에서는 돌려 보지 않았다.
- `python3`가 없는 환경의 `harness_meta_token`은 sed로 읽어 `\` · `"`가 든 치환값을 JSON 이스케이프된 채로 읽는다(지금과 같다). 그 환경의 메타 쓰기(`harness_write_meta` 대체 경로)도 값을 이스케이프하지 않는다.
- 옛 lock(겹침 경로 두 줄)은 `harness_lock_hash`가 첫 줄을 읽는다. 옛 setup.sh + 옛 update를 거친 리포에서 킷이 모듈 판을 바꾸면 그 파일이 한 번 conflict로 보인다(사람이 고친 것으로 보는 안전한 쪽, design §2.3).
- `platform-guards` 모듈의 4파일이 common과 같아져 모듈이 더하는 파일이 없다. 모듈을 남길지(설명 · 승격 절차 전용) 없앨지는 사람이 정한다.
