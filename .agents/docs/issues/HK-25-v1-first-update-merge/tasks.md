---
key: HK-25
area: cli
type: feat
title: v1.0.8 설치본 첫 업데이트의 구별 불가 파일을 병합하고, 빈 platform-guards 모듈을 없앤다
state: in-progress
created: 2026-11-24
---

# Tasks — HK-25

설계: [design.md](design.md). 시험을 먼저 쓰고(RED) 구현한다(GREEN).

| ID | 할 일 | 요구 | 확인 | 상태 |
|---|---|---|---|---|
| T1 | 병합 fixture(C · D · 기대) · TS↔Python 동일성 시험 · `v1-first-update` · 없앤 모듈 단위 시험(RED) | R1 · R2 · R3 | 실패 수 기록 | todo |
| T2 | Python 시험(RED): update 동일성 #07 · #09 · #11, 설치 동일성 #07 · #10 · #25, add · remove A3 · R1, kit.sh, 업그레이드, 문구 | R1 · R2 · R3 | 실패 수 기록 | todo |
| T3 | `v1_merge.py` · `core/v1-merge.ts` | R1 | `v1-merge.test.ts` | todo |
| T4 | update.sh · CLI update 병합 · 백업 · 목록 · `CLAUDE.md` 백업 | R1 | `v1-first-update.test.ts` · update 동일성 | todo |
| T5 | platform-guards 삭제: 템플릿 · layout · harness-lib · setup.sh · add-agent.sh · update.sh · kit.sh · CLI | R2 | 단위 · 동일성 | todo |
| T6 | 문서: README · 가이드 · 플러그인 문서 · 도움말 · verify.sh 주석 · 설계 02 | R2 | 문구 시험 · grep | todo |
| T7 | 번들 · 플러그인 생성물 · 전체 시험 · 기록 | — | `gen-plugins.mjs --check` 일치 · `Ran N tests … OK` | todo |

## 검증 기록

(구현하며 채운다)
