---
key: HK-19
area: design
type: feat
title: 킷 설계 단계 — 요구사항 접수 · /hx-intent · Unit 목록 · 질문 · 기획물 · 역할 배정
status: in-review
created: 2026-11-24
---

# Design — HK-19

근거: [requirements](requirements.md), [설계 08](../../../../docs/design/08-design-stage.md) DS-R1~R28 · §3.1~§3.16, [설계 12](../../../../docs/design/12-model-routing.md) MR-R6 · R7 · R10 · R11 · R12(R1~R5 · R8 · R9 는 HK-13 에서 끝), [06](../../../../docs/design/06-dashboard.md) §3.7 · §3.8(답 API) · §3.16, [07](../../../../docs/design/07-skills-inventory.md) §3.7(스킬 지도), [01](../../../../docs/design/01-verification-and-sdd.md)(이슈 키). 선행: HK-3(이슈 SDD · `new-feature.sh`), HK-13(역할 render · model-policy), HK-17(관리 페이지 — Intent 읽기 · 질문 답 API · Unit 제안 · intent 게이트 승인), HK-23(approvals.md · `sdd_gates.py`), HK-24(세션 시작 상태 예산), HK-14(개인 층 · 게이트 하한).

킷 · 스크립트 · 훅은 모델을 부르지 않는다. 설계 세션(사람이 연 Claude 세션)이 스킬 지시대로 글을 쓰고, 킷은 **판정 · 검사 · 옮기기**만 결정적으로 한다. 세션에 실리는 바이트는 스킬 설명(300자 이하)만큼만 는다(§9).

## 1. 범위

| 이 이슈 | 다른 이슈 |
|---|---|
| Intent 폴더 · 템플릿 · 키 · 다음 단계 판정 · 검사(units · questions · 스토리 배정 · 고리) | AI-DLC 어댑터 · `sync aidlc` · `intent.json` 생성(HK-20). 여기서는 `flow.design=aidlc` 일 때 `/hx-intent` 가 안내하고 끝나는 것(DS-R18)과 `intent.json` 읽기만 |
| 접수 `intake`(글 · 파일 첨부 · 신뢰하지 않는 입력 처리 · 비밀값 검사) | 접수 출처 `jira:` · `notion:`(HK-20), `ops:`(HK-21), 관리 페이지 S11 화면(HK-18 — API `/intake` 는 이 이슈) |
| 역공학: codebase 모델 · `current-state.md` · `codebase_scan.py`(정적 행) · 출처 · 오래됨 검사 · codebase 게이트 | |
| 기획물 템플릿 · 필수 제목 검사 · 와이어프레임 검사 · backlog 생성 구간 | 기획물 렌더 화면(HK-18) |
| `/hx-specify --from-unit`(결정적 부분 `from_unit.py`) · dependsOn 계약 design 승인 검사(DS-R10) | Jira 작업 항목 만들기(HK-20, DS-R13 은 키 규칙만) |
| 몹 정리(`mob start · next · close`, 답 API 의 참석자) · 위험 프로필 · risk high 두 사람 승인 · 불변식 | |
| 설계 역할 원본 `designer.md` · 세션 시작 역할 안내(DS-R19) · MR-R6/R7/R10/R11/R12 | 사용량 화면 · 기록(HK-18) |

## 2. 파일

| 자리 | 내용 |
|---|---|
| `agents-docs/_spec-templates/intent/_template.md` · `questions.md` | 08 §3.2 · §3.3 그대로(머리 · 제목 · ID 규칙) |
| `agents-docs/_spec-templates/codebase/_template.md` · `intent/current-state.md` | 08 §3.13 |
| `agents-docs/_spec-templates/plans/{requirements-doc.md, screens/index.md, screens/_wireframe.html, design-plan.md, backlog.md}` | 08 §3.8 필수 제목 · 생성 구간 표지 |
| `agents-root/roles/designer.md` | 설계 역할(질문 형식 · 분해 기준 · 기획물 규칙 · "Intent 폴더만 쓴다, 승인 · 답 줄은 쓰지 않는다"). class `design`, mode `write` |
| `agents-rules/mob-elaboration.md` | 08 §3.14 규칙 원본(`paths: [".agents/docs/intents/**"]` — 그 폴더를 다룰 때만 실린다) |
| `agents-skills/hx-intent/SKILL.md` | 새. `/hx-intent "<요약>"` · `<키>` · `--new <파일…>` — 다음 단계는 `intent.py next` 가 정하고 그 단계만 한다 |
| `agents-skills/hx-plans/SKILL.md` | 새. 기획물 셋을 하나의 스킬로: `/hx-plans screen|design|backlog|doc <INT>`(§8 — 설계 08 의 세 명령 이름을 하나로 묶는다) |
| `agents-skills/hx-specify/SKILL.md` · `hx-analyze/SKILL.md` | `--from-unit` 절 · 불변식 검사 절 더함 |
| `scripts/harness/intent.py` | `new` · `next` · `check` · `key` · `backlog` 하위 명령(§3) |
| `scripts/harness/intake.py` | 접수(§4) |
| `scripts/harness/codebase_scan.py` · `codebase_check.py` | 정적 행 · 출처 · 오래됨(§5) |
| `scripts/harness/from_unit.py` | `/hx-specify --from-unit` 의 결정적 부분(§6) |
| `scripts/harness/plan_check.py` · `wireframe_check.py` | 필수 제목 · 와이어프레임(§7) |
| `scripts/harness/mob.py` | 몹 세션 열기 · 다음 회차 · 닫기(§10) |
| `scripts/harness/invariants.py` | INV · KEEP 근거 · 시험 연결(§11) |
| `scripts/new-intent.sh` | `intent.py new` 의 셸 입구(이슈의 `new-feature.sh` 와 같은 자리) |
| `scripts/check-sdd-prerequisites.sh` | `--stage design|tasks` 앞에서 requirements 머리 `dependsOn` 이슈의 design approved(DS-R10) |
| `scripts/verify.sh` 진입 블록 · `verify_planner.py` | fast · changed: 바뀐 Intent 폴더 → `intent.py check`, `codebase/` · Intent → `codebase_check.py`(경고), `plans/` → `plan_check.py` · `wireframe_check.py` |
| `scripts/hooks/session-context.py` | 세션 시작 상태 줄: `role: design` 세션에 "Intent 폴더만 쓴다 · 승인 · 답 줄은 쓰지 않는다", 현재 하네스 ≠ `roles.design.harness` 면 한 줄 경고(DS-R19, 상태 예산 512 안) |
| `scripts/hooks/protect_approvals.py` | `questions.md` 의 `- 답:` 줄을 에이전트가 쓰지 못하게(08 §3.3 · 09 §3.8) |
| `hooks.json` · `scripts/hooks/subagent-result-cap.sh` | Claude `SubagentStop` — 위임 결과가 `limits.subagentResultMaxChars`(기본 6,000) 넘으면 exit 2 + "결론 · 근거만 남겨 6,000자 이하로 다시 끝낸다"(MR-R10). `hookMap.events` 에 `subagent-stop: {claude: SubagentStop}` |
| CLI `packages/cli` | `harness-kit intake` · `mob start|next|close`(예약 명령 해제) · `status --intent` 에 다음 단계 · codebase 상태 |
| 관리 페이지 API `packages/dashboard/src` | `POST /intake`(501 → 실제, 06 §3.8.1), 답 API 의 몹 참석자(DS-R24), codebase 게이트 승인 앞 조건(422 `model_stale`), risk high 두 사람(DS-R26) |

## 3. `intent.py`

| 하위 명령 | 하는 일 | 출력 |
|---|---|---|
| `key [--jira]` | 다음 Intent 키: jira 모듈이면 안내만(키는 에픽), 아니면 base 브랜치 + 작업 트리의 `INT-*` 최대 번호 + 1 | `INT-8` |
| `new "<요약>" [--name <kebab>] [--kind product|feature|change|refactor]` | 폴더 `<키>-<이름>/` 에 `intent.md`(draft) · `questions.md`(open, round 1, 빈 질문 자리) 를 템플릿에서 만든다. 이름은 영문 kebab 3~5단어(없으면 거부하고 형식 안내) | 경로 |
| `next <키|폴더> [--json]` | 08 §3.1 표 그대로의 판정(DS-R2). 판정은 파일 상태(머리 status · 질문 열림 · `answersSha256` · units.json 유무 · approvals.md 게이트 기록 · flow.gates · `kind`)만 본다 | `{step, reason, blocking[]}` 와 사람 줄 |
| `check <폴더> [--json]` | DS-R3(질문 형식 · 회차당 5개 · 선택지 2~4 · 권장 1) · DS-R5(분해 판정 수치와 §10 일치) · DS-R6(도메인 사이 계약 → contract Unit + dependsOn) · DS-R7(고리 · 없는 Unit) · DS-R8(스토리 배정 · unassigned 이유) · units 필드 규칙(08 §3.5 표) · `[NEEDS CLARIFICATION` 위치 | 문제 줄, exit 1 |
| `backlog <폴더>` | `plans/backlog.md` 의 `BACKLOG:BEGIN … END` 구간을 다시 쓴다. 단계는 `sdd_gates.py stage`(Python, 06 §3.3 과 같은 계산 — HK-17 TS 와 같은 fixture 로 묶는다, DS-R17) | 바꾼 줄 수 |

규칙의 원본은 이 스크립트다. 관리 페이지(TS)는 같은 판정이 필요하면 `intent.py next --json` 결과와 같아야 한다(공용 fixture 시험).

## 4. 접수 `intake.py`(08 §3.11)

```text
intake.py new --title "<제목>" --kind feature|change|refactor|product|bug [--text-file f | --text -] [--attach <파일>…] [--link <URL>…]
```

- `bug` 는 Intent 를 만들지 않고 `new-feature.sh --next` 로 이슈를 만들어 `attachments/` 에 둔다. 나머지는 `intent.py new` 로 Intent 폴더를 만들고 `intake.md` · `attachments/` · `attachments.json`.
- 신뢰하지 않는 입력: 제어 문자(줄바꿈 · 탭 제외) · 방향 제어(U+202A~U+202E, U+2066~U+2069) 지움, `intake.md` 머리 `trust: untrusted`. 문자열 처리만(모델 없음).
- 비밀값: `gitleaks` 가 있으면 그것, 없으면 킷 정규식(AWS 키 · 사설 키 머리 · 토큰 꼴 · `password=`)으로 텍스트 첨부 · 추출본을 보고, 걸리면 그 파일을 저장하지 않고 이유를 낸다. 주민등록번호 · 전화번호 꼴은 경고만.
- 추출: md · txt · yaml · json 그대로, csv 는 md 표, PDF 는 `pdftotext` 가 있으면, hwp/hwpx · docx/pptx 는 변환기가 있으면(없으면 attachments.json 에 "추출 못 함"). 이미지는 원본만(설명 md 를 만들지 않는다 — 원칙 10).
- 제한: 파일 20MB · 합계 100MB(meta `intake.maxFileMB` · `maxTotalMB` 로 바꾼다). `intake.storeBinaries: false` 면 원본은 `.agents/state/attachments/` 에만.
- 관리 페이지 `POST /intake`(multipart 없이 base64 JSON 본문, 크기 상한) · CLI `harness-kit intake` 가 같은 스크립트를 부른다. 접수 뒤 세션 요청은 사람이 고를 때만(HK-17 규칙 — 자동 요청 없음).

## 5. 역공학(08 §3.13)

- `codebase_scan.py <영역> --paths <glob>…`: 그 컴퓨터에 있는 것만 쓴다 — jvm(settings.gradle · pom 모듈, import 줄, Flyway/Liquibase 파일 · `@Entity`, `@*Mapping`), python(pyproject · `ast` import · Alembic · 라우트 데코레이터), web/electron(package.json workspaces · import · Prisma), go(go.mod · `go list -deps -json` 있으면). 정적 행(`static:<도구>`)만 다시 만들고 `inferred` · `confirmed` 행은 둔다. 없는 도구는 `scanner.missing`.
- `codebase_check.py <파일|폴더>`: 출처 칸 형식(DS-R22: `static:` · `inferred · <파일:줄>` · `confirmed:Q-<n>`, inferred 는 근거 위치 필수 → fast 실패), 오래됨(DS-R23: baseSha 조상 · `git diff --numstat` 줄 합 > `codebase.staleLines`(200) 또는 A·D·R 파일 ≥ `staleFiles`(3) → 경고). 관리 페이지 codebase 승인 API 는 같은 계산으로 422 `model_stale`.
- `current-state.md` 템플릿 · `KEEP-n` 은 `/hx-specify --from-unit` 이 requirements Edge Cases 로 옮긴다.

## 6. `/hx-specify --from-unit`(08 §3.7)

`from_unit.py <INT>/<U-n> [--dry-run]` 가 1~7단계를 결정적으로 한다: intent 게이트(flow.gates 에 있으면 approvals.md 기록 필요, DS-R9) → 이미 issue 있으면 경로(DS-R12) → dependsOn 중 issue 없는 Unit 이 있으면 "U-1(계약)부터" → 키(jira 모듈이면 "Jira 작업 항목 키를 --key 로 준다" 안내, 아니면 01 키 규칙 `new-feature.sh --next`) → requirements 를 08 §3.7 표대로 채운다(머리 `intent` · `unit` · `area` · `dependsOn` · `profile` · `risk`) → units.json 의 그 Unit `issue` 를 채운다. 글을 다듬는 일(목표 문장 등)은 스킬 단계에서 설계 세션이 한다.

DS-R10: `check-sdd-prerequisites.sh --stage design`(=/hx-plan 앞)이 requirements 머리 `dependsOn` 마다 그 이슈 design `status: approved` 를 본다. 폴더가 체크아웃에 없으면 base · 로컬 브랜치 git 객체에서 찾는다(06 §3.2 순서).

## 7. 기획물(08 §3.8)

- `plan_check.py <plans 폴더>`: 파일마다 필수 제목(템플릿의 `## ` 제목 목록이 원본) · 머리(`intent` · `kind` · `status` · `generatedWith` · `generatedBy` · `updated`). 빠지면 빠진 제목을 내고 exit 1(DS-R15).
- `wireframe_check.py <html>…`: 200KB 이하, 외부 `src` · `href` · `@import` · `fetch(` · `url(http` 0건, CSP meta, 네 상태 `data-state`, `data-el` 이 `screens/index.md` 요소 표에 있다(DS-R16).
- 스킬 지도(07 §3.7) 해석: `design.screen-plan` 등 칸에 깔린 스킬이 있으면 그것을, 없으면 킷 템플릿을 쓰고 `generatedWith` 에 적는다(DS-R14). 해석 함수는 HK-18 의 스킬 목록 API 와 같은 원본(`.agents/skill-map.json`)을 읽는다 — HK-18 이 먼저 들어오면 그 모듈을, 아니면 이 이슈가 Python 판을 둔다.
- backlog 생성 구간은 스킬이 있어도 `intent.py backlog` 로만 만든다.

## 8. 스킬 수와 토큰

설계 08 은 `/hx-screen-plan` · `/hx-design-plan` · `/hx-backlog` 셋을 적지만, 스킬마다 이름 · 설명이 모든 세션의 스킬 목록에 실린다(12 §3.8). 그래서 **`/hx-plans <종류> <INT>` 스킬 하나**로 묶는다(설계와 다른 점). 새 스킬은 `hx-intent` · `hx-plans` 둘, 설명 각 300자 이하. `tests/test_context_budget.py` 의 상시 바이트가 v1.0.8 기준 이하인지 본다 — 넘으면 다른 킷 스킬 설명을 줄여 맞춘다.

## 9. 역할 · 모델(12 MR-R6 · R7 · R10~R12)

- `designer.md` 역할 원본(class `design` — `model-policy.json` 의 `locked` 에 design 이 있으면 상속 생성, MR-R2).
- MR-R6: 역할 · 위임 지시문(hx-implement · hx-review 스킬과 역할 원본)에 "light 등급 작업이 두 번 실패하거나 `확신: 낮음` 이면 한 등급 위로 한 번 더" 문장. 규칙 문장이고 킷이 모델을 부르지 않는다.
- MR-R7: 개인 층 `harness-kit.local.json` 이 `modelPolicy.classes.<분류>.tier` 를 바꿀 수 있게(잠기지 않은 분류만). `locked` · 등급 정의 · flow.gates 는 무시하고 personal-ignored(HK-14 `readLocalConfig` 를 넓힌다).
- MR-R10: `subagent-result-cap.sh`(Claude SubagentStop). 입력의 마지막 응답 길이만 센다. 출력 0바이트(통과) · 넘으면 exit 2 + 한 줄.
- MR-R11: 사용량 측정 기본 꺼짐(`~/.config/harness-kit/config.json` `usage: off`) — 켜면 토큰 수만(HK-18 사용량 화면과 같은 설정).
- MR-R12: 시험 — init · update · add · remove · repair · uninstall · 훅 실행 전후 `.claude/settings*.json` · `.codex/config.toml` 의 모델 · effort 키가 같다.

## 10. 몹 정리(08 §3.14 · DS-R24)

`mob.py start <INT> --attendees a@x,b@y …` → `questions.md` 머리 `session: {facilitator, attendees, startedAt, timeboxMin}`; 빠진 그룹(열린 질문 `답할 직무` 그룹 · approvers.intent 그룹)이 있으면 그룹 이름을 내고 거부. `next` 는 회차를 닫고 answers-ready 요청을 **사람이 고를 때만** 보낸다(자동 요청 없음 — HK-17 · 사용자 결정). 답 API 는 session 이 있으면 답한 사람을 `attendees` 중에서 받고 줄 끝에 `· 기록: <git 사용자>`. CLI `harness-kit mob start|next|close`.

## 11. 위험 · 불변식(DS-R25~R28)

- Intent 머리 `profile` · `risk` 는 설계 세션이 제안(스킬 문장). `risk: high` 이슈의 design · mr · deploy 게이트는 서로 다른 승인자 2명 기록이 있어야 통과(DS-R26) — `sdd_gates.py` · 관리 페이지 승인 판정(HK-17 TS 와 같은 fixture).
- `invariants.py <이슈 폴더>`: design §4.5 의 `INV-<n>` 마다 근거(`R#` · `NFR-#` · Intent 결정 · `KEEP-<n>`) 와 시험 연결(tasks · 시험 파일 이름 언급)을 본다(DS-R27). `/hx-analyze` 가 이 결과에서 시험에 연결되지 않은 INV · KEEP 을 HIGH 로 보고(DS-R28).

## 12. 시험

| 시험 | 내용 |
|---|---|
| 설치본 `test_intent.py` | new · key(작업 트리 + base 최대 + 1) · next 08 §3.1 표 각 행 · check(DS-R3 · R5~R8 각 실패 사례와 통과 사례) · backlog 구간 |
| 설치본 `test_intake.py` | 제어 · 방향 문자 제거 · trust 머리 · 비밀값 거부 · 크기 제한 · csv 표 · 이미지 설명 안 만듦 · bug 는 이슈 |
| 설치본 `test_codebase.py` | 출처 형식 실패 · stale(줄 · 파일 수) · scan 정적 행만 다시 씀(python 스택 fixture) |
| 설치본 `test_from_unit.py` | DS-R9 · R10 · R11 · R12 · 계약 먼저 · requirements 머리 · units.json issue |
| 설치본 `test_plans.py` | 필수 제목 · 와이어프레임 외부 참조 · 상태 · data-el |
| 설치본 `test_mob.py` | 빠진 그룹 거부 · 참석자 답 · 기록 줄 |
| 설치본 `test_invariants.py` · `test_subagent_cap.py` | DS-R27 · MR-R10 |
| CLI vitest | intake · mob 명령, API `/intake`, 답 API 참석자, codebase 422 · risk high 두 사람, intent next TS = Python fixture |
| `test_context_budget.py` · `test_template_wording.py` | 새 스킬 둘 뒤에도 상시 바이트가 기준 이하, manifest 수 |
| MR-R12 시험 | 모델 · effort 키 전후 같음 |

## 13. 설계와 다르게 하는 것

| 설계 08 · 12 | 이 판 | 이유 |
|---|---|---|
| 기획물 명령 셋(`/hx-screen-plan` · `/hx-design-plan` · `/hx-backlog`) | 스킬 하나 `/hx-plans <종류>` | 스킬 설명이 세션마다 실린다(원칙 10). 하는 일은 같다 |
| `intent_check.py` | `intent.py check`(하위 명령) | 키 · 판정 · 검사 · backlog 가 같은 파서를 쓴다 |
| 접수 출처 jira · notion · ops | HK-20 · HK-21 | 모듈 · 운영 기록이 그 이슈에서 들어온다 |
| `/hx-specify --from-unit` 전체를 스킬이 | 결정적 1~7단계는 `from_unit.py`, 글 다듬기만 스킬 | 같은 입력 → 같은 결과(시험 가능), 토큰 절약 |
