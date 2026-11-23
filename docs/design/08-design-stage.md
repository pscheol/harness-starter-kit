# 08. 설계 단계: Intent · Unit · 기획물

- 단계: P21(v2.3). 선행: P18 · P20 · D7.
- 방향과 이유: [02 #modes](../harness-next/02-direction.html#modes) · [02 #plans](../harness-next/02-direction.html#plans) · [02 #roles](../harness-next/02-direction.html#roles) · [05 #principles](../harness-next/05-principles.html#principles) · [05 #roles](../harness-next/05-principles.html#roles) · [05 #issue-key](../harness-next/05-principles.html#issue-key) · [03 #p21](../harness-next/03-plan.html#p21)
- 이슈 키 생성·이슈 폴더: 01. 승인 기록 형식: 06 §3.7. 게이트 조건: 09 §3.8. AI-DLC 어댑터·Jira 연동: 10.

## 1. 목적·범위

요구사항 한두 문단에서 시작해 Intent 문서 · 질문과 답 · 스토리와 수용 기준 · Unit 목록 · 기획물 네 가지 · Unit별 SDD 이슈까지를 킷만으로 만든다. AI-DLC를 켠 리포(`flow.design = "aidlc"`)는 Intent·Unit 부분만 AI-DLC가 만들고, 그 뒤는 같다.

범위에 넣는 것: `/hx-intent` 흐름, `intent.md` 템플릿, `questions.md` 형식, 분해 기준과 알고리즘, `units.json` 형식, 설계 단계 게이트, `/hx-specify --from-unit` 대응, 기획물 템플릿과 `/hx-screen-plan` · `/hx-design-plan` · `/hx-backlog`, 이슈 생성, 역할·승인자 사용, AI-DLC 경우의 `intent.json`, 기존 코드 역공학과 `codebase` 게이트(§3.13), 몹 정리 규칙(§3.14), 크기 · 위험 프로필(§3.15), 도메인 설계(§3.16).

범위 밖: AI-DLC 산출물 해석(10 §3.2), Jira API 호출(10 §3.4), requirements 이후 SDD 명령(`/hx-plan` 등, 기존 킷).

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| DS-R1 | `/hx-intent "<요구사항>"`을 실행하면 설계 세션은 `.agents/docs/intents/<Intent 키>-<이름>/`에 `intent.md`(draft)와 `questions.md`를 만든다. |
| DS-R2 | `/hx-intent <Intent 키>`를 실행하면 설계 세션은 파일 상태로 다음 단계(§3.1 표)를 정해 그 단계만 한다. |
| DS-R3 | 질문을 낼 때 설계 세션은 한 번에 5개까지, 질문마다 선택지 2~4개와 권장안 1개, 답할 직무, 막는 게이트를 적는다. |
| DS-R4 | 막는 게이트가 같은 질문에 답이 없는 동안 그 게이트는 승인할 수 없다. |
| DS-R5 | 스토리 5개 이상 · 도메인 2개 이상 · 사용자 유형 3개 이상 · 외부 통합 3개 이상 중 하나라도 맞으면 설계 세션은 Unit을 나누고, 맞은 기준과 수치를 `intent.md` §10에 적는다. 하나도 맞지 않으면 Unit 하나로 둔다. |
| DS-R6 | 둘 이상의 도메인이 주고받는 API·이벤트가 있으면 설계 세션은 그 계약을 `kind: contract` Unit으로 따로 두고, 그 계약을 쓰는 Unit의 `dependsOn`에 넣는다. |
| DS-R7 | `units.json`의 의존이 고리를 이루거나 없는 Unit을 가리키면 검사는 실패하고 고리·이름을 출력한다. |
| DS-R8 | 모든 스토리는 Unit 하나에만 속하거나 `unassigned`에 이유와 함께 있다. |
| DS-R9 | `intent` 게이트가 `flow.gates`에 있고 승인되지 않았으면 `/hx-specify --from-unit`은 멈추고 이유를 출력한다. |
| DS-R10 | 계약 Unit의 이슈 design이 approved가 아니면 그 계약을 쓰는 Unit의 `/hx-plan`은 멈추고 계약 이슈 키를 출력한다. |
| DS-R11 | `/hx-specify --from-unit <Intent 키>/<Unit id>`는 Unit의 스토리·수용 기준·NFR·위험을 requirements로 옮기고 머리에 `intent:` · `unit:` · `area:`를 단다. |
| DS-R12 | Unit에 이미 이슈가 연결돼 있으면 `/hx-specify --from-unit`은 새 이슈를 만들지 않고 기존 이슈 경로를 출력한다. |
| DS-R13 | jira-workflow 모듈을 켰으면 이슈 키는 Jira 작업 항목 키이고, 끈 경우 01의 킷 키 규칙을 쓴다. |
| DS-R14 | 기획물 명령은 스킬 지도(07 §3.7)의 칸을 해석해 깔린 스킬을 쓰고, 없으면 킷 템플릿을 쓴다. 어느 쪽을 썼는지 산출물 머리 `generatedWith`에 남긴다. |
| DS-R15 | 기획물 명령이 스킬을 쓴 경우에도 산출물은 템플릿의 필수 제목을 모두 가진다. 빠지면 명령은 빠진 제목을 출력하고 실패한다. |
| DS-R16 | 와이어프레임 HTML은 파일 하나로 열리고 외부 네트워크 요청이 0건이다. |
| DS-R17 | `backlog.md`의 Unit 상태는 SDD 보드(01·06)와 같은 계산에서 나온다. |
| DS-R18 | `flow.design = "aidlc"`이면 `intent.md` 대신 `intent.json`을 두고, `units.json`은 어댑터가 쓴다. `/hx-intent`는 AI-DLC 사용을 안내하고 끝낸다. |
| DS-R19 | 설계 세션의 세션 시작 훅은 `roles.design` 하네스와 현재 하네스가 다르면 그 사실을 알린다. |
| DS-R20 | 접수 종류가 `feature` · `change` · `refactor`이면 설계 세션은 스토리를 쓰기 전에 `current-state.md`와 그것이 가리키는 codebase 모델을 만들거나 갱신한다. |
| DS-R21 | `codebase` 게이트가 `flow.gates`에 있고 승인되지 않았으면 설계 세션은 스토리 · Unit 분해를 하지 않고 "codebase 게이트 승인 대기"를 출력한다. |
| DS-R22 | codebase 모델의 행마다 출처가 `static:<도구>` · `inferred · <파일:줄>` · `confirmed:Q-<n>` 중 하나다. 출처가 없거나 `inferred` 행에 근거 위치가 없으면 `verify.sh fast`가 실패한다. |
| DS-R23 | codebase 모델의 `baseSha` 뒤 그 모델 `paths`에서 바뀐 줄이 `codebase.staleLines`를 넘으면 `verify.sh fast`는 "역공학 문서 오래됨"을 경고하고, `codebase` 승인 API는 422 `model_stale`을 돌려준다. |
| DS-R24 | 몹 정리 세션이 열려 있으면 답 API는 `session.attendees`에 있는 사람을 답한 사람으로 받고, 답 줄에 답한 사람과 기록한 git 사용자를 따로 남긴다. |
| DS-R25 | 설계 세션은 Intent 머리에 `profile` · `risk`를 제안하고, 접수 종류의 기본 프로필과 다르면 범위 질문을 낸다. |
| DS-R26 | `risk: high`인 이슈의 design · mr · deploy 게이트는 서로 다른 승인자 2명의 기록이 있어야 통과한다. |
| DS-R27 | design §4.5에 불변식(`INV-<n>`)이 있으면 불변식마다 근거(`R#` · `NFR-#` · Intent 결정 · `KEEP-<n>`)와 시험 연결이 있다. |
| DS-R28 | `/hx-analyze`는 시험에 연결되지 않은 `INV-<n>` · `KEEP-<n>`을 HIGH로 보고한다. |

## 3. 설계

### 3.1 흐름과 상태

```text
요구사항 → /hx-intent "<요약>"         intent.md(draft) + questions.md(Q 1회차)
        → (feature · change · refactor) 역공학 §3.13: codebase/<영역>.md 갱신 + current-state.md(draft), 현재 동작 질문
        → [codebase 게이트]            current-state.md + 참조 모델 sha 승인(approvers.codebase)
        → 사람이 관리 페이지에서 답     questions.md status: answered → answers-ready 요청(06 §3.8)
        → /hx-intent INT-7             답 반영: 목표·범위 밖·스토리·EARS·NFR·위험 채움, 필요하면 질문 2회차
        → /hx-intent INT-7             분해 판정 → units.json(draft), intent.md §10
        → [intent 게이트]              intent.md + units.json 승인(approvers.intent)
        → /hx-screen-plan · /hx-design-plan · /hx-backlog → plans/
        → [plans 게이트]               plans/*.md 승인(approvers.plans)
        → /hx-specify --from-unit INT-7/U-1   계약 Unit 먼저, 그 뒤 의존 순서대로
```

`/hx-intent <키>`의 다음 단계 판정(DS-R2):

| 상태 | 다음 단계 |
|---|---|
| 종류가 `feature` · `change` · `refactor`이고 `current-state.md`가 없거나 참조 모델이 오래됐다(§3.13) | 역공학: 모델 갱신, `current-state.md`, 현재 동작 질문 |
| `codebase` 승인 기록이 없다(`flow.gates`에 있고 종류가 위 셋일 때) | 막는 게이트가 `codebase`인 열린 질문이 있으면 "질문 N건 답 대기". 없으면 `current-state.md`를 `in-review`로 올리고 "codebase 게이트 승인 대기". 스토리를 쓰지 않는다(DS-R21) |
| `questions.md`에 막는 게이트가 `intent`인 열린 질문이 있다 | 멈추고 "질문 N건 답 대기"를 출력. 관리 페이지 주소를 안내 |
| 답이 들어왔고 `intent.md`가 답을 반영하지 않았다(질문 파일 sha가 `intent.md` 머리 `answersSha256`과 다르다) | 답 반영, 새 질문이 필요하면 다음 회차(Q 번호 이어 붙임) |
| 스토리가 채워졌고 `units.json`이 없다 | 분해(§3.4) |
| `units.json`이 있고 `intent` 승인 기록이 없다 | `status: in-review`로 올리고 "intent 게이트 승인 대기" 출력 |
| `intent` 승인 있음, 기획물 없음 | 기획물 명령 셋을 안내 |
| `plans` 승인 있음 | 의존 순서로 `/hx-specify --from-unit` 할 Unit 목록 출력 |

Intent 키: jira-workflow 모듈을 켰으면 에픽 키(`HDRV3D-40`), 아니면 `INT-<n>`이다. `n`은 base 브랜치의 `.agents/docs/intents/INT-*`에서 가장 큰 번호 + 1이다. 폴더 이름은 `<Intent 키>-<이름>`, 이름은 영문 kebab-case 3~5단어(이슈 키 규칙과 같다, 05 #issue-key).

### 3.2 `intent.md` 템플릿

원본 자리: `.agents/docs/_spec-templates/intent/_template.md`.

```markdown
---
id: INT-7
title: 결제 개편
status: draft                 # draft | in-review | approved | superseded
flow: kit
kind: feature                 # product | feature | change | refactor (접수 종류, §3.11)
profile: feature              # §3.15. 설계 세션이 제안하고 이 문서 승인 때 확정
risk: medium                  # low | medium | high (§3.15)
areas: [payment, billing]
jira: null                    # jira-workflow를 켰으면 에픽 키
answersSha256: null           # 마지막으로 반영한 questions.md의 sha256
created: 2026-11-23
---

# Intent INT-7 — 결제 개편

## 1. 목표
(이 Intent가 끝나면 사용자가 얻는 결과. 측정 가능한 문장 1~3개)

## 2. 범위 밖
(하지 않는 것. 다른 Unit·다음 Intent로 미룬 것은 그 위치를 적는다)

## 3. 성공 지표
| 지표 | 현재 | 목표 | 재는 곳 |

## 4. 제약
(일정 · 규제 · 기술 · 비용. 출처를 붙인다)

## 5. 사용자 유형
| 유형 | 설명 | 스토리 |

## 6. 스토리와 수용 기준
### S-1 <한 줄 제목>
- 스토리: <유형>으로서 <목표>를 위해 <행동>한다.
- 도메인: payment · 통합: PG사 A
- S-1.AC-1: <조건>이면 시스템은 <결과>한다.   (EARS)

## 7. NFR
| ID | 항목 | 기준(숫자) | 관련 스토리 |

## 8. 위험 레지스터
| ID | 위험 | 가능성(상·중·하) | 영향(상·중·하) | 대응 | 담당 직무 |

## 9. 외부 통합
| 대상 | 방식 | 소유 팀 | 계약 Unit |

## 10. 분해 판정
| 기준 | 값 | 기준값 | 해당 |
| 스토리 | 8 | ≥ 5 | 예 |
| 도메인 | 2 | ≥ 2 | 예 |
| 사용자 유형 | 2 | ≥ 3 | 아니오 |
| 외부 통합 | 1 | ≥ 3 | 아니오 |
결론: 나눈다. Unit 3개(계약 1). 근거: units.json

## 11. 정해야 할 것
(질문 파일로 보내지 않은 결정. 결정한 사람·날짜를 적는다)

## 12. 도메인 지도
| 경계 컨텍스트 | 데이터 주인(애그리거트 후보) | Unit | 주는 계약 | 받는 계약 |
| payment | Payment | U-1 · U-2 | api:payments.v2 · event:payment.completed | — |
| billing | Settlement | U-3 | — | event:payment.completed |
```

ID 규칙: 스토리 `S-<n>`, 수용 기준 `S-<n>.AC-<m>`, NFR `NFR-<n>`, 위험 `RISK-<n>`. 한 번 붙인 ID는 지우지 않고, 뺀 스토리는 `~~S-4~~ (범위 밖 §2)`로 남긴다. §12는 분해(§3.4)보다 먼저 채운다. 쓰는 법은 §3.16.

### 3.3 `questions.md` 형식

Intent 폴더(설계 질문)와 이슈 폴더(`/hx-clarify`의 질문 파일 모드)에서 같은 형식을 쓴다.

```markdown
---
target: INT-7
status: open                  # open | answered
round: 1
---

# 질문 — INT-7 결제 개편

## Q-1 · 범위 · 답할 직무: po · 막는 게이트: intent
환불을 이번 범위에 넣는가?

- A. 넣는다 — 영향: Unit 1개 추가(환불), 일정 +1주
- B. 넣지 않는다 — 영향: 범위 밖 §2에 적고 다음 Intent 후보로 둔다
- 권장: B — 근거: 요구사항 원문에 환불이 없고, 결제수단 교체(S-1~S-3)가 먼저 배포돼야 한다
- 답:

## Q-2 · 보안 · 답할 직무: dev · 막는 게이트: intent
카드 번호를 우리 서버가 받는가?

- A. 받지 않는다(PG 토큰만) — 영향: PCI 범위 밖
- B. 받는다 — 영향: PCI DSS 대응 Unit 필요
- 권장: A — 근거: 현재 PG사 A가 토큰 결제를 지원한다(계약서 3조)
- 답: A · lee@example.com · 2026-11-23T10:12:40+09:00
- 메모: PG 토큰 만료 정책은 design에서 정한다
- 의견: B · park@example.com (qa) — 토큰 재발급 실패 시험이 필요하다
```

- 제목 정규식: `^## (Q-\d+) · (범위|보안|개인정보|UX|기술|운영) · 답할 직무: ([a-z][a-z0-9-]*)(?: · 막는 게이트: ([a-z]+))?$`. 분류 순서는 범위 > 보안·개인정보 > UX > 기술 > 운영이고, 질문은 이 순서로 놓는다.
- 선택지 줄: `^- ([A-D])\. (.+?) — 영향: (.+)$`. 권장 줄은 정확히 1개, 선택지 글자 하나를 가리킨다.
- 답 줄이 비어 있으면 열린 질문이다. 사람이 고르지 않은 "기타" 답은 `- 답: other · …` 다음 `- 메모:`에 글을 둔다.
- `답할 직무`는 `harness-kit.json`의 `groups` 키다. 그룹이 없는 이름이면 `/hx-analyze`가 경고한다.
- 설계 세션은 `- 답:` 줄을 쓰지 않는다. 답은 관리 페이지 답 API(06 §3.8)만 쓴다. 이 규칙은 훅이 막는다(09 §3.8의 보호 경로에 `questions.md`의 `- 답:` 줄 추가를 넣는다).
- 회차가 바뀌어도 Q 번호를 이어 붙인다. 이전 회차 질문은 지우지 않는다.
- 몹 정리 세션을 열면 머리에 `session`이 생기고, 답 줄 끝에 `· 기록: <git 사용자>`가 붙을 수 있다(§3.14).

### 3.4 분해 기준과 알고리즘

세는 방법:

| 기준 | 세는 대상 | 기준값 |
|---|---|---|
| 스토리 | §6의 지우지 않은 `S-<n>` | 5 |
| 도메인 | 스토리의 `도메인:` 값 종류(= requirements의 `area:` 후보) | 2 |
| 사용자 유형 | §5 표의 행 | 3 |
| 외부 통합 | §9 표의 행 | 3 |

```text
decompose(intent):
  if 네 기준 모두 미만: units = [U-1 하나, 스토리 전부]; return
  1. 스토리를 도메인으로 묶는다
  2. 계약 찾기: 스토리 AC가 다른 도메인의 데이터·이벤트를 읽거나 쓰면 (생산 도메인, 소비 도메인, 대상) 쌍을 만든다
     같은 생산 도메인의 쌍을 계약 Unit 하나로 묶는다: kind=contract, provides=[api:…, event:…]
  3. 도메인 묶음이 스토리 7개를 넘거나, 서로 겹치지 않는 사용자 유형 둘 이상으로 갈리면 유형별로 다시 나눈다
  4. 외부 통합 하나가 스토리 셋 이상에 걸리면 그 통합 어댑터를 Unit으로 뗀다(kind=integration)
  5. 의존: 소비 Unit.dependsOn += 계약 Unit, consumes = 계약 provides 중 쓰는 것
  6. 위상 정렬로 order를 매긴다. 고리면 실패(DS-R7)하고 고리를 출력한다
  7. 검사: Unit마다 Bolt 1~5개 추정(스토리 2~3개 = Bolt 1개). 6개 이상이면 3단계로 돌아가 나눈다
  8. 남은 스토리는 unassigned에 이유와 함께
```

Unit 크기 기준(배포 단위): Unit 하나는 브랜치·MR 하나로 끝나고 다른 Unit의 내부 코드 없이 시험된다. 계약 Unit의 산출물은 design §6(계약 절)과 계약 시험이다.

### 3.5 `units.json` 형식

킷 설계와 AI-DLC 어댑터가 같은 형식을 쓴다. 진행 상태는 연결된 이슈 문서에서 계산하고 이 파일에 두지 않는다(두 번째 원본을 만들지 않는다).

```json
{
  "schema": "harness-kit.units/v1",
  "intent": { "key": "INT-7", "title": "결제 개편", "doc": "intent.md" },
  "source": { "kind": "kit" },
  "decomposition": {
    "stories": 8, "domains": 2, "userTypes": 2, "integrations": 1,
    "split": true, "reasons": ["stories>=5", "domains>=2"]
  },
  "units": [
    {
      "id": "U-1", "name": "payment-contract", "title": "결제 API·이벤트 계약",
      "kind": "contract", "area": "payment", "repo": null,
      "stories": ["S-1"], "nfr": ["NFR-2"], "risks": ["RISK-1"],
      "dependsOn": [], "provides": ["api:payments.v2", "event:payment.completed"], "consumes": [],
      "order": 1, "issue": "HDRV3D-11", "planned": true
    },
    {
      "id": "U-2", "name": "payment-method", "title": "결제수단 교체",
      "kind": "feature", "area": "payment", "repo": null,
      "stories": ["S-2", "S-3", "S-4"], "nfr": ["NFR-1", "NFR-2"], "risks": [],
      "dependsOn": ["U-1"], "provides": [], "consumes": ["api:payments.v2"],
      "order": 2, "issue": "HDRV3D-12", "planned": true
    },
    {
      "id": "U-3", "name": "settlement-notice", "title": "정산 알림",
      "kind": "feature", "area": "billing", "repo": null,
      "stories": ["S-5", "S-6"], "nfr": [], "risks": ["RISK-2"],
      "dependsOn": ["U-1"], "provides": [], "consumes": ["event:payment.completed"],
      "order": 2, "issue": null, "planned": true
    }
  ],
  "unassigned": [ { "story": "S-8", "reason": "범위 밖 Q-1 답 B" } ]
}
```

| 필드 | 규칙 |
|---|---|
| `id` | `^U-\d+$`, 파일 안에서 유일, 지우지 않는다(뺀 Unit은 `planned: false`) |
| `kind` | `contract` · `feature` · `integration` |
| `area` | requirements `area:`로 옮겨지는 값. 영문 kebab-case |
| `repo` | multi-harness 리포에서 이 Unit이 사는 도메인 리포(10 §3.5). 단일 리포면 `null` |
| `dependsOn` | 같은 파일의 Unit id. 계약 Unit은 feature Unit에 의존하지 않는다 |
| `issue` | `/hx-specify --from-unit`이 채운다. 사람·관리 페이지는 쓰지 않는다 |
| `planned` | `false`면 보드에서 "제외"로 보이고 의존 검사에서 빠진다 |
| `source` | `{"kind":"kit"}` 또는 10 §3.2의 AI-DLC 출처 |

검사 스크립트 `scripts/harness/intent_check.py <Intent 폴더>`가 위 규칙, 스토리 배정(DS-R8), 의존 고리(DS-R7)를 본다. `verify.sh fast`가 바뀐 Intent 폴더에 이것을 부른다.

### 3.6 게이트

| 게이트 | 대상 | 승인자 | 앞 조건 |
|---|---|---|---|
| `codebase` | `current-state.md` + 머리 `models`의 codebase 모델 파일(각 sha를 기록) | `approvers.codebase`(기본 `dev`) | 종류가 `feature` · `change` · `refactor`, 막는 게이트가 `codebase`인 열린 질문 0, 참조 모델이 오래되지 않음(DS-R23), §4 시험 기준선이 `headSha` 실행 결과 |
| `intent` | `intent.md` + `units.json`(두 sha를 기록) | `approvers.intent` | `codebase` 통과(해당할 때), 막는 게이트가 `intent`인 열린 질문 0, `intent_check.py` 통과, `[NEEDS CLARIFICATION` 0 |
| `plans` | `plans/*.md` 전부(각 sha 기록). 와이어프레임 HTML은 `screens/index.md`가 목록과 sha를 적는다 | `approvers.plans` | `intent` 승인, 기획물 필수 제목 통과 |

- 승인 기록은 Intent 폴더의 `approvals.md`(형식 06 §3.7)에 남긴다.
- 세 게이트는 `flow.gates`에서 뺄 수 있다(하한 밖). 뺀 경우 `/hx-specify --from-unit`은 승인 검사를 건너뛰고 "intent 게이트 없음"을 출력한다. 리포가 넣어 둔 게이트를 프로필이 끄지는 않는다(§3.15).
- 승인 뒤 `intent.md`·`units.json`이 바뀌면 승인이 `stale`이 된다(06 §3.3). 이미 만든 이슈는 그대로 두고, 대시보드가 "Intent 승인 뒤 변경"을 보여 준다.

### 3.7 `/hx-specify --from-unit`

```text
/hx-specify --from-unit INT-7/U-2
1. Intent 폴더와 units.json을 읽는다. intent 게이트 검사(DS-R9)
2. Unit.issue가 있으면 그 경로 출력 후 끝(DS-R12)
3. dependsOn의 Unit 중 issue가 없는 것이 있으면 "U-1(계약)부터" 출력 후 끝
4. 이슈 키: jira 모듈이면 10 §3.4로 작업 항목 생성(에픽 = Intent 키, 유형 = kind별), 아니면 01 키 규칙
5. bash scripts/new-feature.sh <키> <Unit.name> → issues/<키>-<이름>/
6. requirements.md를 아래 표대로 채운다(status: draft)
7. units.json의 Unit.issue = <키>(설계 세션이 쓰는 폴더라 에이전트가 고친다)
8. 브랜치 이름 안내: feat/<키>-<이름>(계약 Unit도 feat)
```

| Unit · Intent | requirements.md |
|---|---|
| — | 머리: `issue: HDRV3D-12` · `intent: INT-7` · `unit: U-2` · `area: payment` · `status: draft` · `dependsOn: [HDRV3D-11]` · `profile` · `risk`(Intent 값, 이슈에서 올릴 수만 있다) |
| Unit `title` + Intent §1 중 이 Unit 스토리와 관련된 목표 | §1 Introduction |
| Intent §2 + 다른 Unit에 간 스토리(`S-5 → U-3에서 다룬다`) | §2 범위 밖 |
| Unit `stories` | §3 User Stories. `US-1 (S-2)`처럼 원래 ID를 괄호로 남긴다 |
| `S-n.AC-m` | §4 Acceptance Criteria. `R1.1 (S-2.AC-1)`, EARS 문장은 그대로 |
| Unit `nfr` + 관련 스토리가 없는 전역 NFR | NFR 절. ID 유지 |
| Unit `risks` | 위험 절 |
| `consumes` | "의존 계약" 절: 계약 이슈 키, design §6 링크 |
| `kind: contract` | design 템플릿 §6 계약 절을 필수로 표시 |
| `current-state.md` §3의 `KEEP-n` 중 이 Unit 범위(§1 모듈)에 든 것 | Edge Cases의 "바뀌면 안 되는 동작" 줄. ID 유지 |
| Intent §12에서 이 Unit의 행 | design 초안 §4.5 요소 표의 "경계 밖 참조" 칸(§3.16) |

DS-R10 구현: `scripts/check-sdd-prerequisites.sh`가 `/hx-plan` 앞에서 requirements 머리의 `dependsOn` 이슈마다 design `status`를 본다. 그 이슈 폴더가 현재 체크아웃에 없으면 base와 로컬 브랜치를 git 객체로 찾는다(06 §3.2와 같은 순서).

### 3.8 기획물

자리: `.agents/docs/intents/<Intent>/plans/`. 원본은 Markdown(와이어프레임만 HTML), HTML 렌더는 관리 페이지가 그때그때 하고 커밋하지 않는다.

| 파일 | 필수 제목 | 원본 템플릿 |
|---|---|---|
| `requirements-doc.md` | 목표 · 범위 밖 · 스토리와 수용 기준 · NFR · 위험 · 변경 기록 | `_spec-templates/plans/requirements-doc.md` |
| `screens/index.md` | 화면 목록 · 화면 흐름 · 화면별 요소와 상태 · 와이어프레임 목록 | `_spec-templates/plans/screens/index.md` |
| `screens/SCR-<nn>-<이름>.html` | — (HTML 규칙 아래) | `_spec-templates/plans/screens/_wireframe.html` |
| `design-plan.md` | 디자인 방향 · 색 토큰 · 글꼴 토큰 · 간격 토큰 · 컴포넌트 · 접근성 기준 · 동작 | `_spec-templates/plans/design-plan.md` |
| `backlog.md` | Unit·이슈 표(생성 구간) · 우선순위 · 의존 순서 | `_spec-templates/plans/backlog.md` |

모든 기획물 머리:

```yaml
---
intent: INT-7
kind: screen-plan             # requirements-doc | screen-plan | design-plan | backlog
status: draft
generatedWith: skill:service-planning-agent   # 또는 template:plans/screens
generatedBy: claude
updated: 2026-11-23
---
```

`requirements-doc.md`는 `intent.md`를 사람이 읽는 순서로 다시 놓은 문서다. 내용 원본은 `intent.md`이고, `requirements-doc.md`의 스토리·AC 표는 `<!-- FROM-INTENT:BEGIN -->` 구간에 생성한다. 구간 밖(배경·용어집)만 사람이 쓴다.

와이어프레임 HTML 규칙(DS-R16):

- 파일 하나, 200 KB 이하, 외부 `src`·`href`·`@import`·`fetch` 0건. 머리에 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'">`.
- 화면 상태를 `<section data-state="default|empty|loading|error">`로 나누고 상단 탭으로 바꾼다.
- 요소마다 `data-el="<요소 ID>"`를 달아 `screens/index.md`의 요소 표와 잇는다.
- 검사: `scripts/harness/wireframe_check.py`(크기 · 외부 참조 · 네 상태 존재 · `data-el`이 index 표에 있는지).

`backlog.md` 생성 구간:

```markdown
<!-- BACKLOG:BEGIN — /hx-backlog 또는 scripts/board.sh 가 생성한다. 손으로 고치지 않는다 -->
| 순서 | Unit | 종류 | 이슈 | 단계 | 의존 | 맡은 하네스 |
|---|---|---|---|---|---|---|
| 1 | U-1 결제 API·이벤트 계약 | contract | HDRV3D-11 | design 승인 | — | claude |
| 2 | U-2 결제수단 교체 | feature | HDRV3D-12 | requirements | U-1 | claude |
| 2 | U-3 정산 알림 | feature | — | 백로그 | U-1 | — |
<!-- BACKLOG:END -->
```

단계 열은 06 §3.3의 `stage` 계산을 Python으로 같은 규칙으로 구현한 `sdd_gates.py stage`를 쓴다(DS-R17). 우선순위·메모 열은 구간 밖 표에 사람이 둔다.

기획물 명령 공통 절차:

```text
/hx-screen-plan INT-7   (/hx-design-plan · /hx-backlog 같은 틀)
1. intent 게이트 승인 확인(없으면 멈춤. flow.gates에 intent가 없으면 건너뜀)
2. 07 resolve(command, 현재 하네스) → 스킬 또는 템플릿
3. 스킬이면: 그 스킬을 부르며 입력을 준다
     입력: intent.md 경로, units.json 경로, 출력 경로, 템플릿 경로(필수 제목 목록), 문체 규칙 경로
   템플릿이면: 템플릿을 복사하고 intent.md·units.json에서 채운다
4. 필수 제목 검사(DS-R15), 와이어프레임 검사
5. 머리 generatedWith 기록, status: draft
6. 모든 기획물이 draft 이상이면 "plans 게이트 승인 대기"를 출력
```

`/hx-backlog`는 스킬 칸(`design.backlog`)이 있어도 생성 구간은 킷 스크립트로만 만든다. 스킬은 구간 밖 설명 문단에만 쓴다.

### 3.9 역할과 승인자

- 설계 세션의 하네스는 `roles.design.harness`다(D7 추천값 claude). 역할 원본 `.agents/roles/designer.md`(새로)는 질문 형식(§3.3), 분해 기준(§3.4), 기획물 규칙(§3.8)을 지시하고, 03의 역할 생성기가 하네스별 역할 파일을 만든다.
- 세션 시작 훅은 `role: design` 세션에 "Intent 폴더만 쓴다. 승인·답 줄은 쓰지 않는다"를 알린다. 현재 하네스가 `roles.design.harness`와 다르면 경고만 하고 막지 않는다(DS-R19).
- 승인자: `intent` · `plans`는 `approvers.intent` · `approvers.plans`(기본 `po`). 질문의 `답할 직무`도 같은 `groups` 이름을 쓴다. 한 사람이 여러 그룹에 있어도 된다(05 #roles).
- 승인자 목록의 원본은 `harness-kit.json` 하나다. 문서 머리에 승인자를 따로 적지 않는다.

### 3.10 AI-DLC를 켠 경우

`flow.design = "aidlc"`이면 Intent 폴더는 다음과 같다.

```text
.agents/docs/intents/INT-7-payment-revamp/
├── intent.json        AI-DLC 산출물 위치 링크(킷이 쓴다)
├── units.json         어댑터 출력(10 §3.2), 형식은 §3.5와 같다
├── approvals.md       AI-DLC 사람 승인 가져오기 + plans 게이트
└── plans/             킷 기획물(두 경우 같다)
```

```json
{
  "schema": "harness-kit.intent-link/v1",
  "key": "INT-7",
  "title": "결제 개편",
  "source": "aidlc",
  "aidlc": {
    "space": "main",
    "intent": "261123-payment-revamp",
    "path": "aidlc/spaces/main/intents/261123-payment-revamp/",
    "version": "2.11.0"
  },
  "adapter": { "name": "harness-kit/aidlc", "version": "2.4.0", "inputSha256": "b71e…", "adaptedAt": "2026-11-23T15:00:00+09:00" }
}
```

- `units.json`의 `source`는 `{"kind":"aidlc", "path": …, "inputSha256": …}`다. Unit마다 AI-DLC 쪽 식별자를 `sourceId`로 더 둔다(다시 가져올 때 `issue` 연결을 지키는 열쇠).
- 질문·스토리·Unit 분해는 AI-DLC가 터미널에서 사람 입력으로 받는다. AI-DLC는 승인 입력을 사람이 실제로 했는지 훅으로 확인하므로, 킷은 그 승인을 `intent` 게이트 승인으로 인정한다(README §3, 결정 2026-11-23). 어댑터가 AI-DLC 승인 기록(누가·언제·문구)을 `intents/<INT>/approvals.md`로 옮겨 적고 출처를 `source: aidlc`로 남긴다(10 §3.2). 사람이 두 번 승인하지 않는다. AI-DLC 기록에 승인자가 없으면 옮기지 않고, 그 게이트는 관리 페이지·`harness-kit approve`·Jira 사람 전이로 승인한다.
- `/hx-intent`는 `flow.design = "aidlc"`에서 "설계 단계는 /aidlc가 맡는다. 끝나면 `npx harness-kit sync aidlc`"를 출력하고 끝낸다(DS-R18).
- 기획물 명령, `/hx-specify --from-unit`, 게이트 검사, 대시보드는 `intent.md` 대신 `intent.json`이 가리키는 AI-DLC 문서를 입력으로 읽는다. 명령과 출력 형식은 같다.

### 3.11 요구사항 접수(텍스트·첨부)

요구사항은 텍스트와 첨부 파일로 받는다. 받는 곳은 넷이다.
- 관리 페이지 "새 요구사항"(화면 S11, API는 06 §3.8.1)
- 세션에서 `/hx-intent --new <파일…>`
- Jira 에픽(`jira-workflow` 모듈)과 Notion 페이지·데이터베이스 항목(`notion` 모듈). 둘 다 같은 "접수 출처" 방식으로 가져온다(10 §3.6). 콘솔은 `npx harness-kit intake --from jira:HDRV3D-40` 또는 `--from notion:<페이지 URL>`, 세션은 `/hx-intent --new notion:<URL>`, 화면은 S11의 "가져오기" 탭이다.
- 운영 기록(`source.type: ops`). 다음 Intent 후보는 `intake --from ops:<기록>#NX-<n>`, 장애는 `intake --kind bug --from ops:<기록>#INC-<n>`. 화면은 S10의 "요구사항으로"가 S11을 채워 연다(14 §3.8 · §3.9).

종류는 다섯이다.
- `product`: 신규 프로젝트, 처음부터 만든다. §3.12를 따른다.
- `feature`: 기존 코드에 더하는 신규 기능. §3.13 역공학을 먼저 한다.
- `change`: 기존 기능 변경. §3.13 역공학을 먼저 한다.
- `refactor`: 동작을 바꾸지 않는 구조 변경. §3.13 역공학을 먼저 하고 §3.15의 `refactor` 프로필을 쓴다.
- `bug`: Intent를 만들지 않고 이슈(Unit) 하나로 바로 간다. 재현 로그·화면 캡처를 이슈 폴더 `attachments/`에 둔다.

```text
intents/<INT>-<이름>/
├── intake.md              받은 원문 그대로: 제목, 종류, 본문, 링크, 첨부 목록, 접수자(git user), 시각
└── attachments/
    ├── 01-기획서.pdf       원본
    ├── 01-기획서.md        텍스트 추출본(에이전트가 먼저 읽는 것)
    ├── 02-메인화면.png
    ├── 02-메인화면.md      이미지 설명(기본으로 만들지 않는다. 아래 표)
    └── attachments.json   파일별 종류·크기·sha256·추출 방법·외부 링크
```

| 형식 | 처리 |
|---|---|
| 이미지(png · jpg · webp) | 원본을 그대로 둔다. Claude·Codex는 이미지를 직접 읽는다. 설명 md는 기본으로 만들지 않는다(README 원칙 10). 이미지를 직접 못 읽는 하네스가 그 Intent를 맡거나 사람이 요청할 때만 그 세션이 만든다 |
| PDF | 텍스트 추출본(md)을 만든다. Claude는 원본 PDF도 읽는다 |
| hwp · hwpx | 이 컴퓨터에 `hwp`·`rhwp` 스킬이 있으면 그것으로 추출한다. 없으면 attachments.json에 "추출 못 함"으로 적는다 |
| docx · pptx | 설치된 변환기(pandoc 등)가 있으면 추출한다 |
| xlsx · csv | 시트마다 md 표로 바꾼다 |
| md · txt · yaml · json(API 명세 등) | 그대로 둔다 |
| Figma · 웹 링크 | attachments.json에 링크로 적는다. Figma MCP가 연결돼 있으면 설계 세션이 가져온다 |

- 제한(제안값): 파일 하나 20MB, 접수 하나 합계 100MB. 넘으면 링크로 받거나 git LFS를 쓰라고 안내한다.
- 텍스트 첨부와 추출본은 gitleaks로 검사하고, 비밀값이 나오면 저장하지 않는다. 주민등록번호·전화번호 패턴이 나오면 커밋 전에 경고한다.
- 커밋 범위: `intake.md`·`attachments.json`·추출본은 커밋한다. 원본 바이너리는 `.gitattributes`에 LFS 규칙이 있으면 LFS로 올린다. `intake.storeBinaries: false`면 원본을 `.agents/state/attachments/`에만 두고 링크를 남긴다.
- 접수가 끝나면 관리 페이지가 설계 역할 세션에 "INT-8 접수됨. `/hx-intent INT-8`"을 요청하거나(06 §3.10), 사람이 세션에서 직접 부른다.
- `/hx-intent`는 `intake.md`와 추출본을 먼저 읽고 질문 파일을 만든다. 스토리·질문에는 근거가 된 첨부 위치를 적는다(예: `attachments/01-기획서.pdf p.3`).
- AI-DLC를 켠 경우 `intake.md` 경로를 AI-DLC의 첫 요청으로 넘긴다.

### 3.12 처음부터 시작(product)

빈 폴더나 새 리포에서는 이 순서로 간다.

1. 세션에서 `hx-bootstrap` 스킬에 기획서를 넘긴다(`--from-intake <파일…>`). 스킬이 기획서를 읽고 스택·아키텍처 변형 후보와 이유를 내면, 사람이 고른다. 그다음 스킬이 `npx harness-kit init --stack … --arch …`를 부른다. CLI 혼자서는 기획서를 해석하지 않고 질문만 한다.
2. 첫 Intent를 `product` 종류로 접수하고 기획서·화면·디자인을 첨부한다.
3. `/hx-intent`가 Unit을 나누고 맨 앞에 **걷는 뼈대 Unit**을 둔다. 걷는 뼈대는 기능 없이 빌드·테스트·`verify.sh`·CI·배포 파이프라인만 도는 최소 앱이다. 이 Unit이 끝나야 다른 Unit의 Bolt가 검증을 돌릴 수 있다.
4. 그다음 계약 Unit(API·이벤트·DB 스키마)을 두고, 기능 Unit은 의존 순서대로 둔다.
5. init 때 고른 아키텍처 변형이 Intent 분석과 맞지 않으면 design 단계에서 ADR로 바꾼다. 전환 절차는 각 변형의 `ARCHITECTURE.md`에 있다.
6. Unit이 15개를 넘으면(제안값) Intent를 1차 출시 범위와 나머지로 나눈다.

기존 코드에 더하는 경우(`feature` · `change` · `refactor`)는 §3.13을 따른다.

### 3.13 기존 코드에서 시작(역공학)

`feature` · `change` · `refactor` 접수는 스토리를 쓰기 전에 현재 코드를 문서로 올리고, 사람이 그 문서를 확인한 뒤에 진행한다(DS-R20 · DS-R21). 파일은 둘이다.

| 파일 | 담는 것 | 쓰는 쪽 | 수명 |
|---|---|---|---|
| `.agents/docs/codebase/<영역>.md` | 영역(`area`) 하나의 모델: 모듈 · 의존 · 데이터 모델 · 핵심 흐름 · 알려진 제약 | 정적 행은 `scripts/harness/codebase_scan.py`, 추정 행은 설계 세션 | 리포에 영역마다 하나. Intent끼리 같이 쓰고 오래되면 갱신한다 |
| `intents/<INT>/current-state.md` | 이 Intent가 바꿀 범위의 현재 동작과 바뀌면 안 되는 동작 | 설계 세션 | Intent 하나 |

codebase 모델(템플릿 원본 `_spec-templates/codebase/_template.md`, 새로):

```markdown
---
kind: codebase-model
area: payment
paths: ["src/payment/**", "src/billing/PaymentAdapter.kt"]
baseSha: 4c1d9e0                 # 만들거나 갱신한 base 커밋
scanner: { name: codebase_scan.py, version: 1, stack: jvm, missing: [] }
updated: 2026-11-23
---

# 코드 모델 — payment

## 1. 모듈
| ID | 모듈 | 경로 | 책임 | 출처 |
|---|---|---|---|---|
| M-1 | payment-api | src/payment/api/ | 결제 요청 접수 · 입력 검증 | static:gradle-settings |
| M-2 | payment-core | src/payment/core/ | 결제 상태 전이 | inferred · PaymentService.kt:40 |

## 2. 의존
| 출발 | 도착 | 종류(import · 호출 · 이벤트 · DB) | 출처 |
|---|---|---|---|
| M-1 | M-2 | import | static:jdeps |
| M-2 | billing | 이벤트 payment.completed | inferred · PaymentEvents.kt:12 |

## 3. 데이터 모델
| 테이블 · 엔티티 | 키 | 주인 모듈 | 출처 |
|---|---|---|---|
| payment.payments | id | M-2 | static:flyway V12__payments.sql |

## 4. 핵심 흐름
### F-1 카드 결제 승인 · 출처: inferred · 근거: PaymentController.kt:30, PgClient.kt:55
(시퀀스 다이어그램. 예외 경로 포함)

## 5. 알려진 제약 · 관행
| ID | 내용 | 종류(유지 규칙 · 관행 · 기술 부채) | 출처 |
|---|---|---|---|
| C-1 | 환불은 결제 후 180일까지만 받는다 | 유지 규칙 | confirmed:Q-3 |
| C-2 | 도메인 오류는 PaymentException 하위로 던진다 | 관행 | inferred · 23곳(대표 PaymentService.kt:61) |

## 6. 모르는 것
- PG 응답 타임아웃 값의 출처(설정 파일에 없다)
```

출처 칸(DS-R22):

| 값 | 뜻 | 갱신 |
|---|---|---|
| `static:<도구>` | 도구 출력에서 나온 행 | `codebase_scan.py`가 다시 만든다. 사람 · 에이전트가 고치지 않는다 |
| `inferred · <파일:줄>` | 설계 세션이 코드를 읽고 쓴 행 | 근거 파일이 바뀌면 다시 읽는다 |
| `confirmed:Q-<n>` | 사람이 질문 답으로 확인한 행 | 근거 파일이 바뀌면 `inferred`로 돌아간다 |

`codebase_scan.py <영역> --paths …`는 그 컴퓨터에 깔린 도구만 쓴다. 없는 도구는 머리 `scanner.missing`에 적고 그 표는 추정 행만 남는다.

| 스택 | 모듈 | 의존 | 데이터 모델 | API |
|---|---|---|---|---|
| jvm | `settings.gradle` · `pom.xml` 모듈 | jdeps, 없으면 import 줄 | Flyway · Liquibase 파일, `@Entity` | OpenAPI 파일, `@*Mapping` |
| python | `pyproject.toml` 패키지 | `ast` import | Alembic, SQLAlchemy 모델 | OpenAPI 파일, 라우트 데코레이터 |
| web · electron | `package.json` workspaces | import 문 | Prisma 스키마 | OpenAPI 파일, 라우트 파일 |
| go | `go.mod` · 패키지 | `go list -deps -json` | 마이그레이션 폴더 | OpenAPI 파일 |

`current-state.md`:

```markdown
---
intent: INT-8
kind: current-state
status: draft
headSha: 4c1d9e0
models:
  - { path: .agents/docs/codebase/payment.md, sha256: "…", baseSha: 4c1d9e0 }
---

# 현재 상태 — INT-8 결제수단 추가

## 1. 바뀔 범위
| 모듈 | 파일 · 경로 | 이유(접수 근거) |

## 2. 현재 동작
| ID | 동작 | 근거(모델 행 · 파일:줄) |
| CS-1 | 카드 결제만 받는다 | M-2 · PaymentService.kt:52 |

## 3. 바뀌면 안 되는 동작
| ID | 동작 | 근거 | 지금 있는 시험 |
| KEEP-1 | 환불은 결제 후 180일까지만 받는다 | C-1 | RefundPolicyTest |

## 4. 시험 기준선
`verify.sh --affected` · head 4c1d9e0 · 통과 412 · 실패 0 · verify-last.json 2026-11-23T10:02:11+09:00

## 5. 모르는 것
(questions.md Q 번호)
```

질문으로 잇는 규칙(질문 형식은 §3.3, 한 회차 5개):

| 모델 · current-state의 행 | 질문 | 분류 · 답할 직무 · 막는 게이트 |
|---|---|---|
| §1 바뀔 범위에 든 모듈의 `inferred` 행 | "X를 Y로 읽었다(근거). 맞는가" A 맞다 · B 다르다(메모에 실제 동작) | 기술 · dev · codebase |
| §5 `유지 규칙` · `관행` 행 | "유지하는가" A 유지(→ `KEEP-n`) · B 이번에 바꾼다(→ 스토리 후보) · C 규칙으로 올린다(→ 규칙 후보, 14 §3.11) | 범위 · po(유지 규칙), dev(관행) · codebase |
| §6 모르는 것 | 그대로 질문 | 기술 · dev · codebase |

- 5개를 넘으면 바뀔 범위에서 의존(§2)이 많은 모듈의 행부터 낸다.
- 답이 오면 설계 세션이 모델 행을 고치고 출처를 `confirmed:Q-<n>`으로 바꾼다.
- `codebase` 승인 뒤의 스토리 · 질문은 `CS-n` · `KEEP-n`을 근거로 단다. `KEEP-n`은 `/hx-specify --from-unit`이 requirements로 옮기고(§3.7), `/hx-analyze`가 시험 연결을 본다(§3.16).

게이트는 §3.6 표의 `codebase`다. 사람은 `current-state.md`와 그것이 가리키는 모델을 함께 승인하고, 승인 기록에 각 파일의 sha가 남는다(06 §3.7).

오래됨 검사(DS-R23):

```text
stale(model):
  if model.baseSha 가 base HEAD 의 조상이 아니다: return 오래됨("기준 커밋 없음")
  lines = git diff --numstat <baseSha>..<base HEAD> -- <paths> 의 추가 + 삭제 합
  files = git diff --name-status <baseSha>..<base HEAD> -- <paths> 중 A · D · R 수
  if lines > codebase.staleLines(기본 200) or files >= codebase.staleFiles(기본 3): return 오래됨(lines, files)
  return 최신
```

- `verify.sh fast`가 바뀐 Intent 폴더와 `codebase/`에 이것을 부르고 경고만 한다.
- `/hx-intent`의 역공학 단계는 오래된 모델을 먼저 갱신한다. `codebase_scan.py`로 정적 행을 다시 만들고, 근거 파일이 바뀐 `inferred` · `confirmed` 행을 다시 읽어 `inferred`로 둔다. `baseSha`를 base HEAD로 올린다.
- 승인 API는 승인 시점에 다시 계산하고, 오래됐으면 422 `model_stale`이다.
- 승인 뒤 모델이 오래돼도 승인은 유지된다(파일 sha가 그대로다). 진행 보드가 "모델 오래됨"을 보인다.

### 3.14 몹 정리(Mob Elaboration)

결정할 사람들이 같은 시간에 한 화면(S04 질문 화면)을 보며 질문 파일에 답하는 회의다. 파일 방식(§3.3)은 그대로이고, 회의 규칙과 기록만 더한다. 규칙 원본은 `.agents/rules/mob-elaboration.md`(새로)다.

| 항목 | 규칙 |
|---|---|
| 진행자 | 1명. S04를 띄운 컴퓨터의 git 사용자다. 답을 대신 고르지 않고, 누가 답했는지 고른다 |
| 참석자 | 열린 질문의 `답할 직무` 그룹마다 1명 이상, 그리고 `approvers.intent` 그룹 1명 이상. 빠진 그룹이 있으면 `mob start`가 그룹 이름을 출력하고 거부한다 |
| 시간 상자 | 질문 회차 하나 30분(제안값, `timeboxMin`). 전체 순서는 아래 표(합계 3시간 15분) |
| 질문 수 | 회차당 5개(DS-R3) |
| 답 반영 | 진행자가 회차를 닫으면(`mob next`) 설계 세션에 `answers-ready`가 간다(06 §3.8). 설계 세션이 다음 회차를 쓰면 S04가 파일을 다시 읽어 보인다 |
| 미룬 결정 | 시간 상자 안에 답이 안 난 질문은 §11 정해야 할 것으로 옮기고 주인(git `user.email`)과 기한을 적는다. 막는 게이트는 계속 막는다 |
| 승인 | 회의에서 한 말은 승인이 아니다. 승인자는 자기 컴퓨터의 관리 페이지 · `harness-kit approve` · Jira 사람 전이로 승인한다(README §3) |
| 혼자 일할 때 | 참석자 1명. 시간 상자는 그대로 둔다 |

순서(AI-DLC 핸드북 05의 시간 배분을 출발점으로 쓴다):

| 단계 | 하는 일 | 시간 | 남는 것 |
|---|---|---|---|
| 준비 | PO가 접수하고, 개발자가 codebase 모델을 확인한다(§3.13) | 전날 | `intake.md` · `current-state.md` |
| 1 | 범위 · 보안 질문부터 답한다 | 30분 | 답 |
| 2 | 스토리 · EARS · NFR · 위험 초안을 고친다 | 60분 | `intent.md` §5~§8 |
| 3 | Unit 분해와 의존 순서를 조정한다 | 45분 | `units.json` · §12 |
| 4 | Unit이 둘 이상이면 계약 초안(오류 코드 · 데이터 주인)을 본다 | 45분 | 계약 Unit 메모 |
| 5 | 남은 질문의 주인 · 기한을 정하고 승인을 요청한다 | 15분 | §11, 승인 대기 |

`questions.md` 머리:

```yaml
session:                          # mob start 가 쓰고 mob end 가 닫는다. 에이전트는 쓰지 않는다
  at: 2026-11-24T10:00:00+09:00
  facilitator: park@example.com
  attendees:
    - { email: lee@example.com, group: po }
    - { email: kim@example.com, group: dev }
  timeboxMin: 30
  rounds: [ { round: 1, startedAt: "2026-11-24T10:00:00+09:00", endedAt: "2026-11-24T10:28:00+09:00" } ]
  closedAt: null
```

답 기록(DS-R24): 세션이 열려 있으면 답 API(06 §3.8)는 `by`(참석자 email)를 받고, 그룹 검사는 `by`의 그룹으로 한다. 참석자 밖 email이면 400이다.

```markdown
- 답: A · lee@example.com · 2026-11-24T10:12:40+09:00 · 기록: park@example.com
```

- `기록`은 그 컴퓨터의 git 사용자다. 답한 사람과 같으면 생략한다. 대신 적기는 답에만 쓴다. 승인은 승인자 본인의 git 사용자로만 기록된다(06 DB-R11).
- 명령: `npx harness-kit mob start <INT> --attendees <email…> [--timebox 30]` · `mob next` · `mob end`. S04에 같은 버튼을 둔다.
- 회차 `endedAt − startedAt`가 `timeboxMin`을 넘은 회차 수를 S04가 보인다. 막지는 않는다.
- 회의가 형식만 남았다는 신호 두 가지를 S04가 경고로 보인다. §11로 미룬 결정이 한 세션에 4건 이상, 한 회차의 답이 모두 권장안과 같고 메모 · 의견이 0건.

### 3.15 일의 크기와 위험

프로필은 만드는 산출물과 문서 분량을 정하고, 위험 등급은 승인 깊이를 정한다. 하한 네 게이트(requirements · design · mr · done)는 이슈가 있는 모든 프로필에 있고, 위험이 낮아도 빠지지 않는다(04 §3.8). 하한 밖 게이트는 산출물을 따라간다. 프로필이 만드는 산출물의 게이트만 있고(`flow.gates`에 있을 때), 만든 산출물의 게이트를 끄는 설정은 없다.

| 프로필 | 고르는 조건 | 산출물 | 하한 밖 게이트 | 문서 분량 |
|---|---|---|---|---|
| `trivial` | 바뀐 줄 20 이하, 새 · 지운 파일 0, lock 파일 변경 0, `risk.highPaths` 해당 0 | 이슈 없음. `chore/<이름>` 브랜치와 MR | 없음(MR 플랫폼 승인) | — |
| `bug` | 접수 종류 `bug` | 이슈 1 | tasks · deploy | requirements: 재현 · 현재 · 기대 · 바뀌면 안 되는 동작. design: 원인 · 수정 · 회귀 시험. §4.5 · §6 · §7.2는 "해당 없음: <이유>" |
| `unit` | `feature` · `change`이고 §3.4 네 기준 모두 미만 | Intent(§1 · §2 · §6 · §12), current-state, 이슈 1 | codebase · intent · tasks · deploy | 기획물 없음 |
| `feature` | `feature` · `change`이고 네 기준 중 하나 이상 | 전부 | codebase · intent · plans · tasks · deploy | 전부 |
| `product` | 접수 종류 `product` | 전부 + 걷는 뼈대 Unit(§3.12) | intent · plans · tasks · deploy | 전부 |
| `refactor` | 접수 종류 `refactor` | Intent(§1 · §2), current-state, 이슈 | codebase · intent · tasks | requirements: `KEEP-n`과 특성 시험. design: 목표 구조 ADR(§14). tasks 첫 Phase: 특성 시험 |

- 기본 프로필은 접수 종류가 정한다. `feature` · `change`는 분해 판정(§3.4) 뒤 `unit` 또는 `feature`다.
- 설계 세션은 수치(분해 네 기준 값, `risk.highPaths`에 걸리는 파일 수, 바뀔 모듈 수)와 함께 `profile`을 `intent.md` 머리에 쓴다. 기본과 다르면 범위 질문(답할 직무 po, 막는 게이트 intent)을 낸다(DS-R25). 프로필은 `intent` 승인 때 사람이 확정한다.
- `trivial`은 기계가 판정한다. MR 브랜치 이름에 이슈 키가 없으면 `verify.sh --affected`의 `sdd_gates.py check-trivial`이 위 조건을 보고, 하나라도 넘으면 "이슈가 필요하다: 바뀐 줄 57 > 20"으로 실패한다. 01 §3.7.8의 "형식이 아니면 경고만"은 pre-push에만 남는다.

위험 등급:

| 위험 | 해당하는 변경 | 승인 깊이 |
|---|---|---|
| `low` | 내부 리팩터링 · 시험 추가 · 문서 · 화면 문구 | 게이트마다 승인자 1명 |
| `medium` | 새 API · 새 화면 · 되돌릴 수 있는 스키마 추가 | 승인자 1명. design §17의 "사람이 볼 곳" 줄(§3.16)을 채워야 design 승인이 된다 |
| `high` | 권한 · 인증 · 결제 · 개인정보 · 되돌릴 수 없는 마이그레이션 · 동시성 · 외부 공개 API 중 하나, 또는 diff가 `risk.highPaths`에 걸린다 | design · mr · deploy에 서로 다른 승인자 2명(DS-R26, `risk.highApprovals`). 롤백 시험 면제 불가(14 §3.4). `trivial` 불가 |

- `risk`는 Intent와 이슈 머리에 둔다. 설계 세션이 위 표로 제안하고, requirements 승인 때 사람이 확정한다. 이슈는 Intent 값보다 올릴 수만 있다.
- 기계 하한: `mr` 게이트 판정 때 diff가 `risk.highPaths`(`harness-kit.json`)에 걸리면 머리 값과 상관없이 `high`로 본다.
- `risk.highApprovals`(기본 2)와 `risk.highPaths`는 프로젝트가 엄하게만 바꾼다. 개인 층은 무시한다.

### 3.16 도메인 설계

두 층에 둔다. Intent에는 경계 컨텍스트와 Unit의 대응(§3.2 §12 도메인 지도), 이슈 design에는 그 Unit의 도메인 모델(§4.5)이다.

도메인 지도 규칙:

- 분해(§3.4) 1단계의 도메인 묶음은 §12의 경계 컨텍스트다. 2단계 계약 찾기는 "받는 계약"이 있는 행에서 시작한다.
- 데이터 주인은 컨텍스트 하나다. 두 행이 같은 애그리거트 후보를 가지면 `intent_check.py`가 실패한다.
- 컨텍스트 이름은 비즈니스 용어로 쓰고 requirements `area:`와 같은 값을 쓴다.

design 템플릿 바꿀 곳(`packages/templates/common/agents-docs/_spec-templates/design/_template.md`): `### 4.4 상태 전이` 뒤에 `### 4.5 도메인 모델`을 더한다. §4의 하위 절로 두는 이유는 §5~§17 번호를 밀지 않기 위해서다(§6 · §13 · §17을 다른 문서가 번호로 가리킨다).

```markdown
### 4.5 도메인 모델 (비즈니스 규칙이 있을 때 · 필수. 없으면 "해당 없음: <이유>")

> 불변식을 먼저 적고, 한 트랜잭션 안에서 함께 지켜야 하는 불변식 묶음으로 애그리거트 경계를 정한다.
> 인프라 이름(테이블 · 프레임워크)은 쓰지 않는다. 그것은 §7 Data Models에 쓴다.

#### 불변식
| ID | 불변식(언제나 참) | 근거 | 지키는 곳 | 시험 |
|---|---|---|---|---|
| INV-1 | 같은 회의실의 예약 시간은 겹치지 않는다 | R1.2 · NFR-2 | Reservation + 저장소 제약(ADR-002) | P1 · T014 |

#### 요소
| 종류 | 이름 | 책임 | 지키는 불변식 | 경계 밖 참조 |
|---|---|---|---|---|
| 애그리거트 | Reservation | 생성 · 취소 · 시간 규칙 | INV-1 · INV-2 | RoomId(U-1)를 ID로만 |
| 엔티티 | | | | |
| 값 객체 | TimeSlot | 반열린 구간 [start, end), overlaps() | INV-1 | — |
| 도메인 이벤트 | ReservationCreated | 상태가 바뀐 뒤 발행 | — | event:reservation.created(소비 U-3) |
| 리포지토리 | ReservationRepository | findOverlapping(roomId, slot) · save | INV-1 | — |
| 정책 | CancellationPolicy | 취소 마감 계산(Intent에서 정한 값) | INV-3 | — |

#### 엣지 케이스 질문
| ID | 질문 | 답 · 출처 | 반영 |
|---|---|---|---|
| EQ-1 | 이미 시작한 예약을 취소하면? | 거부 · Q-4 답 A | INV-3 · R2.3 |
```

설계 세션 순서(역할 원본 `designer.md`와 `/hx-plan` 지침에 넣는다):

1. 불변식부터 적는다. Unit 스토리의 EARS · NFR · Intent 결정(§11) · `KEEP-n`에서 "언제나 참이어야 하는 것"을 `INV-<n>`으로 적는다. 근거가 없는 불변식은 쓰지 않고 질문으로 낸다.
2. 함께 지켜야 하는 불변식 묶음마다 애그리거트 하나를 둔다.
3. 엔티티 · 값 객체 · 도메인 이벤트 · 리포지토리 · 정책을 요소 표에 적는다. 다른 컨텍스트의 것은 ID로만 참조하고 "경계 밖 참조"에 계약(`api:` · `event:`)을 적는다.
4. 엣지 케이스 질문을 애그리거트마다 낸다. 다섯 갈래(경계 시각 · 시간대, 상태가 바뀌는 중의 다른 요청, 남의 자원 ID, 없거나 지워진 참조, 끝난 · 취소된 상태의 요청)에서 하나 이상씩. 문서로 답할 수 없으면 이슈 `questions.md`에 낸다(분류 범위 또는 기술, 답할 직무 po 또는 dev, 막는 게이트 design).
5. 불변식마다 시험을 잇는다. design §12 속성(`P<n>`) 또는 §11 시나리오, 그리고 tasks의 시험 작업(`T### … INV-1`).

- 비즈니스 규칙이 없는 Unit(설정 · 어댑터 · 조회만)은 "해당 없음: <이유>" 한 줄이다. 계약 Unit은 값 객체 · 도메인 이벤트만 적는다.
- design §17 승인 체크리스트에 더할 줄: "불변식이 목록으로 있고 각각 근거와 시험이 있는가", "규칙이 애그리거트 · 정책 안에 있고 경계 · 이름이 비즈니스 용어와 맞는가", "엣지 케이스 질문에 모두 답했는가", "(risk medium 이상) 사람이 볼 곳 — 동시성 · 권한 · 실패 경로 · 데이터 변경의 위치가 적혀 있는가".

`/hx-analyze` 점검(DS-R28). `hx-analyze/SKILL.md` 2단계 탐지 목록에 "불변식 시험 누락" 유형을 더한다.

| 검사 | 실패 조건 | 심각도 |
|---|---|---|
| INV → 시험 | design §4.5의 `INV-n`이 §12 속성 · §11 시나리오 어디에도 없거나, tasks에 `INV-n`을 단 시험 작업이 없다 | HIGH |
| KEEP → 시험 | requirements의 `KEEP-n`을 단 시험 작업이 tasks에 없다 | HIGH |
| 근거 없는 불변식 | `INV-n`의 근거 칸이 비었거나 없는 ID를 가리킨다 | MEDIUM |
| 답 없는 엣지 질문 | 엣지 케이스 표의 `답 · 출처` 칸이 비었다 | HIGH(미해결 마커와 같다) |

### 3.17 오류

| 상황 | 동작 |
|---|---|
| Intent 키 충돌(두 브랜치에서 같은 `INT-n`) | `intent_check.py`가 MR 검사에서 잡는다. 늦게 병합하는 쪽이 번호를 바꾼다 |
| 질문 형식 오류(권장 0개·2개, 선택지 1개) | `/hx-analyze`·`verify.sh fast` 실패, 줄 번호 출력 |
| 분해 결과 Unit 10개 초과 | 경고 "Intent를 둘로 나눌지 질문 파일에 올린다"(Q 자동 생성, 답할 직무 po) |
| `units.json`을 사람이 고쳐 `issue`가 없는 키를 가리킴 | `intent_check.py` 실패 |
| 스킬이 필수 제목을 빠뜨림 | 명령 실패, 빠진 제목 목록. 템플릿으로 다시 만들지 사람에게 묻는다 |
| AI-DLC 산출물이 `units.json`보다 새롭다 | `verify.sh fast` 경고 "npx harness-kit sync aidlc" |
| codebase 모델 행에 출처가 없거나 `inferred` 행에 근거 위치가 없다 | `verify.sh fast` 실패, 줄 번호 출력(DS-R22) |
| 참조 모델이 오래된 채 `codebase` 승인 요청 | 422 `model_stale`, 바뀐 줄 · 파일 수 출력 |
| §12에서 두 컨텍스트가 같은 애그리거트 후보를 가진다 | `intent_check.py` 실패 |
| `mob start`의 참석자에 `답할 직무` 그룹이 빠졌다 | 거부, 빠진 그룹 출력 |
| 이슈 키 없는 MR이 `trivial` 조건을 넘는다 | `verify.sh --affected` 실패, 넘은 조건 출력 |

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| Intent 하나에 requirements 하나 | Unit마다 브랜치·MR·승인이 따로라야 한다. 하나로 두면 계약 Unit을 먼저 승인할 수 없다 |
| Unit 폴더를 Intent 폴더 안에 두고 SDD도 거기에 | 이슈 폴더가 둘로 갈린다(01의 이슈 단위 SDD와 충돌). Unit은 이슈 링크만 가진다 |
| `units.json`에 진행 상태 저장 | 이슈 문서와 두 원본이 된다. 보드와 백로그가 서로 다른 값을 보일 수 있다 |
| 모든 기획물을 HTML 원본으로 | 에이전트가 고칠 때 diff가 커서 리뷰하기 어렵다(02 #plans). 와이어프레임만 눌러 봐야 해서 HTML로 둔다 |
| 분해를 모델 판단에만 맡긴다 | 같은 요구사항에서 결과가 달라지고 승인자가 근거를 볼 수 없다. 네 수치 기준을 먼저 적는다 |
| 설계 세션이 권장안으로 답을 채우고 진행 | 대화 방향 역전 원칙(05)에서 고르는 것은 사람이다 |
| 질문을 Jira 코멘트로만 받는다 | Jira 없는 리포가 있고, 문서 원본은 리포다 |
| 질문 파일 첫 절에 "현재 동작" 요약만 둔다(이전 안) | 공유할 자리가 없어 Intent마다 같은 코드를 다시 읽고, 사람이 무엇을 확인했는지 sha로 남지 않는다 |
| 역공학 문서를 Intent 폴더에만 둔다 | 같은 영역을 Intent마다 다시 읽는다. 영역 모델은 리포에 하나 두고 Intent에는 바꿀 범위만 적는다 |
| 몹 정리에서 참석자마다 자기 컴퓨터로 답한다 | 관리 페이지는 그 컴퓨터의 체크아웃만 연다. 같은 `questions.md`를 여러 컴퓨터에서 고치면 push가 충돌한다 |
| 위험이 낮으면 하한 게이트를 건너뛴다 | 하한은 설정으로 낮추지 못한다(04 §3.8). 위험은 승인 깊이만 바꾼다 |
| 도메인 모델을 design의 새 §5로 둔다 | §5~§17 번호가 밀려 다른 문서의 §6 · §13 · §17 참조가 깨진다 |

## 5. 완료 기준

1. AI-DLC·Entire가 없는 임시 리포에서 예시 요구사항(스토리 8개, 도메인 2개) → `intent.md` → 질문 1회차(5개 이하) → 답 → Unit 3개(계약 1개)와 의존 순서 → SDD 이슈 3개가 나오고, 대시보드 진행 탭에 계약 Unit이 먼저 보인다.
2. 분해 fixture 8종(네 기준 각각 경계값 −1 · 기준값): 기준값인 4종만 `split: true`, 나머지는 Unit 1개.
3. 시험: 계약 이슈 design이 `in-review`일 때 소비 Unit의 `/hx-plan` 선행 검사가 exit 1과 계약 이슈 키를 출력한다. approved로 바꾸면 통과한다.
4. 시험: 막는 게이트가 `intent`인 질문에 답이 없으면 intent 승인 API가 422 `gate_precondition`이다.
5. `intent_check.py`가 의존 고리·없는 Unit 참조·두 Unit에 걸친 스토리 fixture에서 각각 실패하고 원인을 출력한다.
6. 기획물 4종이 생기고 대시보드 문서 탭에서 열린다. 디자인 스킬이 깔린 홈과 빈 홈 fixture에서 모두 필수 제목 검사를 통과하고 `generatedWith`가 각각 `skill:…`·`template:…`이다.
7. 와이어프레임 fixture를 대시보드 sandbox iframe으로 열 때 외부 요청 0건(브라우저 네트워크 기록).
8. `backlog.md` 생성 구간의 단계 열이 대시보드 진행 탭과 fixture 20개 이슈에서 같다. `/hx-analyze`가 Intent ↔ 이슈 추적 누락(스토리 1개를 requirements에서 뺀 fixture)을 보고한다.
9. 같은 요구사항을 킷 설계와 AI-DLC 설계(어댑터 fixture)로 돌리면 `units.json`이 `source`·`sourceId`를 빼고 같은 키 집합을 가지며, `/hx-specify --from-unit` 결과의 requirements 절 구성이 같다.
10. 기존 코드 fixture(`change` 접수)에서 `/hx-intent`가 `codebase/<영역>.md`와 `current-state.md`를 만든다. 도구가 낸 행은 출처가 `static:`이고 나머지 행은 근거 위치를 가진다. `codebase` 승인 전에는 다음 단계 판정이 스토리를 쓰지 않는다.
11. 모델 `baseSha` 뒤 `paths`에서 201줄을 바꾼 fixture는 `verify.sh fast` 경고와 승인 API 422 `model_stale`이 나온다. 199줄이면 둘 다 없다.
12. 몹 fixture: 참석자 2명 세션에서 `by`로 다른 참석자를 고른 답 줄에 `기록:`이 붙고, 참석자 밖 email은 400이다.
13. 이슈 키 없는 MR에서 바뀐 줄 20은 통과, 21은 실패한다. `risk: high` 이슈의 design은 승인자 1명이면 게이트 미통과, 두 번째 사람이 승인하면 통과한다.
14. 시험 작업이 없는 `INV-2` fixture에서 `/hx-analyze`가 HIGH "불변식 시험 누락"을 보고한다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| `/hx-clarify`의 기존 질문 방식(대화 안 최대 5개)과 질문 파일 모드를 한 명령에 둘지 | P21 착수 때 기존 `hx-clarify` SKILL.md와 대조해 옵션(`--file`)으로 둘지 정한다 |
| Claude Code에서 같은 세션이 `questions.md`의 `- 답:` 줄만 못 쓰게 막는 훅 판정(Edit 도구 입력의 바뀐 줄 검사)이 Codex·Kiro 도구 입력에서도 되는지 | 세 하네스 PreToolUse 입력 형식을 기록하고 시험한다 |
| 스킬(예: `service-planning-agent`)이 출력 경로·필수 제목 입력을 따르는지 | 대표 스킬 3개로 시험 실행, 필수 제목 통과율을 기록한다 |
| AI-DLC 산출물에 스토리·Unit·의존이 구조로 들어 있는지(어댑터 입력) | 10 §6과 같이 P22 착수 전 AI-DLC 실제 산출물로 확인한다 |
| Jira 에픽 키를 Intent 키로 쓸 때 `INT-n`과 섞인 리포의 정렬·표시 | jira 모듈 fixture에서 대시보드 목록 정렬을 본다 |
| codebase 모델과 AI-DLC v2 `codekb/<repo>/`가 겹친다 | 10 §6 첫 항목(AI-DLC 실제 산출물 확인) 때 어댑터가 `codekb/`를 모델의 `inferred` 행 근거로 링크할 수 있는지 본다 |
| 스택별 정적 도구(jdeps 등)가 개발자 컴퓨터 · CI 이미지에 있는지 | knots · hdr에서 `codebase_scan.py --dry-run`을 돌려 `scanner.missing`을 본다 |
| `codebase.staleLines` 200 · `staleFiles` 3이 맞는지 | knots 90일 기록에서 영역별 주간 변경 줄 수를 보고 정한다 |
