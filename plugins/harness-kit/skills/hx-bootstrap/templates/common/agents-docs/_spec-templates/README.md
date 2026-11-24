<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) · 이 폴더의 {{ISSUE_KEY}}·{{AREA}}·{{TYPE}}·{{TITLE}}·{{CREATED}}·{{FEATURE_NAME}}·{{PRODUCT_SLUG}}·{{EPIC_ID}} 는 설치 때 치환하지 않는다 -->

# `_spec-templates/` — SDD 단계 템플릿

이 폴더는 이슈 폴더 `.agents/docs/issues/<키>-<이름>/` 를 채울 때 복사해 쓰는 원본 한 벌이다.
이슈 폴더 안에는 템플릿을 두지 않는다 — 이슈가 늘어도 템플릿 사본은 늘지 않는다.

| 파일 | 무엇의 원본인가 | 어디로 복사되나 | 언제 |
|---|---|---|---|
| `requirements/_template.md` | 사용자 스토리 + EARS 수용 기준 | `issues/<키>-<이름>/requirements.md` | `/hx-specify` (기본 단계) |
| `design/_template.md` | 아키텍처·데이터·오류·테스트 설계 | `issues/<키>-<이름>/design.md` | `/hx-plan` (`--stage=design`) |
| `checklists/_template.md` | 요구사항 품질 판정 체크리스트 | `issues/<키>-<이름>/checklists/<focus>.md` | `/hx-checklist` |
| `tasks/_template.md` | 실행 가능한 작업 체크리스트 | `issues/<키>-<이름>/tasks.md` | `/hx-tasks` (`--stage=tasks`) |
| `tasks/README.md` | 완료 게이트(`state`: active→check→completed) 규약 | 복사하지 않는다(참고 문서) | — |
| `ops/deploy.md` | 배포 기록 모양(계획 구간 · 결과 구간) | `ops/deploys/<날짜>-<키>.md` — `deploy.py plan` 이 만든다 | 배포 직전 |
| `ops/record.md` | 운영 기록(실측 · 장애 · 다음 Intent 후보 · 배운 것) | `ops/records/<날짜>-<주제>.md` — `harness-kit ops new` 가 만든다 | 배포 뒤 1주 · 매월 · 장애마다 |

## 규칙

- 복사는 `scripts/new-feature.sh <키|--next> <이름> --area <영역>`(requirements), 승인 뒤 `scripts/new-feature.sh <키> --stage=design|tasks` 로 한다. 손으로 `cp` 하지 않는다.
- **단계마다 그 단계 템플릿만 복사한다.** 빈 design·tasks 를 미리 깔면 보드와
  단계 게이트(`check-sdd-prerequisites.sh`)가 함께 무력해진다. `--all` 예외는 없다.
- 세 템플릿의 첫 줄부터 문서 머리(frontmatter: `key` · `area` · `type` · `title` · `status`/`state` · `created`)가 있다.
  `new-feature.sh` 가 실제 값으로 다시 쓴다. 상태의 원본은 이 머리 하나이고, 본문 표에 상태 행을 두지 않는다.
- requirements와 design은 `status`를 `approved`로 바꾼 뒤에만 다음 단계 템플릿을 생성한다.
- 미치환 토큰은 의도된 것이다. 위 머리 주석의 토큰은 이슈가 정해지는 SDD 시점에 채우는 값이라 설치 때 치환하지 않는다.
  미치환 토큰 점검(`grep -rn '{{' .`)에서 이 폴더는 제외하고 본다.
- 여기를 고치면 이후 생성되는 모든 스펙에 반영된다. 이미 만들어진 이슈는 소급되지 않는다.
- 이 폴더는 이슈 폴더가 아니므로 `check-spec-freshness.sh`·`check-exec-plan-status.sh` 의 점검 대상이 아니다.

관련 문서: SDD 워크플로 `.agents/rules/sdd-workflow.md` · 전체 보드 `../specs-index.md`

옛 구조(`<영역>-specs/` 의 이슈 폴더 · 단계 폴더)는 읽기만 한다. 새 문서를 만들지 않고, `python3 scripts/sdd-layout.py migrate --dry-run` 으로 옮길 지도를 만든다.
