---
kind: deploy
key: {{KEY}}
env: production                 # deploy.json envs 의 이름
state: planned                  # planned | approved | deploying | succeeded | rolled-back | failed
issues: [{{ISSUES}}]
commit: { base: {{BASE}}, sha: {{SHA}} }
tag: null                       # 릴리스 태그가 있으면 v2.3.0
risk: low                       # 포함 이슈 risk 중 가장 높은 값
created: {{CREATED}}
---

# 배포 — {{KEY}}

<!-- 이 파일은 `python3 scripts/harness/deploy.py plan <키…>` 가 만든다. 손으로 새로 만들지 않는다.
     계획 구간(PLAN:BEGIN ~ PLAN:END)의 sha256 이 deploy 승인 대상이다 — 승인 뒤 이 구간을 고치면 승인은 stale 이다.
     결과 구간(RESULT)은 deploy.py result · run 이 쓴다. 승인 sha 에 들지 않는다. -->

<!-- PLAN:BEGIN — deploy plan 이 만든다. 승인 sha는 이 구간의 sha256이다 -->
## 1. 포함 Unit
| 이슈 | Unit | design §13 sha | 병합 커밋 |
|---|---|---|---|

## 2. 순서

## 3. 확인 신호
| 신호 | 명령 · 링크 | 기준 |
|---|---|---|

## 4. 롤백
- 시험: none

## 5. 배포 점검
| 항목 | 이슈 | 상태 |
|---|---|---|

## 6. 검증
- full: none
- quality-gate: none
<!-- PLAN:END -->

## 7. 결과
<!-- RESULT:BEGIN — deploy.py result 가 쓴다. 손으로 고치지 않는다 -->
| 단계 | 시작 | 끝 | 결과 | 근거 |
|---|---|---|---|---|

상태: planned
<!-- RESULT:END -->
