---
description: product-specs/<작업단위>/tasks.md의 다음 미완료 태스크를 실행하고 체크박스를 갱신
---

# /run-spec-task

## 사용

```
/run-spec-task <작업단위>
/run-spec-task <작업단위> --task <번호>
/run-spec-task <작업단위> --dry-run
```

## 절차

1. **명세 확인** — `.agents/docs/product-specs/<작업단위>/tasks.md`를 읽는다. 없으면 사용 가능한 목록을 보여주고 중단한다.
2. **다음 태스크 식별** — `--task`가 없으면 위에서부터 첫 `- [ ]` 하나. `requirements.md`, `design.md`도 함께 읽어 맥락을 잡는다.
3. **실행 전 보고** — 선택된 태스크와 영향 파일 추정을 먼저 알린다. `--dry-run`이면 여기서 중단.
4. **구현** — `.agents/rules/golden-rules.md` 준수. 거대 파일은 부분 read.
5. **체크박스 갱신** — 해당 라인만 `[x]`로. requirements/design은 건드리지 않는다.
6. **검증** — 게이트 실행. 실패하면 체크박스를 **롤백**한다.
7. **보고** — 변경 파일, 검증 결과, 다음 미완료 태스크.

## 금지

- 한 번에 여러 태스크 실행 (범위 폭주 방지)
- 게이트 실패 상태로 체크박스를 `[x]` 유지
- requirements.md / design.md 임의 수정
- `git commit` 자동 실행
