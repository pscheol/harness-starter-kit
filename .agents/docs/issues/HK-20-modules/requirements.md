---
key: HK-20
area: modules
type: feat
title: 모듈 엔진 · aidlc · entire(HK-20a) — module.json · 도구 설치 · 어댑터 · 체크포인트 · 세션 적재량 측정
status: draft
created: 2026-11-24
---

# Requirements — HK-20a 모듈 엔진과 외부 도구 모듈 둘

근거: [설계 10](../../../../docs/design/10-modules.md) §3.1 · §3.2 · §3.3 · §3.7, [02](../../../../docs/design/02-cli-engine.md)(lock · update · uninstall), [03](../../../../docs/design/03-projection-and-hooks.md)(훅 병합), [08 §3.10](../../../../docs/design/08-design-stage.md), [06](../../../../docs/design/06-dashboard.md) §3.11 · `GET /checkpoints`, [13](../../../../docs/design/13-aidlc-coverage.md). 승인된 상위 요구는 [HK-20-optional-modules/requirements.md](../HK-20-optional-modules/requirements.md) 이고, 이 문서는 그 가운데 HK-20a 가 하는 몫이다. 사용자 요청: "AI-DLC · Entire를 원본 그대로 설치하고 업데이트", "킷만으로도 전 흐름이 돈다", "모듈이 덧붙이는 토큰을 보인다". 실제 도구 시험은 사용자가 허용했다(2026-11-24).

HK-20b 로 미룬 것: jira-workflow v2(§3.4) · notion(§3.6) · multi-harness 단위 동기화(§3.5). 이 이슈는 그 셋을 나중에 `module.json` 으로 표현할 수 있게 선언 형식만 마련하고, 기존 두 kit 모듈은 최소 선언(kind `kit`)으로 바꾼다.

## 요구사항(EARS)

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
