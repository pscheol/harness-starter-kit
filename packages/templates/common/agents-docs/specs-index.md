<!-- HARNESS STARTER KIT ({{PROJECT_NAME}}) -->

# 스펙 색인 (SDD 최상위 진입점)

이 프로젝트의 SDD는 이슈 하나 = 폴더 하나다: `.agents/docs/issues/<키>-<이름>/`(`requirements.md` → `design.md` → `tasks.md`).
이슈는 문서 머리의 `area`(영역)로 묶는다. 단계는 `.agents/rules/sdd-workflow.md` 「SDLC 단계」를 따른다.

<!-- BOARD:BEGIN — scripts/board.sh 가 생성합니다. 손으로 고치지 마십시오. -->

## 이슈 보드

전체 — 요구 0 · 설계 0 · 구현 0 · 검증 0 · 완료 0 · 폐기 0

> 아직 이슈가 없다. `scripts/new-feature.sh --next <이름> --area <영역>` 으로 시작한다.

<!-- BOARD:END -->

## 영역 등록표

| 영역 | 요약 | 소유 | 상태 |
|---|---|---|---|
| _(아직 없음 — 첫 이슈를 만들면 추가한다)_ | — | — | — |

> 상태: ☐ 미착수 / ◐ 진행 / ☑ 안정. 위 **이슈 보드**는 문서 머리에서 자동 계산되고, 이 등록표는 사람이 적는 영역 카탈로그다(요약·소유·안정도).
> 영역별 표만 보려면 `bash scripts/board.sh --area <영역>`.

## 새 이슈 추가

```bash
scripts/new-feature.sh --next <이름> --area <영역>     # requirements — 키는 issueKey.prefix-<다음 번호>
scripts/new-feature.sh KNOTS-17 <이름> --area <영역>   # Jira 키를 그대로 쓸 때(issueKey.source=jira)
scripts/new-feature.sh <키> --stage=design             # requirements 승인(status: approved) 후
scripts/new-feature.sh <키> --stage=tasks              # design 승인 후
```

- 키 · 이름 규칙: 키 `^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]{0,5}$`, 이름은 영문 소문자 · 숫자 2~5단어(`upload-cleanup`). 종류는 이름이 아니라 `--type` 으로 준다.
- 단계 문서는 미리 만들지 않는다. 단계에 들어갈 때 그 단계 것만 만든다 —
  빈 design·tasks 가 깔려 있으면 보드가 곧장 구현으로 뛰고 단계 게이트도 항상 통과한다.
- 상태의 원본은 문서 머리(`status` · tasks 는 `state`)다. 파일을 옮기지 않고 값을 바꾼다.
- 옛 구조(`<영역>-specs/`)는 읽기만 한다. 보드에 `(옛)`으로 붙는다. 옮기기: `python3 scripts/sdd-layout.py migrate --dry-run`.
- 단계 템플릿 원본은 `_spec-templates/` 한 곳이다. 이슈 폴더에는 템플릿을 복사하지 않는다.

## 원본 링크

- **SDD 워크플로 원본**: `.agents/rules/sdd-workflow.md` (specify → clarify → checklist → plan → tasks → analyze → implement, 구현 후 잔여 작업은 `/hx-converge` 회수).
- **전역 설계 결정(ADR)·핵심 원칙**: `decisions/`.
- **규칙 원본**: `.agents/rules/`. 검증 게이트: `scripts/verify.sh`.
