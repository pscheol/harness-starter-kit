---
key: HK-13
area: cli
type: feat
title: 하네스 어댑터와 복사본 배치(mirror · render · merge)로 손 유지 파일을 없앤다
state: completed
created: 2026-11-23
---

# Tasks — HK-13

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | v1.0.8 기준값 기록(세션 적재량 · 포인터 수) | R9 · R8 | 실측 표 | done |
| T2 | 단위 시험(RED): 어댑터 4 · render · merge · init · update · repair · uninstall · doctor · TS↔Python · doctor↔check_layout | R1~R8 | 실패 수 기록 | done |
| T3 | Python 시험(RED): 동일성 기대 고침 · 업그레이드 · 적재량 · check_layout · install · harness_scripts · 문구 | R1 · R5~R9 | 실패 수 기록 | done |
| T4 | 템플릿: 규칙 95개 `paths` · 역할 머리 5 · `../` 링크 15 · `model-policy.json` · `projection.json` · 손 유지 파일 삭제 · `AGENTS.md` 5 · 문서 문장 | R1 · R2 · R3 · R9 | 문구 · 크기 시험 | done |
| T5 | Python `projection.py` · `projection_wants.py` · `projection_engine.py` · `projection_render.py` · `projection_merge.py` · `check_layout.py` · `check_harness.py` · verify.sh 5 · verify-checks.json | R1~R7 | Python 시험 | done |
| T6 | setup.sh · update.sh · add-agent.sh · harness-lib.sh 연결, `sync-commands.sh` 삭제 | R1 · R8 | test_install · 동일성 | done |
| T7 | CLI: `projection/*` · `adapters/*` · lock v1 라벨 · init · update · add · remove · repair · uninstall · doctor | R1~R8 | vitest | done |
| T8 | 플러그인 문서(manifest · SKILL.md) · README · 설계 문서 사실 고침 | R1 | 문구 시험 | done |
| T9 | 번들 · 생성물 · 전체 시험 · 검증 기록 | — | `gen-plugins.mjs --check` 일치 · `Ran N tests … OK` | done |

## 규칙 `paths`(T4)

`S*` = 다섯 스택 소스(`**/*.kt` `**/*.kts` `**/*.java` `**/*.py` `**/*.go` `**/*.ts` `**/*.tsx` `**/*.js` `**/*.jsx` `**/*.mjs` `**/*.cjs`). `S(스택)` = jvm `**/*.kt` `**/*.kts` `**/*.java` · python `**/*.py` · go `**/*.go` · web · electron `**/*.ts` `**/*.tsx` `**/*.js` `**/*.jsx` `**/*.mjs` `**/*.cjs`. `B(스택)` = 빌드 파일(jvm `**/*.gradle` `**/*.gradle.kts` `gradle/**` `**/pom.xml` · python `**/pyproject.toml` `**/requirements*.txt` `uv.lock` · go `**/go.mod` `go.sum` `.golangci.yml` · web · electron `**/package.json` `**/tsconfig*.json` `pnpm-workspace.yaml`). `UI` = `**/*.tsx` `**/*.jsx` `**/*.vue` `**/*.css` `**/*.scss` `**/*.html`.

| 규칙 | `paths` |
|---|---|
| `agent-harness` | `.agents/**` `scripts/**` `AGENTS.md` `CLAUDE.md` `.claude/**` `.codex/**` `.cursor/**` `.kiro/**` |
| `code-maintenance` · `design-principles` · `reuse-before-new` | `S*` |
| `git-workflow` | `.agents/docs/issues/**` `scripts/git-hooks/**` `.github/**` `.gitlab-ci.yml` |
| `platform-invariants`(common · 모듈) | `S*` `scripts/guards/**` `scripts/run-guards.sh` |
| `pr-review-policy` | `.agents/docs/issues/**` `.agents/roles/**` |
| `product` | `.agents/docs/**` `docs/**` `README.md` |
| `sdd-workflow` | `.agents/docs/**` `scripts/new-feature.sh` `scripts/board.sh` |
| `session-collaboration` | `S*` `.agents/docs/**` |
| `verification-ladder` | `S*` `scripts/verify.sh` `.agents/verify-checks.json` `.agents/docs/issues/**` |
| `writing-style` | `**/*.md` |
| 스택 `api-standards` | `S(스택)` `.agents/docs/openapi/**` |
| 스택 `code-comments` · `quality-score` · `reliability` | `S(스택)` |
| 스택 `guardrails` | `S(스택)` `B(스택)` `.agents/docs/**` `ARCHITECTURE.md` |
| 스택 `security` | `S(스택)` `B(스택)` `**/*.yml` `**/*.yaml` |
| 변형 `structure` | `S(스택)` `ARCHITECTURE.md` |
| 변형 `tech` | `S(스택)` `B(스택)` |
| 도메인 frontend 4개 | `UI` |
| jira-workflow 2개 | `.agents/issue-tracker.yml` `.agents/docs/issues/**` |

## 요구사항별 확인

| 요구 | 시험 | 결과 |
|---|---|---|
| R1 | `adapters.test.ts`(4 어댑터 스냅숏) · `projection-init.test.ts` "하네스 폴더 파일 = lock 항목, 링크 0, 포인터 0" · "실제 템플릿 · 하네스 전부" · `test_cli_parity.test_projection_copies_instead_of_pointers`(26조합) · `test_install.test_skill_and_rule_copies_match_sources` | 충족. 남는 copy는 D11 목록뿐이다 |
| R2 | `projection-render.test.ts` "paths 하나 · 여럿 · 없음" · `projection-init.test.ts` "규칙 paths → … 늘 싣는다" · `test_context_budget.test_kit_rules_have_paths` | 충족 |
| R3 | `projection-render.test.ts` 역할 6개(위임 역할만 모델 · 잠긴 역할 오류 · 정책 없음 · md · toml · json) · `projection-init.test.ts` "역할 원본 하나 → …" | 충족. 본문 전체를 싣는다(D1) |
| R4 | `projection-merge.test.ts` CLAUDE.md 5개 · `projection-render.test.ts` "Claude 킷 블록은 1.5KB 이하" | 충족. 블록 743바이트 |
| R5 | `projection-update.test.ts` 5개 · `projection-ops.test.ts` doctor 2 · repair 2 · uninstall 2 · `projection-parity.test.ts` doctor ↔ check_layout | 충족 |
| R6 | `test_check_layout` 6개(새 설치 통과 · 원본 고침 → fast exit 1 → repair → 0 · Node 없는 `projection.py sync` · `relative-ref` · v1 lock 한 줄 · 500항목 1초) | 충족 |
| R7 | `projection-merge.test.ts` ".gitattributes" · `projection-init.test.ts` "CLAUDE.md … .gitattributes" | 충족 |
| R8 | `projection-update.test.ts` v1 포인터 3개 · `test_projection_upgrade` 6개 | 충족. 표시 줄 없는 v1.0.8 lock은 첫 update에서 규칙이 `.new`가 되어 배치를 미루고, `.new`를 받아들인 다음 update에서 바뀐다(D12 · §15) |
| R9 | `test_context_budget` 3개(스택 5 × 하네스 4, 새 값 ≤ v1.0.8) · `test_projection_upgrade.test_session_context_does_not_grow_after_upgrade` · `projection-init.test.ts` "늘 싣는 킷 규칙 0" | 충족. 아래 표 |

## 검증 기록

### T1 기준값(e181b6f, v1.0.8)

세션 적재량은 [design.md §11](design.md#11-세션-적재량r9) 표. 포인터 · 요약 파일(jvm · `--agents=all` · 모듈 없음): `.claude/commands` 11 · `.cursor/commands` 11 · `.kiro/skills` 11 · `.kiro/steering` 31(규칙 20 + 명령 11) · `.claude/rules` 1 · 역할 15.

### RED(시험 커밋 `87ffb91`, 구현 전)

- vitest: `Test Files  7 failed | 15 passed (22)` · `Tests  24 failed | 208 passed (232)`. 실패는 모두 새 시험 7파일이다(어댑터 · render · merge 모듈이 없어 불러오기에서 멈춘 파일 포함). 기존 15파일 208개는 통과했다.
- Python(`test_cli_parity` · `test_install` · `test_check_layout` · `test_context_budget` · `test_template_wording`): `Ran 50 tests in 541.271s` · `FAILED (failures=38, errors=3, skipped=1)`. 배치 시험 26조합(포인터가 남는다) · 스택별 core 파일 5 · check_layout 6 · 적재량(`setUpClass`, 측정 함수 없음) · 복사본 시험 · 설치본 harness_scripts.
- `tests/harness_scripts`: `Ran 362 tests in 146.296s` 중 2개 실패(Kiro steering 없는 규칙 · 세 클라이언트가 한 스킬 원본을 가리킴 — 배치 기준 문구).

### GREEN

- vitest: `Test Files  22 passed (22)` · `Tests  268 passed (268)`.
- `test_cli_parity` · `test_cli_update_parity` · `test_cli_addremove_parity` · `test_kit_wrapper` · `test_multi_harness_module` · `test_generated` · `test_projection_upgrade`: `Ran 52 tests in 223.318s` · `OK`(모듈 분할 뒤).
- `test_install`: `Ran 20 tests in 397.375s` · `OK`.
- `test_check_layout` · `test_template_wording`: `Ran 17 tests in 10.877s` · `OK`.
- `node scripts/gen-plugins.mjs --check`: `생성물 일치: 파일 371개`.
- 전체: `python3 -m unittest discover -s tests -p "test_*.py"` → `Ran 92 tests in 673.863s` · `OK`(HK-12는 76개, 새 시험 16개).
- GREEN 중 고친 시험 기대:
  - `test_cli_addremove_parity`: 하네스 폴더 파일은 배치 판정(`projection.ops`)에 있다 — 복사 판정과 합쳐 센다(`all_ops`).
  - `test_cli_update_parity` #05: 사람 파일 자리의 새 킷 규칙을 update.sh는 `.new`로 두고 배치를 미루며, CLI는 사람 파일을 원본으로 바로 배치한다(D16). 차이는 `.claude/rules/zz-hk11-new.md` 한 경로다.
  - `test_projection_upgrade`: 표시 줄 없는 v1.0.8 lock의 첫 update는 배치를 미룬다(D12). 두 단계(update → `.new` 받아들임 → update)로 본다.
  - HK-11 vitest(update · repair · uninstall): 모르는 op 시험은 `symlink`로 바꾸고, 배치 명세가 없는 킷이 배치 항목을 그대로 두는 시험을 더했다.

### 세션 적재량(R9, 바이트, `--agents=all` · 모듈 없음)

| 스택 | claude | codex | cursor | kiro |
|---|---|---|---|---|
| jvm | 10,307 → 8,537 | 9,890 → 8,537 | 9,071 → 7,718 | 26,575 → 8,561 |
| python | 10,563 → 8,810 | 10,146 → 8,810 | 9,327 → 7,991 | 26,826 → 8,834 |
| go | 10,987 → 9,132 | 10,570 → 9,132 | 9,751 → 8,313 | 27,254 → 9,156 |
| web | 12,021 → 9,834 | 11,604 → 9,834 | 10,785 → 9,015 | 33,187 → 9,858 |
| electron | 12,427 → 9,928 | 12,010 → 9,928 | 11,191 → 9,109 | 33,920 → 9,952 |

새 값의 구성(jvm): 진입 파일 6,461 + 늘 싣는 규칙 0 + 설명 2,076(Cursor 1,257 · Kiro 2,100). 늘 싣는 킷 규칙은 0개다(D2).

### 번들 · 배치 파일 수

- `packages/cli/dist/cli.js` 219,010바이트(gzip -9 57,096). HK-12는 132,960바이트(gzip 35,266). 런타임 의존성 0.
- 배치 파일(jvm · `--agents=all` · 모듈 없음): claude 49 · codex 6 · cursor 31 · kiro 58, 그리고 `.gitattributes` 1. frontend 스택은 claude · cursor · kiro에 4개씩 더한다.
- 템플릿에서 손 유지 파일 132개를 지웠다(`common/claude/**` · `common/cursor/**` · Kiro 스킬 · steering · Codex 역할 · `config.toml` · Kiro 역할 JSON 5 · 스택 `CLAUDE.md` 5 · jira 모듈 하네스 사본).
- Python 모듈은 800줄 아래로 나눴다: `projection.py` 218 · `projection_wants.py` 327 · `projection_engine.py` 523 · `projection_merge.py` 494 · `projection_render.py` 348 · `check_layout.py` 241.

### 설계 문서에서 고친 줄(사실이 바뀐 곳만)

- `docs/design/03-projection-and-hooks.md` 251행: 역할 생성 결과는 본문 전체를 넣는다(D1 · D8).
- 같은 문서 424행 · 427행: `sync_projection.py` → `projection.py sync`(D7).
- 같은 문서 429행: Python 모듈 목록(`projection_wants.py` · `projection_engine.py` 더함).

## 설계와 다른 점

[design.md §14](design.md#14-설계와-다른-점) D1~D16.

## 남은 것

- [design.md §15](design.md#15-확인-필요): Kiro `fileMatchPattern` 배열 형식 · Cursor `globs` 쉼표 목록과 빈 `description` · Claude `paths`가 Read한 파일에도 적용되는지(수동 점검) · 표시 줄 없는 v1.0.8 lock의 첫 update에서 규칙 배치가 미뤄지는 문제(사람 결정) · CLI 기본 `issueKey.prefix` 형식.
- 어댑터 `checkedVersion`은 "미확인"이다. 릴리스 점검표(03 §5 #4, HK-22)에서 확인한 하네스 판을 적는다.
- 훅 설정 생성(`.codex/hooks.json` · `.kiro/hooks/*.json` · Claude 훅의 hooks.json 원본)과 동기화 훅 `harness-sync-projection`은 HK-24 몫이다. 그 전에는 `repair` · `projection.py sync`로 맞춘다.
