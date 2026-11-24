---
key: HK-4
area: verify
type: feat
title: 검증 실행 기록을 남기고, 테스트를 못 찾으면 full 대신 모듈로 넓히거나 미검증으로 보고한다
status: approved
created: 2026-11-23
---

# Design — HK-4

근거: [설계 01 R3 · R5 · §3.3 · §3.5](../../../../docs/design/01-v1.1-verify-and-issues.md). 경로는 `packages/templates/` 기준이다.

## 파일

| 파일 | 바꿈 |
|---|---|
| `common/scripts/harness/verify_record.py` | 새로. 기록 만들기 · 원자적 쓰기 · `--tee`(fast · full 본문 출력 읽기) · `--status`(차단 기록) |
| `common/scripts/verify-entry.sh` | fast · full이면 본문을 기록기로 감싼다. full 차단(exit 3)이면 `blocked` 기록 |
| `common/scripts/verify-changed.py` | changed · affected 실행 뒤 기록을 쓴다(`--plan`은 쓰지 않는다) |
| `common/scripts/harness/verify_runner.py` | 명령마다 시작 시각 · 걸린 시간 · 시험 수. 넓힌 모듈 시험이 0개를 돌면 그 파일을 `unverified`로 |
| `common/scripts/harness/verify_planner.py` | R3.1 · R3.2. 권고 · 미완료 문장에서 full 권고를 뺀다(R3.3) |
| `common/scripts/harness/verify_modules.py` | 모듈 시험 명령과 시험 소스 판정(HK-5와 같은 판정기) |
| `common/scripts/harness/verify_summary.py` | §3.3 형식(미검증 · 넓힘 줄) |
| `common/scripts/harness/verify_changes.py` | 변경 목록에서 `.agents/state/`를 뺀다. gitlink 삭제 안내 문장(R3.3) |
| `common/scripts/hooks/verify-gate.sh` | `HARNESS_VERIFY_TRIGGER=stop-hook`, 시간 초과 안내 문장(R3.3) |
| `stacks/*/root/.gitignore` | `.agents/state/` |

## 테스트를 못 찾을 때(R3)

changed 계획에서 관련 테스트가 없는 코드 파일 f마다:

1. f의 모듈 m을 HK-5 판정기로 정한다.
2. m에 시험 소스가 있으면 모듈 시험 명령을 한 번만 더하고 `widened`에 `{"file": f, "module": m, "reason": "no-related-test"}`를 남긴다.

| 묶음 | 모듈 시험 명령 | 시험 소스 |
|---|---|---|
| Gradle | `./gradlew :m:test --no-daemon --console=plain --dependency-verification=strict`(빌드 루트에서) | `<모듈>/src/test` |
| uv · Python | `<런타임> -m pytest -p no:cacheprovider -o addopts= -m "not model" -q <멤버>/tests` | `<멤버>/tests` |
| Go | `go test ./<패키지 폴더>`(go.mod 폴더에서) | 그 폴더의 `*_test.go` |
| pnpm · npm · 단일 패키지 | `pnpm --filter <name> run --if-present test` · `npm run test --workspace=<name>` · `<pm> run test` | `scripts.test`가 있고 `*.test.*` · `*.spec.*` 파일이 있다 |

3. 없으면 `unverified`에 `{"file": f, "reason": "no-module-test"}`. 실행 결과에서 넓힌 모듈 시험이 0개를 돌았으면 그 시험으로 넓힌 파일을 `{"file": f, "reason": "zero-tests"}`로 옮긴다. `unverified`가 있으면 상태 `incomplete`, exit 2다(지금의 `incomplete`처럼 명령을 돌리지 않는다).

`.go`를 코드 확장자에 더하고 changed에서 Go 패키지 시험을 고른다(관련 시험 = 같은 폴더의 `*_test.go`). 지금은 `.go` 파일이 문서로 분류돼 시험 없이 통과한다.

요약(`--summary`, 40줄 이하):

```text
검증 incomplete(L1) — 변경 파일 2개, 계획 명령 3개, 실행 0개. 이번 호출은 통과가 아니다.
미완료 1개 — 전체 목록: python3 scripts/verify-changed.py --plan
- 미검증 1개: PaymentPolicy.kt — 관련 테스트와 모듈 테스트가 없다. 테스트를 추가하거나 --tests 로 지정한다
넓힘 2개: OrderMapper.kt → :knots-service-note:test, Retry.kt → :knots-common:test
```

문장 교체(R3.3):

| 자리 | 바뀐 뒤 |
|---|---|
| 계약 · Gradle 빌드 파일 권고 | `…contract changed; run bash scripts/verify.sh --affected before the MR` |
| shared · contract 경로 권고 | `…review consumer coverage; run bash scripts/verify.sh --affected before the MR` |
| 언어 매핑 없음 | `…unsupported; select --tests <test-file>` |
| 시험 런타임 없음 | `…no install or whole-suite run was attempted` |
| 0개 실행 · 코드에 시험 없음(실행기) | `…select --tests <test-file> or add a test` |
| gitlink 삭제 | `…review the removal and select --tests explicitly` |
| Stop 훅 시간 초과 · 진입 실행기 없음 | MR 전 `bash scripts/verify.sh --affected`, 전체 검증은 CI |

## 실행 기록(R5)

- 경로: 하네스 루트(`scripts/..`)의 `.agents/state/verify-last.json`. 폴더를 만들 때 `*`만 적은 `.gitignore`도 둔다(템플릿 `.gitignore`를 갱신하지 않은 리포에서도 커밋되지 않는다).
- 형식: 설계 01 §3.5의 키(`schema` `harness-kit.verify-last/v1` · `runId` · `level` · `trigger` · `harness` · `sessionId` · `root` · `base` · `head` · `startedAt` · `finishedAt` · `durationMs` · `status` · `exitCode` · `files` · `units` · `skippedUnits` · `steps` · `widened` · `unverified` · `recommendations` · `previous`).
- 원자적 쓰기: 같은 폴더의 임시 파일에 쓰고 `os.replace`. 256KB를 넘으면 `steps[].command`를 앞 20개로 줄이고, 그래도 넘으면 `steps`를 앞에서부터 남기고 `truncated: true`.
- 쓰기 실패는 stderr에 `⚠ 검증 기록을 쓰지 못했다: …` 한 줄만 내고 exit code를 바꾸지 않는다.
- `previous`: 직전 파일의 `previous`에 직전 실행(레벨 · `runId` · `status` · `finishedAt` · `durationMs`)을 덮어 넣는다.
- `trigger`: `HARNESS_VERIFY_TRIGGER`(Stop 훅은 `stop-hook`), 없으면 `CI`가 있으면 `ci`, 그 밖은 `cli`.
- `harness`: `CI` → `ci`, `CLAUDECODE=1` → `claude`, `CODEX_`로 시작하는 환경 변수 → `codex`, 이름에 `KIRO`가 든 환경 변수 → `kiro`, `CURSOR_AGENT` → `cursor`, 그 밖은 `human`.

fast · full 기록기:

```bash
# verify-entry.sh (요지) — 스택 본문은 고치지 않는다
if [ "${HARNESS_VERIFY_RECORDING:-}" = "$PPID" ]; then          # 기록기가 띄운 본문
  trap 'printf "::harness-exit %s\n" "$?"' EXIT
elif [ -f "$recorder" ]; then                                    # 바깥 호출 → 같은 스크립트를 기록기로 흘린다
  export HARNESS_VERIFY_RECORDING="$$"
  bash "${BASH_SOURCE[1]}" "${rest[@]}" | python3 "$recorder" --tee --level "$HARNESS_VERIFY_LEVEL" --root "$root"
  exit "${PIPESTATUS[0]}"
fi
```

기록기는 줄을 그대로 stdout으로 내보내고(`::harness-exit`는 내보내지 않는다), `▶ `로 시작하는 줄을 단계 시작으로, 같은 단계의 `✖ ` 줄을 단계 실패로 본다. stderr는 기록기를 거치지 않는다. 표지를 부모 PID로 두므로, 본문이 부르는 하위 게이트는 각자 자기 기록을 쓴다.

## 시험

- `tests/harness_scripts/test_verify_record.py`(새로): changed · affected · fast · full 네 레벨 실행 뒤 스키마 검사, 임시 파일이 남지 않는다, `previous`가 레벨별로 남는다, 쓰기 권한이 없어도 exit code가 같다, fast · full 출력이 기록기를 거쳐도 같고 `::harness-exit`가 보이지 않는다, 단계 이름 · 실패 단계, full 차단은 `blocked`, `--plan`은 기록하지 않는다, 설치본 `.gitignore`에 `.agents/state/`가 있다.
- `tests/harness_scripts/test_verify_changed.py`: 관련 테스트가 없으면 모듈 시험으로 넓힌다(Python · Gradle · Go · pnpm), 모듈 시험도 없으면 `unverified` · exit 2, 넓힌 시험이 0개를 돌면 `unverified`, 요약이 §3.3 형식이고 "full"이 없다. full 권고를 기대하던 시험 두 개(`test_no_related_test_is_not_a_success`, `test_gradle_kotlin_build_change_needs_explicit_verification`)는 새 동작으로 바꾼다.

## 설계와 다른 점

- fast · full 단계의 `command`는 `null`이고 단계 이름은 `label`(`▶ ` 뒤 글)이다. 스택 본문이 argv를 내보내지 않는다. 단계의 `exitCode`는 `✖ ` 줄이 있으면 1, 없으면 0이다. 본문이 `::harness-exit`를 내지 못하고 끝나면 `exitCode: null`, 상태 `incomplete`다.
- `--plan`은 아무것도 실행하지 않으므로 기록하지 않는다.
- `unverified` 항목은 `incomplete` 목록에 겹쳐 넣지 않는다. 요약의 "미완료 N개"는 둘을 합친 수다.
- `trigger`의 `pre-commit` · `pre-push`는 git 훅이 `HARNESS_VERIFY_TRIGGER`를 넘길 때만 남는다. git 훅은 이 이슈 범위 밖이라 지금은 `cli`로 남는다.
- 작업 트리에도 없고 git도 모르는 경로(오타)는 모듈 시험으로 넓히지 않고 `incomplete`("file not found and unknown to git")로 남긴다.
- 빌드 계약 파일(`settings.gradle.kts` 등)을 changed로 부르면 `unverified`(`build-contract`)와 `--affected` 안내를 낸다. 계약 파일의 모듈 시험은 빌드 루트 전체라 changed 범위가 아니다.
- `.go`를 changed의 코드 확장자에 더했다(설계 01 §3.3 표의 Go 모듈 시험을 쓰려면 필요하다).
- 요약에 `↷ <id> 건너뜀`과 시간 상한으로 돌지 않은 명령 줄을 더하고, 전체를 40줄에서 자른다.

## 확인 필요

- Codex · Kiro · Cursor의 에이전트 환경 표지(설계 01 §6). 틀리면 `harness` 값만 `human`으로 남는다.
