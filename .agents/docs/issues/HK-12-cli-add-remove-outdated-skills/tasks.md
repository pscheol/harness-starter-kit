---
key: HK-12
area: cli
type: feat
title: CLI add · remove · outdated와 플러그인 스킬의 CLI 호출
state: active
created: 2026-11-23
---

# Tasks — HK-12

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | R12.6 재현 기록(setup.sh → update.sh · CLI update) | R12.6 | 출력 기록 | todo |
| T2 | 단위 시험(RED): `add` · `remove` · `outdated` · `legacy-lock`, `update` 보드, `cli` 예약 목록 | R12.1~R12.3 · R12.5 · R12.6 · R12.9 | 실패 수 기록 | todo |
| T3 | Python 시험(RED): add · remove 동일성, update 동일성 7~10, install 동일성 12의 lock, test_install 미리 있는 파일, kit.sh, 문구 · README · 스킬 절차 | R12.1 · R12.2 · R12.4 · R12.6~R12.9 | 실패 수 기록 | todo |
| T4 | setup.sh · update.sh · add-agent.sh · harness-lib.sh(표시 줄 · `-` · `--modules=`) | R12.6 · R12.1 | test_install · 동일성 | todo |
| T5 | CLI core: `selection-change` · `legacy-lock` · `git` · `board`, lock · installed 손질 | R12.1~R12.3 · R12.6 · R12.9 | 단위 시험 | todo |
| T6 | CLI 명령: `add` · `remove` · `outdated`, update · uninstall 손질, 인자 · 등록 | R12.1~R12.3 · R12.5 | 단위 시험 | todo |
| T7 | `kit.sh` · SKILL.md 3종 · 커맨드 3종 | R12.4 · R12.5 | test_kit_wrapper · 문구 시험 | todo |
| T8 | 진입 파일 · 안내 문구, README 표 | R12.7 · R12.8 | 문구 시험 · 크기 | todo |
| T9 | 번들 · 플러그인 생성물, 전체 시험 | — | `gen-plugins.mjs --check` 일치 · `Ran N tests … OK` | todo |

## 요구사항별 확인

| 요구 | 시험 |
|---|---|
| R12.1 | `add.test.ts`, `test_cli_addremove_parity` A1~A4 |
| R12.2 | `remove.test.ts`, `test_cli_addremove_parity` R1 · R2 |
| R12.3 | `outdated.test.ts`(로컬 bare 저장소, 네트워크 없음) |
| R12.4 | `test_kit_wrapper`, `test_template_wording.SkillProcedureTest` |
| R12.5 | 새 명령 `--json` = stdout JSON 하나 · stderr 0바이트(단위 · 동일성), `description` 바이트 수 시험, 런타임 의존 0 |
| R12.6 | `legacy-lock.test.ts`, `test_install` 미리 있는 파일, `test_cli_parity` 조합 12, `test_cli_update_parity` 9 · 10 |
| R12.7 | `test_template_wording` 문형 · 진입 파일 크기 |
| R12.8 | `test_template_wording.ReadmeCountTest` |
| R12.9 | `update.test.ts` 보드, `test_cli_update_parity` 7 · 8 |

## 검증 기록

(구현하며 채운다)
