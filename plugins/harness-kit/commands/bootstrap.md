---
description: 대상 백엔드 리포에 하네스 골격(AGENTS.md · .agents/rules 원본 · SDD 기록 시스템 · 단일 검증 게이트)을 스캐폴딩한다. 스택·아키텍처 변형을 판단해 setup.sh 를 실행한다.
argument-hint: [경로] [--stack=jvm|python|go] [--arch=<변형>] [--dry-run]
---

<!-- HARNESS STARTER KIT · 얇은 트리거. 원본: skills/harness-bootstrap/SKILL.md -->

`harness-bootstrap` 스킬을 로드해 그 절차대로 수행한다.

입력: $ARGUMENTS

## 인자 해석

| 인자 | 의미 | 없을 때 |
|---|---|---|
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--stack=` | `jvm` · `python` · `go` | 대상 리포에서 판단(`build.gradle.kts`/`pom.xml`→jvm, `pyproject.toml`→python, `go.mod`→go). 애매하면 묻는다 |
| `--arch=` | 스택별 변형(jvm 5 · python 5 · go 4) | 기존 레이아웃에서 추론. 새 리포이거나 애매하면 선택 기준을 제시하고 고르게 한다 |
| `--dry-run` | 설치 없이 목록만 | 미지정 시 실제 설치 |

## 수행 순서

1. **스킬 위치 확인** — 이 커맨드가 속한 플러그인의 `skills/harness-bootstrap/` 절대경로를 `SKILL_DIR` 로 잡는다. 대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 보통 대상 리포 바깥에 있다).
2. **스택·변형 결정** — 위 표대로. 임의로 정하지 않는다.
3. **치환값 확정** — `PROJECT_NAME` · `PROJECT_SLUG` · `PACKAGE_NS`(스택마다 의미가 다르다) · `PROTECTED_PATH` · `DOMAIN_EXAMPLE`. 모르면 합리적 기본값을 제안하고 확인받는다.
4. **`--dry-run` 선실행** — 설치될 파일 목록과 선택된 변형을 보여준다.
5. **사용자 승인 후 실제 설치** — `--dry-run` 없이 재실행.
6. **다음 단계 안내** — `setup.sh` 가 출력하는 스택×변형별 후속 작업을 그대로 전달한다.

```bash
SKILL_DIR="<플러그인 내 skills/harness-bootstrap 절대경로>"
STACK=<stack> ARCH=<variant> PROJECT_NAME="<이름>" PROJECT_SLUG="<슬러그>" PACKAGE_NS="<네임스페이스>" \
  bash "$SKILL_DIR/setup.sh" [--dry-run] <대상_프로젝트_경로>
```

## 주의

- 기존 파일은 덮지 않는다(`↷ skip (존재)`). 덮으려면 `--force` 를 사용자가 명시적으로 요구할 때만 붙인다.
- 설치 후 프로젝트에는 SDD 워크플로 커맨드 9종이 `hx-` 접두사로 깔린다(`/hx-specify` → `/hx-plan` → `/hx-tasks` → `/hx-implement`). 원본은 `.agents/rules/sdd-workflow.md` 한 곳이다.
