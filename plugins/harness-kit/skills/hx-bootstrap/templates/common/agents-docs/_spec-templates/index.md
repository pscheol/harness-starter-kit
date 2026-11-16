# 제품 스펙 색인 — {{PRODUCT_SLUG}}

제품/바운디드 컨텍스트의 이슈 목록이다. 새 SDD는 한 이슈의 문서를 한 폴더에 둔다.

| 단계 | 새 이슈 | 기존 이슈 |
|---|---|---|
| 요구 | `issues/<key>/requirements.md` | `requirements/<key>.md` |
| 설계 | `issues/<key>/design.md` | `design/<key>.md` |
| 작업 | `issues/<key>/tasks/active.md` | `tasks/active/<key>.md` |
| 검수 | `issues/<key>/tasks/check.md` | `tasks/check/<key>.md` |
| 완료 | `issues/<key>/tasks/completed.md` | `tasks/completed/<key>.md` |

기존 active 문서를 이동하지 않는다. 다음 단계는 기존 경로에서 계속 쓴다.
키는 `<순번>-<종류>-<이름>`, 트래커 ID·URL은 각 이슈의 출처에 적는다.

## 워크플로

requirements → 사용자 승인 → design → 사용자 승인 → tasks → 구현 → check → 사용자 검수 → completed.
각 단계 문서는 진입할 때 하나만 만든다. `--all`은 지원하지 않는다.

```bash
bash scripts/new-feature.sh {{PRODUCT_SLUG}} <name>
bash scripts/new-feature.sh {{PRODUCT_SLUG}} <key> --stage=design
bash scripts/new-feature.sh {{PRODUCT_SLUG}} <key> --stage=tasks
```

원본은 `.agents/rules/sdd-workflow.md`, 템플릿은 `.agents/docs/_spec-templates/`다.
경로는 `check-sdd-prerequisites.sh`의 출력에서 읽는다. 명세 상태와 검증 수준을 구분한다.

<!-- BOARD:BEGIN -->
<!-- BOARD:END -->

## 출처와 소유

| 이슈 | 출처 | 소유 단위 | 비고 |
|---|---|---|---|

기능의 API·상태·데이터·권한 변화와 관련 테스트를 각 이슈에 기록한다.
전체 제품 목록은 `.agents/docs/specs-index.md`다. 전역 결정은 `.agents/docs/decisions/`에 둔다.
