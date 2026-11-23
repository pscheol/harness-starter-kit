---
key: HK-13
area: cli
type: feat
title: 하네스 어댑터와 복사본 배치(mirror · render · merge)로 손 유지 파일을 없앤다
state: active
created: 2026-11-23
---

# Tasks — HK-13

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | v1.0.8 기준값 기록(세션 적재량 · 포인터 수) | R9 · R8 | 실측 표 | todo |
| T2 | 단위 시험(RED): 어댑터 4 · render · merge · init · update · repair · uninstall · doctor · TS↔Python · doctor↔check_layout | R1~R8 | 실패 수 기록 | todo |
| T3 | Python 시험(RED): 동일성 기대 고침 · 업그레이드 · 적재량 · check_layout · install · harness_scripts · 문구 | R1 · R5~R9 | 실패 수 기록 | todo |
| T4 | 템플릿: 규칙 95개 `paths` · 역할 머리 5 · `../` 링크 15 · `model-policy.json` · `projection.json` · 손 유지 파일 삭제 · `AGENTS.md` 5 · 문서 문장 | R1 · R2 · R3 · R9 | 문구 · 크기 시험 | todo |
| T5 | Python `projection.py` · `projection_render.py` · `projection_merge.py` · `check_layout.py` · `check_harness.py` · verify.sh 5 · verify-checks.json | R1~R7 | Python 시험 | todo |
| T6 | setup.sh · update.sh · add-agent.sh · harness-lib.sh 연결, `sync-commands.sh` 삭제 | R1 · R8 | test_install · 동일성 | todo |
| T7 | CLI: `projection/*` · `adapters/*` · lock v1 라벨 · init · update · add · remove · repair · uninstall · doctor | R1~R8 | vitest | todo |
| T8 | 플러그인 문서(manifest · SKILL.md) · README · 설계 문서 사실 고침 | R1 | 문구 시험 | todo |
| T9 | 번들 · 생성물 · 전체 시험 · 검증 기록 | — | `gen-plugins.mjs --check` 일치 · `Ran N tests … OK` | todo |

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

| 요구 | 시험 |
|---|---|
| R1 | |
| R2 | |
| R3 | |
| R4 | |
| R5 | |
| R6 | |
| R7 | |
| R8 | |
| R9 | |

## 검증 기록

### T1 기준값(e181b6f, v1.0.8)

세션 적재량은 [design.md §11](design.md#11-세션-적재량r9) 표. 포인터 · 요약 파일(jvm · `--agents=all` · 모듈 없음): `.claude/commands` 11 · `.cursor/commands` 11 · `.kiro/skills` 11 · `.kiro/steering` 31(규칙 20 + 명령 11) · `.claude/rules` 1 · 역할 15.

## 설계와 다른 점

[design.md §14](design.md#14-설계와-다른-점).

## 남은 것
