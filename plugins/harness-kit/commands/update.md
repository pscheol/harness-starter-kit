---
description: 설치된 하네스를 킷의 현재 버전으로 올린다. 사용자가 고친 파일은 덮지 않고 새 버전을 .new 로 병기한다.
argument-hint: [경로] [--dry-run] [--accept-all]
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: skills/hx-update/SKILL.md -->

`hx-update` 스킬을 로드해 그 절차대로 수행한다.

> 이 커맨드는 얇은 트리거다. 스킬을 직접 불러도 결과는 같다 — `/harness-kit:hx-update` (짧게는 `/hx-update`).


입력: $ARGUMENTS

## 인자 해석

| 인자 | 의미 | 없을 때 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--dry-run` | 판정만 출력 | **먼저 dry-run 을 돌리고** 요약한 뒤 승인을 받는다 |
| `--accept-all` | 수정본도 새 버전으로 덮는다(원본은 `.bak`) | 수정본은 `.new` 로 병기. 사용자가 명시적으로 요구할 때만 붙인다 |

## 수행 순서

1. **스킬 위치 확인** — 이 커맨드가 속한 플러그인의 `skills/hx-update/` 절대경로를 `SKILL_DIR` 로 잡는다.
   플러그인이 방금 갱신됐다면 그 새 버전 경로여야 한다.
2. **`--dry-run` 선실행** — 건너뛰지 않는다.
3. **요약 보고** — 버전(`from → to`), `new`/`update` 건수, `conflict` 는 **파일 이름을 전부** 나열한다.
4. **승인 후 실행** — `--dry-run` 없이 재실행.
5. **충돌 처리** — `.new` 와 원본을 diff 해 차이를 설명하고 병합안을 제안한다.
   사용자 확인 없이 `.new` 를 원본에 덮지 않는다.
6. **검증** — `bash scripts/verify.sh` 통과와 미치환 토큰을 확인해 보고한다.

```bash
SKILL_DIR="<플러그인 내 skills/hx-update 절대경로>"
bash "$SKILL_DIR/update.sh" [--dry-run] [--accept-all] <대상_프로젝트_경로>
```

## 주의

- `ARCHITECTURE.md`·`product.md`·`structure.md` 가 `conflict` 로 나오는 것은 정상이다 — 사용자가 채우는 파일이다.
- 업데이트는 에이전트 구성을 바꾸지 않는다. 새 에이전트를 붙이려면 `/agent-add`.
- 상태 파일이 없으면(구버전 킷 설치) `exit 1` 이다. 안내대로 `setup.sh` 를 한 번 돌려 상태를 만든 뒤 재실행한다.
