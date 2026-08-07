<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}): {{PROJECT_NAME}} 치환 후 사용 -->

# 실행 계획 — SDD의 tasks 단계

`tasks/`(제품 폴더 안)는 SDD의 tasks 단계다(requirements → design → tasks).
기능별 작업은 `active/<N>-<종류>-<이름>.md`에 둔다. 템플릿: `_template.md`. 스펙 흐름: `../index.md`(이 제품 색인).

```text
tasks/                 (<slug>-specs/ 안)
  _template.md   tasks 템플릿
  README.md      이 문서
  active/        진행 중 (기능별 tasks + 인프라/메타 계획)
  check/         검증 완료, 사용자 검증(confirm) 대기
  completed/     사용자 승인 완료 (이력 보존)
(기술 부채는 전역 .agents/docs/tech-debt-tracker.md 에 등록)
```

## 규칙

- 기능 구현 작업은 `active/<N>-<종류>-<이름>.md`(tasks). 완료는 아래 **완료 게이트**를 따른다.
- 기능 외 인프라/메타 다단계 작업도 `active/`에 둘 수 있다.
- 각 작업은 충족 요구사항 ID를 표기하고, 외부 상황 없이 계획만으로 재개 가능해야 한다.
- 파일명: `<N>-<종류>-<이름>.md`(new-feature.sh 가 붙인다). 보드는 이 이름으로 그려진다.
- 이 파일은 **design 승인 후** `scripts/new-feature.sh <slug> <feature> --stage=tasks` 로 만든다(`/hx-tasks` 가 실행한다).
  미리 만들어 두지 않는다 — `active/` 에 파일이 있는 순간 보드는 그 기능을 🔨 구현으로 센다.
- **잔여 작업 회수(append-only)**: 구현 후 남거나 새로 드러난 작업은 기존 Phase를 고쳐 쓰지 않고 파일 끝에 `## Phase N: Convergence` 를 덧붙여 회수한다(`/hx-converge` · 원본 `sdd-workflow.md`). 근거는 `scripts/check-spec-freshness.sh` 리포트.

## 진행 단계와 완료 게이트 (사용자 검증 필수)

상태/위치 전이: `active/` → `check/` → `completed/` (상태값도 동일하게 `active`/`check`/`completed`).

1. **active**: 작업 진행 중. 파일은 `active/`.
2. **check** — 사용자 검증을 기다리는 단계다. DoD와 `scripts/verify.sh`를 충족하면 에이전트는
   - 파일을 **`check/`로 이동**하고 상태를 `check`로 바꾼 뒤,
   - DoD 충족 근거(검증 결과 요약)를 `결과` 섹션에 적고,
   - **사용자에게 검증·확인을 요청**한다. (이 단계의 통과 여부는 사람이 판단한다.)
3. **completed**: 사용자가 명시적으로 승인(confirm)한 뒤에만 에이전트가 파일을 `completed/`로 이동하고
   상태를 `completed`로 바꾼다. 결과/PR 링크를 남긴다.

> 금지: 에이전트는 사용자 승인 없이 `check/`에서 `completed/`로 옮기거나 상태를 `completed`로 바꾸지 않는다.
> 검증(verify.sh) 통과는 완료의 필요조건일 뿐이다(최종 승인은 사람).
>
> 기계적 보조: `scripts/verify.sh`가 `scripts/check-exec-plan-status.sh`를 호출해
> 위치↔상태 일관성(`active/`=active, `check/`=check, `completed/`=completed)을 점검한다.

## 계획 템플릿

```md
# <제목>
상태: active | check | completed
목표:
범위(포함/제외):
단계: [ ] 1 ... [ ] 2 ...
의사결정 로그:
검증 방법:
결과/PR:
```
