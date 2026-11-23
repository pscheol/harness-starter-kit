# 14. 배포 · 운영 기록 · 전달 지표

- 단계: P24(v2.6). 선행: P20(관리 페이지) · P21(Intent) · P23(게이트 · CI 템플릿).
- 방향과 이유: [03 #p24](../harness-next/03-plan.html#p24) · [04 #measure](../harness-next/04-usage.html#measure) · [05 #principles](../harness-next/05-principles.html#principles) · [05 #channel](../harness-next/05-principles.html#channel)
- 게이트 조건 표: 09 §3.8. 승인 기록 형식: 06 §3.7. 접수: 08 §3.11. 위험 등급: 08 §3.15. 대응표의 보완 항목: 13 F1 · F2 · R3 · R4 · R9.

## 1. 목적·범위

병합한 Unit을 배포하고, 배포 결과와 운영에서 잰 값을 리포에 남기고, 그 기록에서 다음 요구사항 · bug 이슈 · 규칙 변경을 연다. 배포 승인은 계획 · 롤백 시험 · CI 결과가 갖춰져야 할 수 있다.

범위에 넣는 것: design 템플릿 §13 "배포 · 롤백", 배포 묶음과 배포 기록, `.agents/deploy.json`, `deploy` 게이트 조건과 강제, 병합 뒤 검증 환경 자동 배포(CI 선택 단계), 배포 점검표(IaC · 관측), 운영 기록, 장애 → bug 이슈, 운영 기록 → 다음 Intent, 전달 지표와 기준선, 규칙 후보, 관리 페이지 S10 데이터.

범위 밖: 환경 만들기(플랫폼 · IaC 리포가 한다, 13 B4.2), 모니터링 도구 연결(서비스 지표 값은 링크와 CI 산출물로 받는다), 운영 배포 명령 자체(프로젝트 배포 시스템의 일. 킷은 앞의 승인 검사와 뒤의 결과 기록을 맡는다), 성능 시험 단계(13 R10).

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| DO-R1 | design §13.1 · §13.2의 값 칸이 비어 있거나 §13.3에 체크도 "해당 없음: <이유>"도 없는 줄이 있으면 design 승인은 거부된다. 배포하지 않는 변경은 §13 전체를 "배포 없음: <이유>" 한 줄로 둔다. |
| DO-R2 | `deploy plan <키…>`를 실행하면 CLI는 포함 이슈의 design §13을 모아 `.agents/docs/ops/deploys/<날짜>-<키>.md`(`state: planned`)를 만든다. |
| DO-R3 | 포함 이슈 중 `done`을 통과하지 않은 것이 있으면 `deploy plan`은 그 이슈 키를 출력하고 exit 1이다. |
| DO-R4 | `deploy` 승인 요청이 오면 승인 처리는 §3.4의 D1~D7을 확인하고, 맞지 않는 조건이 있으면 422 `gate_precondition`과 조건 ID를 돌려준다. |
| DO-R5 | 배포 기록에 롤백 시험 통과가 없으면 `deploy` 승인은 승인자가 면제 사유를 함께 넣은 경우에만 된다. 기록의 `risk`가 `high`면 면제할 수 없다. |
| DO-R6 | `deploy.py check <기록> --require-approved`는 유효한 `deploy` 승인 기록이 없거나 계획 구간 sha가 승인한 sha와 다르면 exit 1이다. |
| DO-R7 | `autoVerify.enabled`가 참이면 base 브랜치에 병합될 때마다 CI는 검증 환경에 배포하고 E2E를 한 번 돌린다. |
| DO-R8 | 자동 검증 배포가 연속 2회 실패하면 그 뒤 실행은 배포하지 않고 `stopped`로 끝난다. 사람이 `HX_DEPLOY_RESUME=true`로 파이프라인을 수동 실행해야 다시 배포한다. |
| DO-R9 | 운영 기록의 실측 값마다 출처(기간을 고정한 링크 또는 CI 산출물 경로)가 있다. 출처 없는 실측 값이 있으면 `verify.sh fast`는 실패한다. |
| DO-R10 | `intake --kind bug --from ops:<기록>#INC-<n>`은 장애 내용을 담은 bug 이슈를 만들고, 운영 기록의 그 장애 `후속 이슈` 줄만 고친다. |
| DO-R11 | `intake --from ops:<기록>#NX-<n>`은 08 §3.11과 같은 형식으로 Intent를 만들고 `intake.md` 머리에 `source.type: ops`를 남긴다. 같은 NX를 다시 접수하면 새 Intent를 만들지 않는다. |
| DO-R12 | 전달 지표는 git 기록 · `approvals.md` · 배포 기록의 CI 값에서만 계산한다. 사람이 적은 숫자를 입력으로 받지 않는다. |
| DO-R13 | `metrics --baseline`은 킷 도입 전 90일 기록으로 기준선을 만들고 지표마다 계산 방법(`method`)과 입력 범위를 남긴다. 같은 입력으로 다시 계산하면 같은 값이 나온다. |
| DO-R14 | 승인 기록에 `규칙 후보: 예`가 있거나, 같은 리뷰 점검 ID의 `수용` 지적이 30일 안에 이슈 2개 이상에서 나오면 `rules candidates`는 규칙 후보 파일을 만든다. |
| DO-R15 | 규칙 후보의 `status: accepted`는 같은 MR에서 그 후보의 `target` 규칙 파일이 바뀐 경우에만 허용된다. 아니면 `verify.sh fast`가 실패한다. |
| DO-R16 | `GET /ops`는 배포 기록 · 운영 기록 · 장애 · 다음 Intent 후보 · 전달 지표 · 자동 검증 배포 상태 · 규칙 후보를 한 응답으로 준다. `npx harness-kit status --ops --json`은 같은 내용을 낸다. |

## 3. 설계

### 3.1 흐름

```text
병합 → [done 승인]
  → (선택) CI 자동 검증 배포: 검증 환경 배포 → 스모크 · 헬스 → E2E 1회 → 롤백 시험      §3.5
  → deploy plan <키…>         배포 기록(state: planned). 포함 이슈 design §13을 모은다      §3.3
  → [deploy 승인]             관리 페이지 승인 버튼 · harness-kit approve · Jira 사람 전이  §3.4
  → 배포 시스템: deploy.py check --require-approved → 운영 배포 → deploy.py result        §3.3
  → 운영 기록(배포 뒤 1주 · 매월 · 장애마다)                                               §3.7
      ├ 장애 INC-n  → intake --kind bug --from ops:…#INC-n → bug 이슈                       §3.8
      ├ 후보 NX-n   → intake --from ops:…#NX-n → 다음 Intent                                §3.9
      └ 배운 것 L-n → rules candidates → 규칙 변경 MR                                       §3.11
  전달 지표: git · approvals.md · 배포 기록에서 계산해 기준선과 비교                         §3.10
```

### 3.2 design 템플릿 §13 "배포 · 롤백"

바꿀 파일: `packages/templates/common/agents-docs/_spec-templates/design/_template.md`.

- `## 13. Migration / Rollout`을 `## 13. 배포 · 롤백 (Migration / Rollout)`으로 바꾼다. 번호는 그대로 둔다. 다른 문서가 design §6 · §13 · §17을 번호로 가리킨다.
- 하위 절 넷을 둔다. 13.1 · 13.2는 필수, 13.3은 항목마다 체크 또는 "해당 없음: <이유>", 13.4는 인프라를 바꿀 때만.
- `## 17. 승인 체크리스트`에 두 줄을 더한다. "§13.1 · §13.2가 채워졌고 롤백 판단 기준이 숫자로 있는가", "§13.3 항목마다 체크 또는 해당 없음 이유가 있는가".

```markdown
## 13. 배포 · 롤백 (Migration / Rollout)

> 배포하지 않는 변경(라이브러리 내부, 문서)은 이 절 전체를 "배포 없음: <이유>" 한 줄로 둔다.

### 13.1 배포 계획 *(필수)*
| 항목 | 값 |
|---|---|
| 순서 | (예: 1 마이그레이션 expand → 2 API 배포 → 3 기능 플래그 켜기 → 4 contract 마이그레이션) |
| 방식 | 한 번에 · 단계적(비율 · 단계 간격) · 기능 플래그 |
| 하위 호환 | (이전 판 클라이언트 · 데이터와 함께 도는가. 안 되면 순서로 어떻게 막는가) |
| 마이그레이션 | 되돌릴 수 있음 · 되돌릴 수 없음(→ risk high, 08 §3.15) |
| 확인 신호 | 스모크: <명령 · 경로> · 헬스: <명령 · 경로> · 지표: <이름 · 기준값> |

### 13.2 롤백 *(필수)*
| 항목 | 값 |
|---|---|
| 방법 | 이전 커밋 재배포 · 플래그 끄기 · down 마이그레이션 |
| 판단 기준 | (숫자로. 예: 5xx 비율 1% 초과가 5분 이어짐) |
| 데이터 | (롤백 뒤 남는 데이터와 처리 방법) |
| 시험 | 검증 환경에서 시험한다(`deploy.py run --env verify --rollback-test`). 못 하면 이유 |

### 13.3 운영 점검 *(항목마다 체크 또는 "해당 없음: <이유>")*
- [ ] 로그: 새 경로의 로그에 개인정보 · 비밀값이 없다
- [ ] 지표: SC · NFR을 재는 지표 이름과 대시보드 링크
- [ ] 알람: §13.2 판단 기준을 넘으면 울리는 알람과 받는 사람
- [ ] SLO: 대상 · 목표 · 측정 기간(있을 때)
- [ ] 런북: 장애 때 볼 문서 링크. 기존 런북이면 바뀌는 부분
- [ ] 비밀값: 새 비밀값의 저장 경로(값은 적지 않는다) · 회전 방법
- [ ] 환경 차이: 검증 환경과 운영 환경의 설정 · 데이터 · 외부 연결 차이

### 13.4 인프라 *(인프라를 바꿀 때)*
| 항목 | 값 |
|---|---|
| IaC 도구 · 위치 | (예: Terraform `infra/payment/`) |
| 바뀌는 자원 · 환경 | |
| 권한 | 새 권한과 그 범위(최소 권한) |
| 비용 | 월 추정액과 근거 |
| 적용 순서 | IaC 적용과 앱 배포의 앞뒤 |
```

검사: `scripts/harness/sdd_gates.py`가 design 승인 앞 조건(09 §3.8 `design` 행)에서 DO-R1을 본다. 13.4는 표가 있으면 같은 검사를 한다.

### 3.3 배포 묶음과 배포 기록

배포 묶음은 한 번에 내보내는 병합된 이슈의 모음이고, 배포 기록 하나가 묶음 하나를 정한다. multi-harness 모듈의 배포 단위(배포 대상 폴더, 10 §3.5)와 다른 것이다.

자리: `.agents/docs/ops/deploys/<날짜>-<키>.md`. 템플릿 원본은 `_spec-templates/ops/deploy.md`(새로).

- `<날짜>`: 기록을 만든 날 `YYYY-MM-DD`.
- `<키>`: 포함 이슈가 하나면 그 이슈 키, 모두 한 Intent에 속하면 Intent 키, 그 밖에는 릴리스 태그(`v2.3.0`). 같은 날 같은 키가 또 있으면 `-2` · `-3`을 붙인다.

```markdown
---
kind: deploy
key: INT-7
env: production                 # deploy.json envs의 이름
state: planned                  # planned | approved | deploying | succeeded | rolled-back | failed
issues: [HDRV3D-11, HDRV3D-12]
commit: { base: develop, sha: 4c1d9e0 }
tag: v2.3.0                     # 없으면 null
risk: high                      # 포함 이슈 risk 중 가장 높은 값
created: 2026-12-01
---

# 배포 — INT-7 결제 개편 1차

<!-- PLAN:BEGIN — deploy plan 이 만든다. 승인 sha는 이 구간의 sha256이다 -->
## 1. 포함 Unit
| 이슈 | Unit | design §13 sha | 병합 커밋 |
|---|---|---|---|
| HDRV3D-11 | U-1 결제 API·이벤트 계약 | 1a2b… | 77c0e1a |
| HDRV3D-12 | U-2 결제수단 교체 | 9f1c… | 4c1d9e0 |

## 2. 순서
1. HDRV3D-11 마이그레이션 expand(§13.1 순서 1)
2. HDRV3D-12 API 배포, 플래그 `payment.v2` 꺼진 채
3. 플래그 10% → 30분 관찰 → 100%

## 3. 확인 신호
| 신호 | 명령 · 링크 | 기준 |
|---|---|---|
| 스모크 | deploy.json `smoke` — 검증 환경 주소에 실제 HTTP 요청을 보내 주요 경로의 응답 코드 · 본문 일부를 확인하는 명령(예: `curl -fsS <주소>/health`, 주요 API 2~3개). 살아 있는 서비스에 요청을 보내 확인하는 방식은 AWS AI-DLC 데모의 QA 단계와 같다 | exit 0 |
| 헬스 | deploy.json `health` | 3회 연속 200 |
| 지표 | 결제 실패율(대시보드 링크) | ≤ 0.5%(INT-7 SC-1) |

## 4. 롤백
- 판단 기준: 5xx 1% 초과 5분, 또는 결제 실패율 1% 초과
- 방법: 플래그 끄기 → 이전 커밋 77c0e1a 재배포
- 시험: passed · env verify · https://gitlab.example.com/…/pipelines/812 · 2026-11-30T16:20:00+09:00
  (시험하지 못했으면 `시험: none`. 면제는 승인 기록에만 남는다, §3.4)

## 5. 배포 점검
| 항목 | 이슈 | 상태 |
|---|---|---|
| 로그 | HDRV3D-12 | 체크 |
| SLO | HDRV3D-11 | 해당 없음: 계약 Unit, 런타임 경로 없음 |

## 6. 검증
- full: passed · sha 4c1d9e0 · https://gitlab.example.com/…/pipelines/810
<!-- PLAN:END -->

## 7. 결과
<!-- RESULT:BEGIN — deploy.py result 가 쓴다. 손으로 고치지 않는다 -->
| 단계 | 시작 | 끝 | 결과 | 근거 |
|---|---|---|---|---|
| deploy | 2026-12-01T10:05:12+09:00 | 2026-12-01T10:09:40+09:00 | ok | pipeline 815 · job deploy-production |
| smoke | … | … | ok | |
| health | … | … | ok | |

상태: succeeded · 롤백: 없음
<!-- RESULT:END -->
```

명령:

| 명령 | 하는 일 |
|---|---|
| `npx harness-kit deploy plan <이슈·Intent 키…> [--env production] [--tag v2.3.0]` | Intent 키면 그 Intent에서 `done`을 통과한 이슈 전부를 넣는다. design §13을 모아 §1~§5를 쓴다. `commit.sha`는 base HEAD, `risk`는 포함 이슈의 최댓값 |
| `npx harness-kit deploy record <기록> --from-ci <파이프라인 URL\|산출물 파일>` | CI 산출물(`verify-last.json` · `quality-gate-last.json` · `auto-verify-<sha>.json`)에서 §4 시험 줄과 §6 검증 줄을 채운다. 산출물의 `head`가 `commit.sha`와 다르면 두 sha를 출력하고 거부 |
| `python3 scripts/harness/deploy.py check <기록> [--require-approved]` | §3.4 판정. 맞지 않는 조건 ID를 한 줄씩 출력하고 하나라도 있으면 exit 1. CLI `deploy check`도 같은 일을 한다 |
| `python3 scripts/harness/deploy.py run --env <이름> [--record <기록>] [--rollback-test]` | `deploy.json` 명령으로 배포 · 스모크 · 헬스. env 종류가 `production`이면 먼저 `check --require-approved` |
| `python3 scripts/harness/deploy.py result <기록> --from <deploy-result.json>` | 자기 배포 시스템을 쓰는 프로젝트가 배포 뒤 결과를 넣는다. 머리 `state`와 §7 구간만 쓴다 |

`.agents/deploy.json`(킷이 빈 틀을 깔고 팀이 채운다. MR 파이프라인과 자동 검증 배포는 base 브랜치의 이 파일을 읽는다, 09 VQ-R11):

```json
{
  "schema": "harness-kit.deploy/v1",
  "envs": {
    "verify":     { "kind": "verification", "url": "https://verify.example.internal" },
    "production": { "kind": "production" }
  },
  "commands": {
    "deploy":   ["bash", "ops/deploy.sh", "{env}", "{sha}"],
    "smoke":    ["bash", "ops/smoke.sh", "{env}"],
    "health":   ["bash", "ops/health.sh", "{env}"],
    "rollback": ["bash", "ops/deploy.sh", "{env}", "{toSha}"],
    "e2e":      ["npm", "run", "e2e", "--", "--base-url", "{url}"]
  },
  "autoVerify": { "enabled": false, "env": "verify", "maxConsecutiveFailures": 2, "timeoutSec": 1800 }
}
```

- 자리표: `{env}` · `{sha}` · `{toSha}` · `{url}`. 명령이 없는 단계는 `skipped`이고, `deploy`가 없으면 `run`은 exit 2.
- `maxConsecutiveFailures`는 줄이기만 한다(1 또는 2). 3 이상이면 `doctor`가 오류를 낸다.
- 비밀값은 이 파일에 넣지 않는다. 명령이 환경 변수로 받는다.

### 3.4 `deploy` 게이트

09 §3.8 표의 `deploy` 행은 아래 D1~D7이다. 승인 대상은 배포 기록의 계획 구간(`PLAN:BEGIN`~`PLAN:END`)이다.

| ID | 조건 | 판정 근거 |
|---|---|---|
| D1 포함 이슈 | 포함 이슈마다 `done` 통과 | 09 §3.8 |
| D2 계획 승인 | 포함 이슈마다 design 승인이 `valid`(승인 sha = 현재)이고 §13.1 · §13.2가 차 있다. 기록 §1의 design §13 sha가 현재 design과 같다 | 이슈 `approvals.md` · design.md |
| D3 롤백 | 기록 §4가 `시험: passed`이고 근거 실행의 env 종류가 `verification`이다. 아니면 승인 요청에 면제 사유(10자 이상)가 있고 기록 `risk`가 `high`가 아니다 | 기록 §4 · 승인 요청 |
| D4 CI | 기록 §6이 `full: passed`이고 그 sha = `commit.sha`, 같은 실행의 품질 게이트가 `passed`다. CI 토큰이 있으면 파이프라인 상태를 플랫폼 API로 다시 본다 | CI 산출물 |
| D5 점검표 | 기록 §5의 모든 줄이 `체크` 또는 `해당 없음: <이유>` | 기록 §5 |
| D6 승인자 | `approvers.deploy`가 있으면 승인자가 그 안에 있다(없으면 git 사용자 누구나). 기록 `risk`가 `high`면 서로 다른 git `user.email` 2명이 같은 계획 sha를 승인해야 통과한다 | `approvals.md` · 08 §3.15 |
| D7 검증 환경 | `autoVerify.enabled`면 `commit.sha`의 자동 검증 배포 결과가 `passed` | `auto-verify-<sha>.json` |

승인 기록은 포함 이슈의 `approvals.md`마다 같은 내용으로 덧붙인다(형식 06 §3.7):

```markdown
## 2026-12-01T09:50:00+09:00 · deploy · approved
- 승인자: choi@example.com (Choi) · 그룹: ops
- 대상: .agents/docs/ops/deploys/2026-12-01-INT-7.md#PLAN · sha256: 3e9a…(64자)
- 문구: "10%부터 연다"
- 롤백 면제: 검증 환경에 PG 샌드박스가 없다. 플래그 끄기로 되돌린다    ← 면제했을 때만
- 경로: dashboard
- 기록 ID: 01JE…
```

- 승인 경로는 README §3의 넷뿐이다(AI-DLC 승인은 그 모듈을 켜고 기록에 승인자가 있을 때만 옮긴다). 채팅에서 "배포해"라고 한 말은 승인이 아니다.
- 면제는 승인하는 사람이 승인 요청에 넣는다. 화면 S03의 "롤백 시험 없이 승인" 칸, 콘솔 `npx harness-kit approve deploy:2026-12-01-INT-7 --gate deploy --phrase "…" --waive-rollback "<사유>"`. 에이전트가 기록에 쓴 면제 문장은 D3에서 세지 않는다.
- 승인 뒤 계획 구간이 바뀌면 승인은 `stale`이다(06 §3.3과 같은 규칙). 결과 구간은 승인 sha에 들지 않아서, 배포 뒤 결과를 써도 승인은 유지된다.
- 강제: 운영 배포 작업은 배포 명령 전에 `deploy.py check <기록> --require-approved`를 부른다(DO-R6). 킷 CI 템플릿의 `deploy-production` 작업(§3.5)은 `run`이 이 검사를 먼저 한다. 자기 배포 시스템을 쓰는 프로젝트는 그 시스템의 첫 단계에 같은 명령을 넣는다. `deploy.json`에 `production` 환경이 있는데 CI 설정 파일에서 이 명령을 찾지 못하면 `doctor`가 경고한다.

### 3.5 CI 선택 단계: 병합 뒤 검증 환경 배포

세 CI 템플릿(09 §3.7)에 선택 작업 둘을 더한다. 둘 다 `scripts/harness/deploy.py`만 부른다(09 VQ-R16). `autoVerify.enabled`가 거짓이면 `auto-verify`는 "꺼짐"을 출력하고 exit 0이다.

| 작업 | 언제 | 명령 |
|---|---|---|
| `deploy-verify` | base 브랜치 push(병합), 또는 재개 수동 실행 | `python3 scripts/harness/deploy.py auto-verify` |
| `deploy-production` | 사람이 수동 실행하고 `HX_DEPLOY_RECORD`에 기록 경로를 넣는다 | `python3 scripts/harness/deploy.py run --env production --record "$HX_DEPLOY_RECORD"` |

`auto-verify`:

```text
1. deploy.json과 scripts/harness/를 이 커밋(base)에서 읽는다
2. 멈춤 판정: base에서 같은 작업의 직전 완료 실행 2개가 모두 failed이고 HX_DEPLOY_RESUME=true가 없으면
   배포하지 않고 status: stopped 산출물을 남긴 뒤 exit 1. 직전 실행을 읽지 못해도 stopped(이유: 실패 수 모름)
3. deploy {env: verify, sha: HEAD} → smoke → health → e2e(한 번. 실패해도 다시 돌리지 않는다)
4. 롤백 시험: rollback {toSha: lastPassedSha} → health → deploy HEAD → health
5. 3 · 4 중 하나라도 실패하면 rollback {toSha: lastPassedSha}(명령이 있을 때), status: failed, exit 1
6. 산출물 .agents/reports/deploy/auto-verify-<sha>.json
```

```json
{
  "schema": "harness-kit.auto-verify/v1",
  "sha": "4c1d9e0", "env": "verify", "status": "passed",
  "steps": [ { "id": "deploy", "status": "ok", "seconds": 212 }, { "id": "e2e", "status": "ok", "seconds": 340 } ],
  "rollbackTest": { "status": "passed", "toSha": "77c0e1a" },
  "consecutiveFailures": 0, "lastPassedSha": "4c1d9e0",
  "pipeline": "https://gitlab.example.com/…/pipelines/812",
  "startedAt": "2026-11-30T16:02:11+09:00", "finishedAt": "2026-11-30T16:20:00+09:00"
}
```

- 직전 실행 찾기: GitLab은 `glab api "projects/:id/pipelines?ref=<base>&scope=finished"` 뒤 작업 이름으로 거른다. GitHub는 `gh run list --branch <base> --workflow harness-verify.yml --json conclusion,databaseId` 뒤 작업 결과를 본다. GoCD는 이전 stage 산출물의 `auto-verify-*.json`에서 `consecutiveFailures`를 읽는다. `lastPassedSha`도 같은 방법으로 찾는다.
- E2E를 한 실행 안에서 다시 돌리지 않는다. 다시 돌리면 불안정한 시험이 통과로 가려진다.
- 재개: 사람이 플랫폼에서 파이프라인을 수동 실행하고 `HX_DEPLOY_RESUME=true`를 넣는다. 재개한 실행이 통과하면 실패 수가 0이 된다.
- 동시 실행: GitLab `resource_group: harness-verify-env`, GitHub `concurrency: harness-verify-env`로 한 번에 하나만 배포한다. 운영은 `harness-production`.
- 멈춤 · 실패는 그 병합 커밋 MR의 요약 코멘트(09 §3.1)에 `<!-- section:deploy -->` 구간으로 적고, 관리 페이지 "처리할 일"에 나온다(§3.12).

GitLab 템플릿(`ci/harness-kit.gitlab-ci.yml`)에 더하는 것. `stages`에 `deploy`를 더한다.

```yaml
harness:deploy-verify:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_BRANCH == $HX_BASE_BRANCH && $CI_PIPELINE_SOURCE == "push"'
    - if: '$CI_COMMIT_BRANCH == $HX_BASE_BRANCH && $HX_DEPLOY_RESUME == "true"'
  resource_group: harness-verify-env
  script: [python3 scripts/harness/deploy.py auto-verify]
  artifacts: { when: always, paths: [.agents/reports/deploy/], expire_in: 30 days }
harness:deploy-production:
  stage: deploy
  rules: [{ if: '$CI_COMMIT_BRANCH == $HX_BASE_BRANCH', when: manual }]
  resource_group: harness-production
  script: [python3 scripts/harness/deploy.py run --env production --record "$HX_DEPLOY_RECORD"]
```

GitHub Actions는 `push: { branches: [<base>] }`에 `deploy-verify` job을, `workflow_dispatch`(입력 `record`)에 `deploy-production` job을 둔다. GoCD는 `deploy` stage를 수동 승인 stage로 둔다.

### 3.6 배포 점검표: IaC · 관측

design §13.3 · §13.4의 항목과 출처, 기계가 보는 것과 사람이 보는 것을 나눈다. 배포 기록 §5는 포함 이슈 §13.3의 합집합이다.

| 항목 | 가이드 출처 | design 자리 | 기계 검사 | 사람이 볼 것 |
|---|---|---|---|---|
| 롤백 | 10장 배포 게이트 | §13.2 | 판단 기준에 숫자가 있다, 시험 결과(D3) | 되돌린 뒤 데이터 |
| 로그 | 10장 | §13.3 | 체크 또는 이유 | 개인정보 · 비밀값 |
| 지표 | 10장, 스테이지 4.4 | §13.3 | 링크가 `http(s)` | SC · NFR과 맞는가 |
| 알람 | 10장, 스테이지 4.4 | §13.3 | 체크 또는 이유 | 기준이 §13.2와 같은가, 받는 사람 |
| SLO | 스테이지 4.4 · 4.7 | §13.3 | 체크 또는 이유 | 목표와 기간 |
| 런북 | 스테이지 4.5, 5장 브라운필드 | §13.3 | 링크 | 기존 런북 · 운영 정책과 맞는가 |
| 비밀값 | 10 · 11장 | §13.3 | gitleaks(09 §3.3)가 값이 없는지 본다 | 저장 경로 · 회전 방법 |
| 환경 차이 | 10장 | §13.3 | 체크 또는 이유 | 검증 환경에서 못 본 것 |
| IaC 도구 · 자원 · 환경 | 4 · 11장 | §13.4 | 표 값이 차 있다 | 적용 순서 |
| 최소 권한 | 11장 | §13.4 | 표 값이 차 있다 | 권한 범위 |
| 비용 | 4 · 11장 | §13.4 | 숫자가 있다 | 근거 |

### 3.7 운영 기록

자리: `.agents/docs/ops/records/<날짜>-<주제>.md`. `<날짜>`는 기록 기간의 끝 날, `<주제>`는 영문 kebab-case 2~5단어. 주기 기록(배포 뒤 1주 · 매월)과 장애 기록을 같은 형식으로 쓴다. 템플릿 원본은 `_spec-templates/ops/record.md`(새로).

```markdown
---
kind: ops-record
topic: payment-v2-week1
period: { from: 2026-12-01, to: 2026-12-07 }
deploys: [ops/deploys/2026-12-01-INT-7.md]
intents: [INT-7]
created: 2026-12-08
---

# 운영 기록 — 결제 개편 1주차

## 1. 목표 대비 실측
| ID | 지표 | 목표 | 실측 | 판정 | 출처 |
|---|---|---|---|---|---|
| INT-7 SC-1 | 결제 실패율 | ≤ 0.5% | 0.42% | 충족 | https://grafana…/d/pay?from=1764514800000&to=1765119600000 |
| HDRV3D-12 NFR-1 | 결제 API p95 | ≤ 300ms | 340ms | 미달 | ci:…/pipelines/900/artifacts/perf.json |

## 2. 전달 지표
<!-- METRICS:BEGIN — harness-kit metrics 가 쓴다. 손으로 고치지 않는다 -->
| 지표 | 기준선 | 이 기간 | 계산 방법 |
|---|---|---|---|
<!-- METRICS:END -->

## 3. 장애
### INC-1 · 등급 2 · 2026-12-03
- 감지: 알람 링크 · 2026-12-03T14:10+09:00
- 영향: 카드 결제 일부 실패(약 40분)
- 원인 배포: ops/deploys/2026-12-01-INT-7.md    (배포와 무관하면 "배포 무관")
- 조치: 플래그 끄기 → 롤백 배포 ops/deploys/2026-12-03-INT-7.md
- 런북: https://wiki…/runbooks/payment    (없으면 "런북 없음" → §5 후보)
- 후속 이슈: HDRV3D-31

## 4. 런북 · 운영 정책 확인
| 런북 · 정책 | 링크 | 이번 배포와 맞는가 | 고칠 것 |
|---|---|---|---|

## 5. 다음 Intent 후보
| ID | 후보 | 근거 | 종류 | 접수 |
|---|---|---|---|---|
| NX-1 | 결제 API p95 개선 | HDRV3D-12 NFR-1 | change | — |

## 6. 배운 것
| ID | 내용 | 규칙 후보 |
|---|---|---|
| L-1 | 배포 전 PG 토큰 만료 설정을 확인하지 않았다 | — |
```

- `ops new`: `npx harness-kit ops new --topic <주제> [--from <날짜>] [--to <날짜>]`가 틀을 만든다. 명령은 기간 안 배포 기록 목록, 그 배포의 Intent §3 성공 지표와 이슈 NFR의 목표값(§1의 ID · 지표 · 목표 칸), §2 구간을 채운다. 실측 · 판정 · 출처는 사람이나 에이전트 세션이 채운다.
- 출처(DO-R9): 기간을 고정한 링크(`from`·`to`가 든 URL) 또는 `ci:<산출물 경로>`. 출처 없는 실측 값은 `verify.sh fast` 실패다. 서비스 지표 값은 §3.10의 전달 지표 계산에 쓰지 않는다.
- 판정: `충족` · `미달` · `측정 못 함`. `미달` 행을 §3 장애나 §5 후보의 `근거`가 가리키지 않으면 `verify.sh fast`가 경고한다.
- 장애 등급: 1(전체 중단) · 2(주요 기능 장애) · 3(일부 사용자) · 4(불편). 제목 정규식 `^### (INC-\d+) · 등급 ([1-4]) · (\d{4}-\d{2}-\d{2})$`.
- ID(`INC-<n>` · `NX-<n>` · `L-<n>`)는 기록 안에서 유일하고 지우지 않는다. 다른 문서는 `<기록 경로>#INC-1`로 가리킨다.
- §4는 기존 코드에 배포한 경우(접수 종류 `feature` · `change` · `refactor`)에 채운다. 비어 있으면 S10이 "런북 확인 없음"을 보인다.

### 3.8 장애 → bug 이슈

```text
npx harness-kit intake --kind bug --from ops:<기록 경로>#INC-1     (세션 /hx-intent --new ops:<기록>#INC-1)
1. 기록에서 INC-1 절을 읽는다. 없으면 exit 2
2. 08 §3.11의 bug 접수: issues/<키>-<이름>/ 와 requirements.md 초안. 키는 01 §3.7.2 · 10 §3.4 규칙
3. requirements 초안: §1에 영향 · 감지, Edge Cases에 현재 동작(장애) · 기대 동작 · 바뀌면 안 되는 동작,
   원인 배포가 있으면 그 기록의 포함 이슈를 §9 의존성에
4. 머리: source: { type: ops, ref: "ops/records/2026-12-08-payment-v2-week1.md#INC-1", sha256 }, risk: medium 이상을 제안
5. 운영 기록 INC-1의 "후속 이슈:" 줄에 키를 쓴다. 이 줄 밖은 바꾸지 않는다
```

- `risk`는 requirements 승인 때 사람이 확정한다(08 §3.15). 장애에서 온 bug는 `low`를 제안하지 않는다.
- 원인 배포가 적힌 장애는 배포 실패율에, 후속 이슈를 담은 배포는 복구 시간에 들어간다(§3.10).

### 3.9 운영 기록 → 다음 Intent

08 §3.11 접수를 그대로 쓰고 출처만 `ops`다.

```text
npx harness-kit intake --from ops:<기록>#NX-1     (세션 /hx-intent --new ops:<기록>#NX-1, 화면 S10 "요구사항으로" → S11)
```

- 제목과 종류는 NX 행에서 가져온다. 본문은 NX 행과, 그 행의 `근거`가 가리키는 지표 행 · 장애 절 · 배운 것 행을 원문 그대로 `intake.md`에 옮긴다.
- `intake.md` 머리: `source: { type: ops, ref, url: null, importedAt, version: <기록 sha256 앞 12자> }`(10 §3.6 형식).
- 명령은 운영 기록 NX 행의 `접수` 칸에 Intent 키를 쓴다. 같은 NX를 다시 접수하면 기존 Intent 경로를 출력하고 끝낸다(DO-R11).
- AI-DLC를 켠 리포는 `intake.md` 경로를 AI-DLC의 첫 요청으로 넘긴다(08 §3.11과 같다).
- 11 E8이 이 경로를 시험한다.

### 3.10 전달 지표와 기준선

다섯 지표를 git 기록 · `approvals.md` · 배포 기록의 CI 값으로 계산한다(DO-R12). 09 §3.9의 이슈당 사람 개입 수와 요구사항 → 병합 리드타임은 검증 탭에 그대로 두고, 여기서는 배포까지 본다.

| 지표 | 계산 | 입력 |
|---|---|---|
| 리드 타임 | 이슈마다 (운영 배포 기록 `succeeded`의 §7 deploy 끝 시각) − (Intent `intake.md`를 더한 커밋 시각. Intent가 없으면 그 이슈 `requirements.md`를 더한 커밋 시각). 중앙값 · p85 | git log, 배포 기록 |
| 배포 실패율 | 운영 배포 기록 중 `rolled-back` · `failed`이거나 7일 안의 장애가 `원인 배포`로 가리킨 것 ÷ 운영 배포 기록 수 | 배포 기록, 운영 기록 장애 |
| 복구 시간 | 장애마다 (복구 배포 기록의 §7 끝 시각) − (그 장애 후속 bug 이슈의 `requirements.md`를 더한 커밋 시각). 복구 배포 = 같은 장애의 롤백 배포 또는 후속 이슈를 담은 첫 배포. 중앙값 | 배포 기록, 운영 기록, git log |
| 승인 대기 시간 | 게이트마다 (문서 머리를 `in-review`로 바꾼 커밋 시각) − (그 sha의 `approved` 기록 시각). `mr`은 MR 열린 시각(glab · gh) → `mr · approved`. 중앙값 · p85 | git log, `approvals.md` |
| 재작업 비율 | 기간 안 병합한 이슈 중, 병합 뒤 30일 안에 그 이슈가 바꾼 파일을 다시 고친 `fix/` 이슈가 병합된 것 ÷ 병합한 이슈 수. 게이트에서 돌려보낸 횟수(`changes-requested`)의 이슈당 평균을 같이 낸다 | git log, `approvals.md` |

- 복구 시간의 시작은 접수 커밋이라 실제 감지보다 늦을 수 있다. 감지 시각은 사람이 적은 값이라 쓰지 않는다.
- 운영 배포 기록이 없는 리포(라이브러리)는 리드 타임을 병합 커밋까지로 재고 `method: merge`로 표시한다. 배포 실패율 · 복구 시간은 `null`.

```text
npx harness-kit metrics [--baseline [--force]] [--verify-baseline] [--from YYYY-MM-DD --to YYYY-MM-DD] [--json]
python3 scripts/harness/delivery_metrics.py …     Node 없는 CI
```

- 기본 기간은 최근 30일. 결과는 `.agents/reports/metrics/delivery-<끝 날짜>.json`(커밋 안 함). 운영 기록 §2 구간도 같은 계산으로 채운다.
- `--baseline`: 킷 도입 커밋(`harness-kit.lock`을 처음 더한 커밋) 앞 90일. 결과는 `.agents/docs/ops/metrics-baseline.json`(커밋함). 이미 있으면 `--force` 없이는 거부한다.
- `--verify-baseline`: 기준선의 입력 범위로 다시 계산해 값이 다르면 exit 1. CI 야간 `full`이 부른다.

도입 전에는 배포 기록과 승인 기록이 없어서 기준선은 다른 입력을 쓴다. 지표마다 `method`를 남긴다.

| 지표 | 도입 뒤(`method: kit`) | 도입 전 기준선(`method: git`) |
|---|---|---|
| 리드 타임 | 위 표 | 이슈 브랜치 첫 커밋 → 그 브랜치 병합 커밋 |
| 배포 실패율 | 위 표 | 태그 `v*`를 배포로 보고, 7일 안의 `revert` 커밋 · `hotfix/` 병합을 실패로 |
| 복구 시간 | 위 표 | 실패로 본 태그 → 다음 태그 |
| 승인 대기 시간 | 위 표 | MR 열림 → 첫 플랫폼 승인(glab · gh). 읽지 못하면 `null`, `method: unavailable` |
| 재작업 비율 | 위 표 | 같은 정의(git만 쓴다) |

```json
{
  "schema": "harness-kit.delivery-baseline/v1",
  "range": { "from": "2026-08-25", "to": "2026-11-23", "base": "develop", "headSha": "a1b2c3d" },
  "inputDigest": "sha256:7c1e…",
  "metrics": {
    "leadTimeHours":     { "median": 96.5, "p85": 210.0, "n": 41, "method": "git" },
    "changeFailureRate": { "value": 0.12, "n": 17, "method": "git" },
    "mttrHours":         { "median": 5.2, "n": 2, "method": "git" },
    "approvalWaitHours": { "median": null, "method": "unavailable" },
    "reworkRate":        { "value": 0.18, "n": 41, "method": "git" }
  },
  "createdAt": "2026-11-23T12:00:00+09:00"
}
```

- `inputDigest`는 입력으로 쓴 `git log --format=%H%x00%ct%x00%s` 출력과 태그 목록의 sha256이다.
- 도입 전과 뒤의 `method`가 다른 지표는 S10과 보고서에 "계산 방법 다름"을 붙인다. 숫자만 나란히 놓지 않는다.

### 3.11 규칙 후보

리뷰 · 승인 · 운영에서 사람이 고친 것 중 반복될 것을 규칙 후보 파일로 모으고, 사람이 골라 MR로 `.agents/rules/`에 넣는다.

출처 셋:

| 출처 | 후보가 되는 조건 |
|---|---|
| 승인 기록 | `changes-requested` 기록에 `- 규칙 후보: 예` 줄이 있다. 승인하는 사람이 화면 S03의 "규칙 후보로 표시"나 `approve … --changes-requested --rule-candidate`로 넣는다 |
| 리뷰 처리 | 이슈 `review.md`에서 처리가 `수용`인 지적 중 같은 `check`(09 §3.1)와 같은 규칙 ID(`RV-RULE`이면 `.agents/rules/` 파일 이름)가 30일 안에 이슈 2개 이상에서 나온다 |
| 운영 기록 | §6 배운 것 행. 08 §3.13 codebase 모델의 `관행` 행 중 사람이 질문 답으로 "규칙으로 올린다"를 고른 것 |

```text
npx harness-kit rules candidates [--since 30d]     출처를 훑어 새 후보 파일을 만든다(이미 있는 출처는 건너뛴다)
npx harness-kit rules promote RC-4                 chore/RC-4-<이름> 브랜치에 규칙 파일 수정 + 후보 status: accepted
npx harness-kit rules reject RC-4 --reason "…"     후보 status: rejected
```

후보 파일 `.agents/docs/rule-candidates/RC-<n>-<이름>.md`:

```markdown
---
id: RC-4
status: proposed                # proposed | accepted | rejected
target: .agents/rules/payment.md
sources:
  - { type: approval, ref: "issues/HDRV3D-12-payment-method/approvals.md#2026-11-24T09:40:02+09:00" }
  - { type: review, ref: "issues/HDRV3D-19-refund-api/review.md#F-2", check: RV-RULE }
  - { type: ops, ref: "ops/records/2026-12-08-payment-v2-week1.md#L-1" }
created: 2026-12-08
mr: null
---

# RC-4 PG 연동 변경은 토큰 만료 설정을 design §13.3에 적는다

## 제안 규칙
(규칙 파일에 들어갈 문장. 조건과 숫자로)

## 근거
(출처마다 한 줄: 무엇을 고쳤나)

## 적용하지 않는 경우
```

- `rules candidates`는 출처와 근거 줄을 채우고, `제안 규칙`은 비워 둔다. 문장은 사람이나 에이전트 세션이 쓴다.
- 대상이 킷 템플릿이면(`target`이 킷 소유 파일) 04 §3.11 올리는 경로로 보낸다. 프로젝트 규칙이면 `rules promote`가 브랜치를 만든다.
- `accepted`는 MR 병합으로만 생긴다. `verify.sh fast`는 `accepted` 후보의 `target` 파일이 같은 MR에서 바뀌지 않았으면 실패한다(DO-R15). 규칙 변경 MR도 `mr` 게이트와 base 판 검증(09 VQ-R11)을 거친다.
- 후보는 `proposed`로 14일이 지나면 "처리할 일"에 나온다.

### 3.12 관리 페이지 S10 데이터

`GET /ops`(06 §3.5) 응답의 `data`:

```json
{
  "deploys": [ { "path": "…", "key": "INT-7", "env": "production", "state": "succeeded", "issues": ["HDRV3D-11"], "risk": "high",
                 "approval": "valid", "rollbackTest": "passed", "finishedAt": "…" } ],
  "records": [ { "path": "…", "topic": "payment-v2-week1", "period": { "from": "…", "to": "…" },
                 "metrics": [ { "id": "HDRV3D-12 NFR-1", "target": "≤ 300ms", "actual": "340ms", "verdict": "미달", "source": "ci:…" } ] } ],
  "incidents": [ { "record": "…", "id": "INC-1", "grade": 2, "date": "2026-12-03", "cause": "ops/deploys/…", "followUp": "HDRV3D-31" } ],
  "candidates": [ { "record": "…", "id": "NX-1", "title": "결제 API p95 개선", "kind": "change", "evidence": ["HDRV3D-12 NFR-1"],
                    "intake": null, "overlaps": ["INT-3"] } ],
  "delivery": { "current": { "leadTimeHours": { "median": 70.1 } }, "baseline": { "leadTimeHours": { "median": 96.5 } },
                "methodMismatch": ["approvalWaitHours"] },
  "autoVerify": { "enabled": true, "status": "stopped", "consecutiveFailures": 2, "lastPassedSha": "77c0e1a", "lastRun": "…" },
  "ruleCandidates": [ { "id": "RC-4", "status": "proposed", "target": ".agents/rules/payment.md", "sources": 3, "ageDays": 3 } ]
}
```

- `overlaps`: 후보와 area가 같거나 제목 낱말이 2개 이상 겹치는 열린 Intent.
- 읽기 모듈 `ops`(06 §3.2)의 원본: `.agents/docs/ops/**/*.md` · `ops/metrics-baseline.json` · `rule-candidates/*.md` · `.agents/reports/deploy/*.json` · `.agents/reports/metrics/delivery-*.json`.

S10 영역(화면기획서 S10 정의는 1~3이 있고, 4~6을 더한다):

| 번호 | 영역 | 데이터 | 동작 |
|---|---|---|---|
| 1 | 기록 | `deploys` · `incidents` · `records`를 시간순으로 | 기록 · 후속 이슈 열기 |
| 2 | 다음 요구사항 후보 | `candidates` | "요구사항으로" → S11(제목 · 종류 · 출처 `ops:<기록>#NX-n` 채움) |
| 3 | 새 요구사항 | — | S11로 이동 |
| 4 | 전달 지표 | `delivery` | 다섯 지표의 최근 30일 · 기준선, `method` 다름 표시 |
| 5 | 자동 검증 배포 | `autoVerify` | 상태 · 연속 실패 수, 재개 방법(파이프라인 수동 실행) 안내 |
| 6 | 규칙 후보 | `ruleCandidates` | `rules promote` · `rules reject` 명령 복사 |

- S10은 쓰지 않는다(지금 정의 유지). 장애 → bug 이슈와 후보 → Intent는 S11 접수로 보낸다.
- "처리할 일"(06 §3.4)에 더할 항목: 자동 검증 배포 멈춤, `deploy` 승인 대기 기록, `미달`인데 장애 · 후보가 가리키지 않는 지표 행, 14일 넘은 `proposed` 규칙 후보.
- 콘솔: `npx harness-kit status --ops [--json]`(06 §3.15 S10 행).

### 3.13 오류

| 상황 | 동작 |
|---|---|
| 포함 이슈 폴더가 base에 없다 | `deploy plan` exit 1, 키 출력 |
| `deploy record --from-ci` 산출물의 head가 기록 sha와 다르다 | 거부, 두 sha 출력 |
| 승인 뒤 계획 구간을 고쳤다 | 승인 `stale`, `deploy.py check`가 D2와 "승인 sha 불일치"를 출력 |
| 자동 검증 배포가 직전 실행 결과를 읽지 못한다 | 배포하지 않고 `stopped`(이유: 실패 수 모름) |
| 운영 기록 실측 값에 출처가 없다 | `verify.sh fast` 실패, 줄 번호 |
| `미달` 지표를 장애 · 후보가 가리키지 않는다 | `verify.sh fast` 경고 |
| 기준선 재계산 값이 다르다 | `metrics --verify-baseline` exit 1. 사람이 `--baseline --force`로 다시 만든다 |
| `accepted` 후보의 대상 규칙 파일이 같은 MR에서 안 바뀌었다 | `verify.sh fast` 실패(DO-R15) |

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 킷이 운영 배포를 직접 실행한다 | 팀마다 배포 시스템과 권한이 다르다. 킷은 배포 앞의 승인 검사와 뒤의 결과 기록만 맡고, 명령은 `deploy.json`으로 부른다 |
| 배포 승인을 배포 기록 폴더의 `approvals.md` 하나에 둔다 | 게이트 조건(09 §3.8)은 이슈의 `approvals.md`를 읽는다. 승인 자리가 셋이 되면 Node · Python 파서를 둘 다 늘려야 한다 |
| 승인 sha를 배포 기록 전체로 잡는다 | 배포 뒤 결과를 쓰면 승인이 `stale`이 된다. 계획 구간만 묶는다 |
| 롤백 시험 면제를 기록 본문의 문장으로 받는다 | 에이전트가 쓸 수 있다. 면제는 승인하는 사람이 승인 요청에 넣는다 |
| E2E가 실패하면 같은 실행 안에서 다시 시도한다 | 불안정한 시험이 통과로 가려진다 |
| 자동 검증 배포가 실패해도 계속 배포한다 | 깨진 검증 환경 위에 배포가 쌓여 어느 병합이 깼는지 가르기 어렵다 |
| 모니터링 도구 API를 킷이 읽는다 | 도구마다 연결 방법과 권한이 다르다. 링크와 CI 산출물로 받고 연결은 프로젝트가 정한다 |
| 리드 타임 · 복구 시간을 사람이 적는다 | 자기 보고 값은 기준선과 비교할 수 없다(AI-DLC 가이드 2 · 8장) |
| 규칙 후보를 에이전트가 규칙 파일에 바로 넣는다 | 사례 하나가 모든 세션의 지시가 된다. 사람이 고르고 MR로 넣는다 |
| 후보를 파일 하나(`rule-candidates.md`)에 모은다 | 후보마다 상태와 MR이 따로라서 한 파일이면 MR끼리 충돌한다 |

## 5. 완료 기준

1. design §13.2 판단 기준이 빈 fixture는 design 승인 API가 422, §13 전체가 "배포 없음: 내부 라이브러리" 한 줄이면 통과한다.
2. 한 Intent의 이슈 2개가 `done`인 fixture에서 `deploy plan INT-7`이 `ops/deploys/<날짜>-INT-7.md`를 만든다. §1이 2행이고 §5가 두 design §13.3의 합집합이다.
3. 시험: §4가 `시험: none`이고 면제 사유가 없는 `deploy` 승인 요청은 422 `gate_precondition`(D3). 사유를 넣으면 201이고 두 이슈 `approvals.md`에 같은 기록이 붙는다. `risk: high` 기록은 사유가 있어도 422다.
4. 시험: `risk: high` 기록은 승인자 1명이면 게이트 미통과, 다른 git `user.email`의 두 번째 승인 뒤 통과한다.
5. 시험: 승인 뒤 계획 구간 한 줄을 바꾸면 `deploy.py check --require-approved`가 exit 1, 결과 구간만 바꾸면 exit 0이다.
6. 시험: 가짜 CI(11 §3.4 stubs)에서 E2E가 두 번 연속 실패하면 세 번째 base push의 `auto-verify`가 배포 명령을 부르지 않고(stub 호출 기록 0건) `stopped`다. `HX_DEPLOY_RESUME=true` 실행이 통과하면 다음 push는 배포한다.
7. 출처 없는 실측 값이 1개인 운영 기록 fixture에서 `verify.sh fast`가 실패한다.
8. `intake --kind bug --from ops:…#INC-1`이 bug 이슈 폴더를 만들고 운영 기록 diff는 1줄이다. `intake --from ops:…#NX-1`이 `source.type: ops`인 Intent를 만들고, 같은 명령을 다시 돌리면 Intent 수가 그대로다.
9. git fixture(병합 20건 · 태그 5개 · revert 1건 · hotfix 1건)에서 `metrics --baseline` 값이 기대값 파일과 같고 `--verify-baseline`이 exit 0이다. 기준선 숫자 하나를 바꾸면 exit 1이다.
10. `규칙 후보: 예` 기록 1건과 같은 `RV-RULE` 수용 지적이 이슈 2개에 있는 fixture에서 `rules candidates`가 후보 2개를 만든다. 규칙 파일을 바꾸지 않고 후보만 `accepted`로 바꾼 커밋은 `verify.sh fast`가 실패한다.
11. `GET /ops`와 `status --ops --json`의 `data`가 같다(06 §3.15 시험 규칙).

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| CI 작업 안에서 같은 작업의 직전 실행 결과를 읽을 권한(GitLab `CI_JOB_TOKEN`, GitHub `GITHUB_TOKEN`) | 시험 리포에서 확인한다. 안 되면 산출물 방식만 쓴다 |
| 에이전트 세션이 파이프라인을 수동 실행하지 못하는지(`glab ci run` · `gh workflow run`으로 재개 변수를 넣는 경로) | 하네스별 deny 목록에 두 명령을 넣고 시험한다(09 §3.8 강제 장치 표에 행 추가 여부) |
| 서비스 지표 실측 값을 CI 산출물(모니터링 내보내기 파일)로 받을 수 있는 리포가 있는지 | P24 착수 때 knots · hdr의 모니터링 도구를 본다. 없으면 링크만 받는다 |
| 도입 전 90일 MR 승인 시각을 glab · gh로 읽는 비용(API 호출 수) | knots에서 시험 실행한다. 5분을 넘으면 표본으로 줄인다 |
| GoCD에는 MR 요약 코멘트 deploy 구간을 쓸 자리가 없다 | GoCD 리포는 S10과 산출물만 쓴다고 적을지 P24 착수 때 정한다 |
