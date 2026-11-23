---
key: HK-5
area: verify
type: feat
title: 바꾼 모듈과 그 모듈을 쓰는 모듈만 검사하는 affected 레벨을 더한다
status: approved
created: 2026-11-23
---

# Design — HK-5

근거: [설계 01 §3.0 · §3.1](../../../../docs/design/01-v1.1-verify-and-issues.md). 경로는 `packages/templates/` 기준이다.

## 파일

| 파일 | 바꿈 |
|---|---|
| `common/scripts/verify-entry.sh` | 레벨 결정(인자 > `HARNESS_VERIFY_LEVEL` > changed). `--fast · --changed · --affected · --full`을 받고, 레벨 인자를 뺀 나머지와 `--level <레벨>`을 `verify-changed.py`에 넘긴다. 모르는 레벨은 exit 2 |
| `common/scripts/verify-changed.py` | `--level changed\|affected`, `--budget`(초). `--timeout` 기본값은 레벨별(changed 300 · affected 900) |
| `common/scripts/harness/verify_changes.py` | `git_base_name(root)` · `resolve_base(root, ref)`(base 결정 · merge-base) |
| `common/scripts/harness/verify_modules.py` | 새로. 스택별 빌드 루트 · 파일 → 모듈 · 모듈 그래프 · 역방향 닫힘 · 계약 파일 판정(Gradle · pnpm · npm · uv · Python 단일 · Go) |
| `common/scripts/harness/verify_affected.py` | 새로. `affected_plan(root, files, tests, units, base)` |
| `common/scripts/harness/gradle/affected-graph.init.gradle` | 새로. 정적 파싱이 멈출 때 쓰는 Gradle 초기화 스크립트(`harnessProjectGraph`) |
| `common/scripts/harness/verify_runner.py` | 명령별 `env`, 전체 상한(`budget`) — 넘으면 남은 명령을 `skipped`에 남기고 상태 `incomplete` |
| `common/scripts/harness/verify_summary.py` | 머리줄에 레벨 이름, 넓힘 · 건너뜀 줄 |
| `stacks/*/scripts/verify.sh` | 머리 주석 레벨 표(changed · affected · fast · full), fast 끝 문구(HK-7 몫) |

## 레벨 진입

```bash
# verify-entry.sh (요지) — bash 3.2 와 set -u 에서 빈 배열을 펼치지 않는다
for a in "$@"; do case "$a" in
  --full|--fast|--affected|--changed) level="${a#--}" ;;
  *) rest+=("$a") ;;
esac; done
[ -n "$level" ] && export HARNESS_VERIFY_LEVEL="$level"
case "${HARNESS_VERIFY_LEVEL:-changed}" in
  changed|affected) exec python3 verify-changed.py ${rest[@]+"${rest[@]}"} --level "$HARNESS_VERIFY_LEVEL" ;;
  fast|full) (HK-2 보조 점검 · HK-4 기록기 · HK-6 PARENT) ;;
  *) echo "✖ 알 수 없는 검증 레벨: …" >&2; exit 2 ;;
esac
```

`--level`을 뒤에 붙인다. multi-harness `test_verify_entry.py`의 가짜 실행기가 앞쪽 인자 순서(`--files … --plan`)를 본다.

## affected 계획

1. 변경 집합. `--files` · `--session`이면 그 목록을 쓴다. 아니면 base를 정한다: `--base <ref>`, 없으면 `.agents/harness-kit.json`의 `git.base`(없으면 `develop`)로 `origin/<base>` → `<base>` 순서로 찾는다. 둘 다 없으면 상태 `incomplete`, 오류 `base ref 없음: origin/develop — git fetch origin develop 뒤 다시 실행`, exit 2. 찾으면 `git merge-base HEAD <ref>`를 구하고 지금의 `changed_files(root, <merge-base>)`로 커밋된 변경 · 색인 · 미색인 · 추적 안 된 파일 · submodule 안 변경을 합친다.
2. 파일마다(덮는 검사 `covers: true`, 지운 시험은 changed와 같이 거른다):
   - 소유 단위가 하네스 루트가 아니고 스택이 킷 스택 5종(jvm · python · go · web · electron) 밖이면 그 단위 게이트를 `HARNESS_VERIFY_LEVEL=full HARNESS_VERIFY_PARENT=affected bash <단위>/scripts/verify.sh`로 부르고 `widened`에 `{"reason": "no-module-graph", "unit": <id>}`를 남긴다.
   - 아니면 확장자 묶음의 판정기(아래 표)로 빌드 루트와 모듈을 정한다. 계약 파일이면 빌드 루트 전체를 고르고 `widened`에 `{"reason": "build-contract", "file": …, "build": …}`를 남긴다.
   - 모듈을 정하지 못한 코드 파일과 문서 · 설정 파일은 changed 계획(`verification_plan`)으로 보낸다(관련 테스트 → HK-4의 모듈 테스트 → `unverified`). full로 올리지 않는다.
3. 빌드 루트마다 고른 모듈의 역방향 닫힘(고정점 반복)을 구하고 명령을 묶는다.
4. 경로 검사(`.agents/verify-checks.json`)와 `check-maintenance.py`는 바뀐 파일 전체로 계산한다.
5. 계획은 changed 계획과 같은 형식에 `level: "affected"`, `scope`(L0 · L1), `base`, `modules`, `widened`, `unverified`, `skippedUnits`를 더한다. changed 계획의 `level`(L0 · L1)은 바꾸지 않고 같은 값을 `scope`에도 둔다. 실행기는 `scope`를 본다.

| 묶음 | 빌드 루트 | 모듈 | 그래프 | 명령(빌드 루트마다 하나로 묶는다) | 계약 파일 |
|---|---|---|---|---|---|
| Gradle(`.kt .java .kts .gradle`) | 가장 가까운 `settings.gradle(.kts)` 폴더(`buildSrc`·`build-logic` 안이면 그 위) | 위쪽으로 처음 만나는 빌드 파일 폴더가 settings에 등록된 경로(빌드 루트면 `:`) | `include` 리터럴 · `project(":x").projectDir = file("…")`, 빌드 파일의 `project(":x")` · `projects.x`(camelCase → kebab-case) | `./gradlew :a:check :b:check --continue --console=plain --no-daemon --dependency-verification=strict`, 넓히면 `check` | `settings.gradle*`, 루트 `build.gradle*`, `gradle.properties`, `gradle/libs.versions.toml`, `buildSrc/**`, `build-logic/**` |
| pnpm(`.ts .tsx .js .jsx .mjs .cjs`) | `pnpm-workspace.yaml` 폴더 | 위쪽 첫 `package.json`의 `name`(워크스페이스 루트 자신은 제외) | 워크스페이스 패키지의 `dependencies` · `devDependencies` · `peerDependencies` · `optionalDependencies`(표시용. 실행 범위는 pnpm `...<name>`이 정한다) | 스크립트(`lint` · `typecheck` · `test`)마다 `pnpm --filter "...<a>" --filter "...<b>" --workspace-concurrency=4 -r run --if-present <스크립트>`, 넓히면 필터 없이 | `pnpm-lock.yaml`, 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` |
| npm 워크스페이스 | 루트 `package.json`의 `workspaces` | 같음 | 같은 표에서 킷이 닫힘을 계산 | `npm run <스크립트> --if-present --workspace=<a> --workspace=<b>`, 넓히면 `--workspaces` | `package-lock.json`, 루트 `package.json` |
| 단일 패키지 | 첫 `package.json` 폴더 | 패키지 하나 | 없음 | 정의된 스크립트만 `<pnpm\|npm> run --if-present <스크립트>` | — |
| uv(`.py`) | `[tool.uv.workspace]`가 있는 `pyproject.toml` 폴더 | 파일이 든 멤버 폴더 | 멤버 의존(`dependencies` · `optional-dependencies` · `dependency-groups`)에 다른 멤버 이름이 있고 `[tool.uv.sources]`에 `workspace = true` | `ruff check` · `ruff format --check`(ruff 설정이 있으면) · `mypy`(설정이 있으면) · `pytest <멤버>/tests`(있으면), 런타임은 `.venv-verify` · `.venv` | 루트 `pyproject.toml`, `uv.lock` |
| Python 단일 | 가장 가까운 `pyproject.toml` 폴더 | 프로젝트 하나 | 없음 | 위와 같음(대상 `.` · `tests`) | `pyproject.toml`, `uv.lock` |
| Go(`.go`) | 가장 가까운 `go.mod` 폴더 | 파일 폴더의 import path(`module` 줄 + 상대 폴더) | `go list -test -f '{{.ImportPath}} {{join .Deps " "}}' ./...`, 시험 변형 이름은 대괄호 앞 · `_test` · `.test` 접미를 뗀다 | `go vet <pkgs>` · `go test -race <pkgs>`, 넓히면 `./...` | `go.mod`, `go.sum`, `go.work` |

정적 파싱 중단(Gradle): `includeBuild`, 문자열 리터럴이 아닌 `include` 인자, `file("…")` 리터럴이 아닌 `projectDir`. 이때 `./gradlew -q --no-configuration-cache --init-script scripts/harness/gradle/affected-graph.init.gradle harnessProjectGraph`를 한 번 돌려 `HARNESS_GRAPH <json>` 줄을 읽고 `.agents/state/gradle-graph-<settings·빌드 파일 해시 16자>.json`에 캐시한다. 실패하면 `incomplete`.

런타임(`gradlew` · `pnpm` · `npm` · `go` · Python 환경)이 없으면 설치하지 않고 `incomplete`에 남긴다. 명령 목록은 계획에 그대로 둔다(`--plan`으로 볼 수 있다).

## 시간 상한

| 레벨 | 명령별 | 전체 | 넘으면 |
|---|---|---|---|
| changed | 300초(`--timeout`) | 없음 | 그 명령 exit 124, `failed` |
| affected | 900초 | 1,200초(`--budget`) | 남은 명령을 돌리지 않고 `skipped`에 `"<단위> <종류> <명령>: budget 1200s exceeded; not run"`, 상태 `incomplete`, exit 2 |

## 시험(`tests/harness_scripts/test_verify_affected.py`, 설치본 안에서 돈다)

실제 Gradle · pnpm · go를 돌리지 않는다. `gradlew` · `pnpm` · `go`는 가짜 실행 파일이고 `--plan` 출력을 본다.

- 진입: `verify.sh`(기본 changed), `--changed`, `--affected`, `HARNESS_VERIFY_LEVEL=affected`, 인자가 환경 변수보다 앞선다, 모르는 레벨은 exit 2.
- Gradle: `include` 세 형식, `projectDir` 덮어쓰기, `project(":x")`와 `projects.x` 간선, 전이 닫힘, 바꾼 모듈을 안 쓰는 모듈은 빠진다, 계약 파일이면 `check`와 `widened`, 리터럴이 아닌 `include`면 초기화 스크립트 결과를 쓴다.
- pnpm: `...<name>` 필터 세 스크립트, 계약 파일이면 필터 없음.
- npm 워크스페이스: 킷이 계산한 닫힘의 `--workspace` 목록.
- uv: `workspace = true` 간선만 따른다, 멤버별 `pytest <멤버>/tests`.
- Go: `go list` 출력으로 닫힘, `go.mod`이면 `./...`.
- base: `git.base` 메타 값으로 `origin/<base>`, 없으면 로컬 `<base>`, 둘 다 없으면 `incomplete`와 fetch 안내. merge-base 이후 커밋 · 작업 트리 · 추적 안 된 파일이 변경 집합에 든다.
- `--affected --plan`은 아무것도 실행하지 않는다.
- 모듈을 못 정한 파일은 full로 가지 않고 changed 판정을 받는다. 킷 스택 밖 단위는 그 단위 게이트를 `full` · `HARNESS_VERIFY_PARENT=affected`로 부른다.
- 전체 상한을 넘으면 남은 명령을 돌리지 않는다.

## 설계와 다른 점

- 모듈을 정하지 못한 파일(R1.4): 설계 01은 "단위의 검사로 넓힌다"이다. 하네스 루트 단위의 검사는 그 루트의 full과 같으므로, 루트 단위의 파일은 changed 판정(관련 테스트 → 모듈 테스트 → `unverified`)으로 보낸다. 단위 게이트 호출은 킷 스택 밖의 하위 단위에만 쓴다(§3.1 "그 밖의 스택").
- Gradle 그래프 캐시는 초기화 스크립트 결과에만 쓴다. 정적 파싱은 빌드 파일을 읽는 것뿐이라 캐시하지 않는다.
- pnpm `modules` 필드의 의존 닫힘은 킷이 package.json으로 계산한 표시용 값이다. 실행 범위는 pnpm 필터가 정한다.
- uv · Python 단일 프로젝트는 `ruff format --check`도 돈다(changed와 같은 검사).
- changed 계획의 `level`은 지금 값(L0 · L1)을 그대로 둔다. affected만 `level: "affected"`이고, 두 레벨 모두 `scope`에 L0 · L1을 둔다. 지금 시험 · 소비자가 `level: L0`을 본다.
- `--plan`도 그래프를 읽는 명령(`go list`, 캐시가 없을 때 Gradle 초기화 스크립트)은 돌린다. 검증 명령(빌드 · 린트 · 시험)은 돌리지 않는다.
- 킷 스택 밖 하위 단위의 파일은 Markdown(`.md` 등 문서)만 정적 검사로 보내고, 나머지는 모두 그 단위 게이트로 보낸다(설정 파일도 그 단위의 동작을 바꾼다).
- 모듈 안의 문서가 아닌 파일(`application.yml`, `*.sql`, 모듈 `package.json` · `pyproject.toml`)도 그 모듈을 고른다. 설계 01 표는 코드 파일만 적었다.

## 확인 필요

- knots Gradle 루트 6곳에서 정적 그래프 = 초기화 스크립트 그래프인지(설계 01 §6).
- `go test -race`는 cgo가 필요하다. cgo가 없는 CI에서 affected가 실패하면 `-race`를 설정으로 뺀다.
