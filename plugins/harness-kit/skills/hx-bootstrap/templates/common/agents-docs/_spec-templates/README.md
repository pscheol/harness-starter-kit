<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) · 이 폴더의 {{PRODUCT_SLUG}}·{{FEATURE_NAME}}·{{EPIC_ID}} 는 치환하지 않는다 -->

# `_spec-templates/` — SDD 단계 템플릿

이 폴더는 제품이 아니라 `<slug>-specs/` 를 만들고 채울 때 복사해 쓰는 원본 한 벌이다.
제품 폴더 안에는 템플릿을 두지 않는다 — 제품이 늘어도 템플릿 사본은 늘지 않는다.

| 파일 | 무엇의 원본인가 | 어디로 복사되나 | 언제 |
|---|---|---|---|
| `index.md` | 제품 색인(feature 등록표) | `<slug>-specs/index.md` | 제품 최초 생성 시 1회 |
| `requirements/_template.md` | 사용자 스토리 + EARS 수용 기준 | `<slug>-specs/requirements/<feature>.md` | `/hx-specify` (기본 단계) |
| `design/_template.md` | 아키텍처·데이터·오류·테스트 설계 | `<slug>-specs/design/<feature>.md` | `/hx-plan` (`--stage=design`) |
| `checklists/_template.md` | 요구사항 품질 판정 체크리스트 | `<slug>-specs/checklists/<feature>-<도메인>.md` | `/hx-checklist` |
| `tasks/_template.md` | 실행 가능한 작업 체크리스트 | `<slug>-specs/tasks/active/<feature>.md` | `/hx-tasks` (`--stage=tasks`) |
| `tasks/README.md` | 완료 게이트(active→check→completed) 규약 | `<slug>-specs/tasks/README.md` | 제품 최초 생성 시 1회 |

## 규칙

- 복사는 `scripts/new-feature.sh <slug> <feature> [--stage=S]` 로 한다. 손으로 `cp` 하지 않는다.
  제품 폴더가 없으면 이 폴더를 원본으로 골격까지 함께 만든다.
- **단계마다 그 단계 템플릿만 복사한다.** 빈 design·tasks 를 미리 깔면 보드(파일 위치로 상태를 계산한다)와
  단계 게이트(`check-sdd-prerequisites.sh`)가 함께 무력해진다. 예외는 `--all` 뿐이다.
- 미치환 토큰은 의도된 것이다. `{{PRODUCT_SLUG}}`·`{{FEATURE_NAME}}`·`{{EPIC_ID}}` 는
  제품/기능이 정해지는 SDD 시점에 채우는 값이라 설치 시 치환하지 않는다.
  미치환 토큰 점검(`grep -rn '{{' .`)에서 이 폴더는 제외하고 본다.
- 여기를 고치면 이후 생성되는 모든 스펙에 반영된다. 이미 만들어진 제품 폴더는 소급되지 않는다.
- 이 폴더는 `*-specs` 이름 규칙에 걸리지 않으므로 `check-spec-freshness.sh`·
  `check-exec-plan-status.sh` 의 점검 대상이 아니다(템플릿이 미완성으로 잡히지 않는다).

관련 문서: SDD 워크플로 `.agents/rules/sdd-workflow.md` · 전 제품 색인 `../specs-index.md`
