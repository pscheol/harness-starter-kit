---
key: HK-20
area: modules
type: feat
title: 선택 모듈 — module.json · aidlc · entire(선택 설치) · jira-workflow · notion · 모듈 토큰 측정
status: in-review
created: 2026-11-23
---

# Requirements — HK-20 선택 모듈 (P22 · P21 일부)

근거: [설계 10](../../../../docs/design/10-modules.md) MD-R1~MD-R16 · §3.1~§3.7, 결정 D2 · D6, [README 원칙 4 · 5 · 7](../../../../docs/design/README.md). 사용자 요청: "AI-DLC · Entire를 원본 그대로 설치하고 업데이트", "킷만으로도 전 흐름이 돈다", "설치할 때 선택으로 같이 설치", "모듈이 덧붙이는 토큰을 보인다".

- 설계 10 MD-R1~MD-R16 전부. AI-DLC 승인 가져오기(§3.2 6단계, `source: aidlc`), Entire 구현 하네스 하나만 · push 정책(D6), jira-workflow 개편(상태 대응 · 사람 전이만 승인), notion 접수 출처, multi-harness, 모듈 토큰 측정(§3.7).
- 사용자가 실제 설치 시험을 허용했다: 시험 폴더에 프로젝트를 처음부터 만들어 AI-DLC · Entire를 공식 설치기로 깔고 `add`부터 `remove`까지 돌린다. 원격이 필요하면 비공개 시험 저장소를 쓴다. 단위 시험은 가짜 도구로도 돈다.
- 두 구성(킷만 / 모두 켬) e2e가 통과한다(11 MG-R7).

> 이 이슈는 둘로 나눠 구현한다. **HK-20a**(모듈 엔진 · aidlc · entire · 측정, 아래 표)는 끝났고, **HK-20b**(jira-workflow v2 §3.4 · notion §3.6 · multi-harness §3.5)는 HK-20a 위에서 한다. 내용을 더해 상태를 in-review 로 돌렸다 — 승인은 사람이 한다.

## HK-20a 요구사항(EARS)


| ID | 요구사항 | 설계 10 | 시험 |
|---|---|---|---|
| HK20-R1 | 모든 모듈은 `optional/<id>/module.json` 하나로 파일 · 훅 · 설정 키 · 외부 경로 · 요구 · 충돌을 선언하고, CLI 는 선언에 없는 모듈 파일을 깔지 않는다. 선언한 훅이 설치되지 않았으면 doctor 가 오류로 알린다. | MD-R1 | `modules-engine`(선언) |
| HK20-R2 | `add <모듈>` 은 적용 전에 바꿀 파일 · 병합할 훅 · 실행할 외부 명령 · 바뀔 설정을 출력하고, `--dry-run` 이면 거기서 끝낸다(쓰지 않고 외부 명령을 실행하지 않는다). | MD-R2 | `modules-engine` |
| HK20-R3 | 요구 도구가 없을 때 TTY 의 `init` · `add` 는 그 도구의 공식 설치 명령을 보이고 묻는다. 사람이 고르면 실행하고 버전을 다시 확인한다. `--install-tools` 면 묻지 않고 실행한다. 에이전트 세션에서는 `--install-tools` 가 있어도 실행하지 않고 설치 명령을 출력한 뒤 exit 5 로 끝나며, TTY 가 아니고 `--install-tools` 가 없을 때도 같다. `sudo` 가 든 명령은 실행하지 않는다. | MD-R3 | `modules-engine` |
| HK20-R4 | 요구 도구 버전이 `versions` 범위(`harness-kit.json`, 없으면 `module.json` 의 `range`) 밖이면 `add` · `doctor` 는 경고하고 `add` 는 `--allow-unverified` 없이는 exit 4 로 멈춘다. | MD-R4 | `modules-engine` |
| HK20-R5 | `add` 가 외부 명령을 실행한 뒤 `externalPaths` 에 맞는 파일은 lock 에 `op: none`, `owner: external:<도구>` 로 기록한다. | MD-R5 | `modules-engine` |
| HK20-R6 | `remove <모듈>` 은 lock 에서 `layer: optional/<id>` 이고 주인이 kit 인 항목만 지우거나 빼고, 외부 소유 항목은 lock 에서만 빼며 파일 · 산출물은 지우지 않는다. | MD-R6 | `modules-engine` |
| HK20-R7 | 킷 `update` · `repair` · `uninstall` · `remove` 뒤 외부 소유 파일의 sha256 과 설정 파일 속 외부 훅 항목의 sha256 은 그 전과 같다(킷 → AI-DLC → Entire, 그 역순 모두). | MD-R7 | `modules-engine` · 실제 도구 e2e |
| HK20-R8 | 충돌하는 모듈이 켜져 있거나 먼저 켜야 하는 모듈이 꺼져 있으면 `add` 는 exit 3 으로 거부한다. | MD-R8 | `modules-engine` |
| HK20-R9 | aidlc 모듈을 켜면 `flow.design = "aidlc"` 가 되고, 끄면 `"kit"` 으로 돌아간다. 이미 만든 `intent.json` · `units.json` · SDD 이슈는 그대로 둔다. | MD-R9 | `modules-engine` |
| HK20-R10 | `sync aidlc` 는 같은 입력(sha256)에 같은 `units.json` 을 내고(두 번째는 쓰기 0건), 다시 가져올 때 `sourceId` 가 같은 Unit 의 `id` · `issue` 를 지킨다. 사라진 Unit 은 `planned: false` 가 된다. `--check` 는 쓰지 않고 차이가 있으면 exit 1, 필수 항목이 없으면 exit 2 와 빠진 항목을 낸다. 어댑터가 쓴 `units.json` 은 킷 설계의 형식과 키 집합이 같다(`source` · `sourceId` 제외). | MD-R10 · 완료 3 · 4 | `modules-aidlc-sync` · `test_aidlc_intent.py` |
| HK20-R11 | AI-DLC 가 깔린 하네스와 `roles.design.harness` 가 다르면 doctor 가 경고한다. AI-DLC 구현 쪽 산출물(`construction/`)이 생기면 doctor 가 경고한다. | MD-R11 · §3.2 | `modules-aidlc-sync` · `modules-engine` |
| HK20-R12 | entire 모듈은 `roles.implement.harness` 하나에만 Entire 를 켠다. 그 하네스를 Entire 가 지원하지 않으면 쓰기 전에 exit 3 이다. 다른 하네스에 Entire 훅이 있으면 doctor 가 경고한다. | MD-R12 · 완료 5 | `modules-engine` · `modules-checkpoints` |
| HK20-R13 | 원격 공개 여부를 확인하지 못하면(gh · glab 없음 · 실패 · 자체 호스팅 · 원격 없음) entire 모듈은 공개로 보고 체크포인트를 올리지 않는 설정을 쓴다. private · internal 일 때만 같은 원격에 올린다. | MD-R13 · 완료 6 | `modules-engine` |
| HK20-R14 | `update --tools` 는 켠 모듈의 도구마다 지금 · 최신 버전을 보이고 사람이 고른 도구만 그 도구의 업데이트 명령을 실행한다. 최신 판이 범위 밖이면 `--allow-unverified` 없이는 올리지 않는다. 에이전트 세션 · TTY 아님에서는 목록만 보인다. | MD-R15(설계 10 표기) | `modules-engine` |
| HK20-R15 | `add` · `remove` 는 적용 전후로 세션마다 실리는 양을 owner 별 바이트와 훅 수로 재서 출력하고, 늘어난 양이 4,096바이트를 넘으면 TTY 에서 한 번 더 묻는다("아니오"면 킷 몫을 뺀다). `doctor` 와 관리 페이지 `GET /usage/kit` 의 `load` 는 같은 값을 owner 별로 보인다. 측정은 정적 바이트 합계이고 모델 · 외부 도구 훅을 실행하지 않는다. | MD-R16 · 완료 11 | `modules-engine` · `usage.test.ts` |
| HK20-R16 | 외부 명령 단계 뒤 킷 몫 적용이나 설정 단계가 실패하면 킷 몫만 스냅숏으로 되돌리고 외부 도구가 만든 파일은 남기며 목록을 출력한다. | §3.1 | `modules-engine` |
| HK20-R17 | `GET /checkpoints[?issue=]` · `GET /checkpoints/{id}` 는 `Entire-Checkpoint` 트레일러와 `refs/entire/checkpoints/` 로 목록을, `entire checkpoint explain` 으로 설명(10초 제한 · 제어 문자 제거)을 낸다. 모든 GET 경로에는 같은 결과의 CLI 명령(`checkpoints`)이 있다. | §3.3 · 06 | `modules-checkpoints` · `dashboard-cli` |
| HK20-R18 | 토큰 원칙: 킷은 모델을 부르지 않는다. 모듈을 켜지 않으면 세션이 싣는 양은 늘지 않는다(모듈 파일 · 훅은 그 모듈이 켜졌을 때만 깔리고 병합된다). | README 원칙 10 | `modules-engine` |

## HK-20b 요구사항(EARS)

근거: 설계 10 MD-R14 · R15 · R16 · R17 · §3.4 · §3.5 · §3.6 · §5 완료 기준 7 · 8 · 9. 설계와 다르게 한 점은 design.md 의 "HK-20b 설계와 다르게 하는 것" 표다.

| ID | 요구사항 | 설계 10 | 시험 |
|---|---|---|---|
| HK20B-R1 | `issue-tracker.yml` v2 는 `statusMap` · `approvalTransitions` · `issueTypes` · `groupMap` · `sync{method,mcpServer,restTokenEnv,restUserEnv}` 를 갖고, 기존 `statusIds` · `transitionIds` · `agentBoundary` 는 유지하며 `agentBoundary.maxStatus` 는 `verifying` 이다. `TBD` 는 비어 있는 값이다. | §3.4 | `modules-hk20b` |
| HK20B-R2 | `sync jira` 는 에이전트 몫 상태 전이와 원격 링크(SDD 폴더 · MR)만 하고 설명을 고치지 않는다. `approvalTransitions` 의 전이 · 사람 상태 · `maxStatus` 위로 옮기라는 요청은 누가 불러도 거부(exit 4)하고 요청을 보내지 않는다. | MD-R14 · 완료 7 | `modules-jira` |
| HK20B-R3 | `sync jira --approvals` 는 REST changelog 로만 사람의 승인 전이를 `approvals.md` 에 덧붙인다(경로 `jira`, `근거: changelog <id>`, 대상 sha `(jira)`). 같은 changelog id 는 한 번만, 승인자 밖 · 이메일 없음 · 게이트 없음은 경고만 하고 기록하지 않는다. 에이전트 세션의 기록 ID 는 `approvals-log.jsonl` 에도 적는다. 두 파서(Python · Node)가 같은 결과를 낸다. | §3.4 · 완료 7 | `modules-jira` · `approvals-fixture` · `test_approvals_fixtures` |
| HK20B-R4 | `sync jira --verify` 는 경로 `jira` 기록을 changelog 로 다시 대조하고 쓰지 않는다. | §3.4 | `modules-jira` |
| HK20B-R5 | jira-workflow 모듈이 꺼져 있거나 `sync.method` 가 `none` 이면 `sync jira` 는 요청 없이 안내하고 exit 0 이다. 이슈 모델의 `boardStatus` 는 Jira 없이 킷 단계에서 같은 여덟 상태를 계산한다. | MD-R15 | `modules-jira` · `modules-hk20b` · `board-status` |
| HK20B-R6 | `intake --from jira:<키>\|notion:<페이지>` 는 `intake.py` 의 같은 형식 · 제한 · 비밀값 검사 · 신뢰하지 않는 입력 표시 · 제어 문자 제거로 저장하고, `intake.md` 머리에 `source: {type, ref, url, importedAt, version}` 를 남긴다. | §3.6 | `modules-intake-from` · `test_intake` |
| HK20B-R7 | 같은 출처를 다시 가져오면 바뀐 부분을 diff 로 보이고(exit 4) 사람이 `--yes` 로 고르기 전에는 덮어쓰지 않는다. 내용이 같으면 변화 없음이다. | §3.6 | `modules-intake-from` · `test_intake` |
| HK20B-R8 | Notion: 블록 → Markdown, 하위 페이지 `--depth`(기본 1), 파일 · 이미지는 첨부, 속성 표, `kindMap`, `writeBack` 기본 꺼짐. `notion` 은 `module.json` 이 있는 모듈(`add` · `remove`)이다. | §3.6 | `modules-intake-from` · `modules-hk20b` |
| HK20B-R9 | 토큰(`JIRA_API_TOKEN` · `JIRA_USER_EMAIL` · `NOTION_TOKEN`)은 환경 변수에서만 읽고 리포 · `harness-kit.json` · 출력 · 오류 문구 · 자식 프로세스에 쓰지 않는다. 시험은 모의 서버만 쓰고 실제 서비스를 부르지 않는다. | 토큰 원칙 | `modules-jira` · `modules-intake-from` |
| HK20B-R10 | `sync units [--check] [--unit] [--adopt]` 는 `sync.py` 와 같은 계획으로 파일을 복사하고(토큰 치환 · 단위 `.agents/harness.json`) `--check` 의 stdout 줄 · exit 가 같다. 단위 lock 에 `layer: unit:<id>` 를 남기고, 사람이 고친 파일은 `.new` 로 둔다. | MD-R16 · §3.5 · 완료 8 | `modules-units` |
| HK20B-R11 | `check_submodules.py` 는 초기화 · 포인터(제공 리포 push 전 포인터 커밋) · 작업 상태 · 브랜치 키를 검사하고, `affected` 검증은 바뀐 도메인 submodule 에만 부른다. `--record` 가 상위 `specs-index.md` 에 도메인별 SHA 를 적는다. | MD-R17 · 완료 9 | `test_cross_repo` |
| HK20B-R12 | `scripts/guards/no-cross-domain-paths.sh` 는 경고(`harness-guard-enforce: 0`)로 시작하고 사유가 있는 예외 목록을 따른다. `.agents/rules/cross-repo.md` 가 순서(계약 → 병렬 → 경계 검증 → 순서 커밋 → 기록)를 정한다. | §3.5 | `test_cross_repo` |
| HK20B-R13 | `/hx-specify --from-unit` 은 Unit `repo`(배포 단위 id)가 있으면 그 도메인 폴더에 이슈를 만든다. 계약 Unit 은 상위에 둔다. | §3.5 | `test_from_unit` |
| HK20B-R14 | 토큰 원칙: 킷은 모델을 부르지 않는다. 모듈을 켜지 않으면 세션에 싣는 양이 늘지 않고, notion · jira 규칙은 `paths` 가 있다. | README 원칙 10 | `modules-hk20b` |
