"""대본 에이전트의 출력(설계 11 §3.4) — 실제 모델을 부르지 않고, 설계 세션 · 구현 세션이 쓸 파일을 정해진 내용으로 쓴다.

이 시험이 보는 것은 킷 장치(형식 · 게이트 · 어댑터 · 훅 · 대시보드 API · verify)이고 모델 출력 품질이 아니다.
"""

from __future__ import annotations

import json

DOMAINS = {1: "orders", 2: "orders", 3: "orders", 4: "billing", 5: "billing", 6: "billing"}
STORY_TITLES = {
    1: "주문 만들기", 2: "주문 합계 확인", 3: "주문 취소",
    4: "주문 결제", 5: "결제 영수증 보기", 6: "실패한 결제 다시 시도",
}
UNIT_AREAS = {"U-1": "orders", "U-2": "billing"}
UNIT_STORIES = {"U-1": ["S-1", "S-2", "S-3"], "U-2": ["S-4", "S-5", "S-6"]}

INTENT_HEAD = """---
id: {key}
title: 주문 결제 연동
status: in-review
flow: kit
kind: product
profile: product
risk: low
areas: [orders, billing]
jira: null
answersSha256: null
created: 2026-11-24
---

# Intent {key} — 주문 결제 연동

## 1. 목표

구매자가 주문하고 결제하기까지 한 흐름으로 끝낸다. 결제 승인 응답은 3초 안에 낸다.

## 2. 범위 밖

환불 · 정산(다음 Intent).

## 3. 성공 지표

| 지표 | 현재 | 목표 | 재는 곳 |
|---|---|---|---|
| 결제 승인 응답 시간 | 없음 | 3초 이하 | 결제 로그 |

## 4. 제약

결제사는 하나다.

## 5. 사용자 유형

| 유형 | 설명 | 스토리 |
|---|---|---|
| 구매자 | 주문하고 결제한다 | S-1 · S-2 · S-3 · S-4 · S-5 |
| 운영자 | 실패한 결제를 다시 시도한다 | S-6 |

## 6. 스토리와 수용 기준

"""

INTENT_TAIL = """
## 7. NFR

| ID | 항목 | 기준(숫자) | 관련 스토리 |
|---|---|---|---|
| NFR-1 | 결제 승인 응답 | 3초 이하 | S-4 |

## 8. 위험 레지스터

| ID | 위험 | 가능성(상·중·하) | 영향(상·중·하) | 대응 | 담당 직무 |
|---|---|---|---|---|---|
| RISK-1 | 결제사 장애 | 하 | 중 | 재시도 | ops |

## 9. 외부 통합

| 대상 | 방식 | 소유 팀 | 계약 Unit |
|---|---|---|---|
| 결제사(PG) | REST | 외부 | — |

## 10. 분해 판정

| 기준 | 값 | 기준값 | 해당 |
|---|---|---|---|
| 스토리 | 6 | ≥ 5 | 예 |
| 도메인 | 2 | ≥ 2 | 예 |
| 사용자 유형 | 2 | ≥ 3 | 아니오 |
| 외부 통합 | 1 | ≥ 3 | 아니오 |

결론: 나눈다. Unit 2개(units.json).

## 11. 정해야 할 것

없음.

## 12. 도메인 지도

| 경계 컨텍스트 | 데이터 주인(애그리거트 후보) | Unit | 주는 계약 | 받는 계약 |
|---|---|---|---|---|
| orders | 주문 | U-1 | — | — |
| billing | 결제 | U-2 | — | — |
"""


def intent_md(key: str) -> str:
    stories = []
    for n in range(1, 7):
        stories.append(f"### S-{n} {STORY_TITLES[n]}\n- 스토리: 구매자로서 {STORY_TITLES[n]}를 한다.\n- 도메인: {DOMAINS[n]}\n- S-{n}.AC-1: 요청하면 시스템은 {STORY_TITLES[n]}를 처리한다.\n")
    return INTENT_HEAD.format(key=key) + "\n".join(stories) + INTENT_TAIL


QUESTIONS_NONE = "---\ntarget: {key}\nstatus: closed\nround: 1\n---\n\n# 질문 — {key} 주문 결제 연동\n\n(열린 질문 없음)\n"


def questions_md(key: str) -> str:
    return QUESTIONS_NONE.format(key=key)


def unit_row(uid: str, order: int, deps: list[str]) -> dict:
    return {
        "id": uid, "name": {"U-1": "orders-core", "U-2": "billing-core"}[uid], "title": {"U-1": "주문", "U-2": "결제"}[uid], "kind": "feature",
        "area": UNIT_AREAS[uid], "repo": None, "stories": UNIT_STORIES[uid], "nfr": [], "risks": [], "dependsOn": deps,
        "provides": [], "consumes": [], "order": order, "issue": None, "planned": True,
    }


def units_json(key: str) -> str:
    doc = {
        "schema": "knots-sync.units/v1",
        "intent": {"key": key, "title": "주문 결제 연동", "doc": "intent.md"},
        "source": {"kind": "kit"},
        "decomposition": {"stories": 6, "domains": 2, "userTypes": 2, "integrations": 1, "split": True, "reasons": ["stories>=5", "domains>=2"]},
        "units": [unit_row("U-1", 1, []), unit_row("U-2", 2, ["U-1"])],
        "unassigned": [],
    }
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


# ── AI-DLC 산출물(실제 도구 2.11.4 의 단계 정의가 정한 모양 — docs/analysis/05 §1.3) ──

AIDLC_DIR = "aidlc/spaces/default/intents/261124-order-billing"
AIDLC_UG = f"{AIDLC_DIR}/inception/units-generation"


def aidlc_files() -> dict[str, str]:
    stories = "# 스토리\n\n" + "\n".join(f"### US{(n - 1) // 3 + 1}.{(n - 1) % 3 + 1} {STORY_TITLES[n]}\nAs a 구매자...\n" for n in range(1, 7))
    story_map = "# 스토리 맵\n\n| Story | Unit | Directory |\n|---|---|---|\n" + "\n".join(
        f"| US{(n - 1) // 3 + 1}.{(n - 1) % 3 + 1} | {'U1' if n <= 3 else 'U2'} | {'u1-orders' if n <= 3 else 'u2-billing'} |" for n in range(1, 7)) + "\n"
    return {
        f"{AIDLC_DIR}/aidlc-state.md": "# AI-DLC State Tracking\n\n- **Project**: 주문 결제 연동\n- **Scope**: classic\n",
        f"{AIDLC_DIR}/project-description.json": '"주문 결제 연동"\n',
        f"{AIDLC_DIR}/inception/user-stories/stories.md": stories,
        f"{AIDLC_UG}/unit-of-work.md": "# Units\n\n| Unit ID | Directory | Name | Kind |\n|---|---|---|---|\n| U1 | u1-orders | 주문 | service |\n| U2 | u2-billing | 결제 | service |\n",
        f"{AIDLC_UG}/unit-of-work-dependency.md": "# Unit 의존\n\n```yaml\nunits:\n  - name: u1-orders\n    kind: service\n    depends_on: []\n  - name: u2-billing\n    kind: service\n    depends_on: [u1-orders]\n```\n",
        f"{AIDLC_UG}/unit-of-work-story-map.md": story_map,
    }


# ── 이슈 문서 ──

DESIGN_BODY = """## 1. 설계

{area} 도메인의 함수 한 곳을 고친다. 외부 호출은 없다.

## 13. 배포 · 롤백 (Migration / Rollout)

### 13.1 배포 계획 *(필수)*
| 항목 | 값 |
|---|---|
| 순서 | 1 앱 배포 |
| 방식 | 단계적(10% → 100%, 30분 간격) |
| 하위 호환 | 이전 판과 함께 돈다 |
| 마이그레이션 | 없음 |
| 확인 신호 | 스모크: curl /health · 헬스: curl /ready |

### 13.2 롤백 *(필수)*
| 항목 | 값 |
|---|---|
| 방법 | 이전 커밋 재배포 |
| 판단 기준 | 5xx 비율 1% 초과가 5분 이어짐 |
| 데이터 | 그대로 둔다 |
| 시험 | 검증 환경에서 시험한다 |

### 13.3 운영 점검
- [x] 로그: 개인정보 없음
- [ ] 지표: 해당 없음: 새 지표 없음
- [ ] 알람: 해당 없음: 기존 알람
- [ ] SLO: 해당 없음: 없음
- [ ] 런북: 해당 없음: 기존 런북
- [ ] 비밀값: 해당 없음: 없음
- [ ] 환경 차이: 해당 없음: 같다
"""

TASKS_BODY = "### Phase 1: 구현\n\n- [ ] T001 {area} 함수를 고친다\n"
