---
key: HK-16
area: verify
type: feat
title: 오픈소스 정적 분석 · SARIF · 새 문제만 막는 품질 게이트 · CI 템플릿
status: approved
created: 2026-11-23
---

# Design — HK-16

근거: [설계 09](../../../../docs/design/09-verification-quality.md) §3.2~§3.7 · §3.9, [설계 README](../../../../docs/design/README.md) §4 · §8 · §10.

## 1. 파일

| 파일(`packages/templates/…`) | 바꿈 |
|---|---|
| `stacks/<스택>/agents-root/analyzers.json` ×5 | 새로. 공통 분석기 5개 + 스택 분석기(§3) |
| `common/agents-root/quality-gate.json` | 새로. 설계 09 §3.6 기본값 |
| `common/scripts/harness/quality.py` | 새로. CLI: `run` · `check-config` · `baseline --update` · `scan` |
| `common/scripts/harness/quality_config.py` | 새로. 등록 파일 · 게이트 설정 읽기와 형식 검사, 설정 폴더 해석 |
| `common/scripts/harness/quality_select.py` | 새로. 레벨 · 범위 · lock 파일 조건으로 분석기 고르기, 도구 찾기, 자리표 풀기 |
| `common/scripts/harness/quality_run.py` | 새로. 동시 4개 실행 · 시간 제한 · 변환기 호출 · 산출물 쓰기 · 화면 요약 |
| `common/scripts/harness/quality_baseline.py` | 새로. 기준선 읽기 · 새 문제 판정(이름 바뀜 포함) · `accepted` · 갱신 |
| `common/scripts/harness/quality_gate.py` | 새로. 게이트 판정(새 문제 · 새 코드 중복률 · 복잡도 · 의존성) |
| `common/scripts/harness/quality_git.py` | 새로. 바뀐 줄 · 이름 바뀜 표 · HEAD 정보 |
| `common/scripts/harness/sarif/normalize.py` | 새로. 경로 · 심각도 · 지문 정규화 |
| `common/scripts/harness/sarif/sarif_io.py` | 새로. 변환기 공통(문서 틀 · 정렬 · 쓰기 · 구조 검사) |
| `common/scripts/harness/sarif/{jscpd,lizard,mypy,tsc}.py` | 새로. 변환기 넷 |
| `common/scripts/harness/verify_sources.py` | 새로. 하네스 루트 · 도구 폴더 · 설정 폴더(`HX_ROOT` · `HX_TOOLS_DIR` · `HX_GATE_CONFIG_DIR`) |
| `common/scripts/verify-changed.py` | changed · affected 실행 뒤 정적 분석을 부르고 결과를 합친다. `HX_ROOT` 를 루트로 쓴다 |
| `common/scripts/harness/verify_planner.py` | 검사 설정 · 도구 경로를 `verify_sources` 로 찾는다 |
| `common/scripts/harness/verify_summary.py` · `verify_record.py` | 분석 요약 줄 · 기록 칸 `analysis` |
| `common/scripts/verify-entry.sh` | `--from-base <ref>` · `--bootstrap`, fast(설정 검사) · full(정적 분석) 단계 |
| `common/agents-skills/hx-scan/SKILL.md` | 새로. 포인터 넷은 `scripts/sync-commands.sh` 가 만든다 |
| `common/root/.github/workflows/harness-verify.yml` | 새로. GitHub Actions |
| `common/root/.gitlab-ci.yml` · `common/ci/harness-kit.gitlab-ci.yml` | 새로. GitLab CI(앞 파일은 include 만) |
| `common/ci/harness.gocd.yaml` | 새로. GoCD |
| `stacks/<스택>/root/.github/actions/harness-setup/action.yml` ×5 | 새로. 스택 실행 환경 준비(지금 `verify.yml` 의 셋업 단계를 옮긴다) |
| `stacks/<스택>/root/.github/workflows/verify.yml` ×5 | 지운다. PR 마다 full 을 도는 옛 트리거가 `harness-verify.yml` 과 겹친다 |

`ci/` 는 `layout.json` 의 마지막 세그먼트(`"" → ""`)로 그대로 깔린다. `layout.json` 은 바꾸지 않는다.

## 2. 흐름

```text
changed · affected:  verify-changed.py → 계획 실행(지금 그대로) → quality_run.analyze(level, 바뀐 파일, base)
                     → 결과 합침: 시험 실패 또는 게이트 failed → 1, 미완료 → 2, 아니면 0
fast:                verify-entry.sh 본문 끝(EXIT trap) → quality.py check-config    (분석기 실행 없음)
full:                verify-entry.sh 본문 끝(EXIT trap) → quality.py run --level full
Stop 훅(changed):    HARNESS_VERIFY_TRIGGER=stop-hook 이면 정적 분석을 돌리지 않는다(아래 §9)
MR(CI):              base 판 verify.sh · verify-entry.sh 를 꺼내 --from-base <ref> --affected
```

- 분석 결과의 화면 출력은 분석기마다 한 줄(이름 · 새 문제 · 전체 · 초)과 게이트 한 줄, 미완료 한 줄이다. 합계 15줄 이하이고 검증 요약 전체는 지금처럼 40줄 이하다.
- `.agents/analyzers.json` 이 없으면 분석을 하지 않고 줄도 내지 않는다(분석기 0개 등록).

## 3. `analyzers.json`

설계 09 §3.3 형식을 따른다. 더한 칸(설계와 다른 점 §11):

| 칸 | 뜻 |
|---|---|
| `enabled` | `false` 면 등록만 하고 돌지 않는다(기본 `true`) |
| `include` | `scope: files` 대상 거르기 glob 목록(예: `**/*.py`). 맞는 파일이 없으면 그 분석기는 `대상 없음`으로 건너뛴다 |
| `raw` | 변환기 입력 파일(도구가 파일로 쓸 때, 예 `{tmp}/jscpd-report.json`). 없으면 `stdout` 파일 |
| `collect` | 도구가 정해진 자리에 SARIF 를 여러 개 쓸 때 모을 glob(SpotBugs Gradle 플러그인) |
| `convertArgs` | 변환기에 더 넘길 인자. `{ccn}` = `complexity.functionMaxCcn` |
| `fingerprint` | `auto`(기본: 도구 `partialFingerprints` 의 빈 값 아닌 항목) · `content`(줄 내용만) |
| `alternatives` | 문자열이면 `cmd[0]` · `versionCmd[0]` 만 바꾼다. 객체면 그 칸으로 덮는다 |

자리표: 설계의 `{targets}` · `{modules}` · `{lockfiles}` · `{out}` · `{tmp}` · `{rules}` · `{root}` 에 셋을 더한다. `{targetsCsv}`(쉼표로 이은 대상, PMD · detekt), `{targetsDir}`(대상만 복사한 임시 폴더, 폴더 하나만 받는 gitleaks), `{dirs}`(대상 파일의 폴더 `./a/b`, golangci-lint). 목록 자리표는 인자 하나 전체일 때 여러 인자로 펼친다.

| 레벨 | `{targets}` | `{modules}` | `{dirs}` | `{targetsDir}` |
|---|---|---|---|---|
| changed · affected | 바꾼 파일 중 있는 것(`include` 로 거름) | 바꾼 파일의 가장 가까운 빌드 파일 폴더 | 대상 파일 폴더 | 대상 복사 폴더 |
| full | `.` | `.` | `./...` | 리포 루트 |

스택 기본값(도구 플래그는 2026-11 문서 기준, 설치한 4개는 이 컴퓨터에서 `--help` 로 확인):

| 스택 | 분석기(required) |
|---|---|
| 공통 | gitleaks(✓, `dir` · `--redact`) · semgrep(✓, 대안 opengrep, 규칙 `registry:p/default` · `bundled: false`) · osv-scanner(✓, 대안 trivy, `scan source -r {root}`, lock 파일 조건) · jscpd(`--absolute`, 변환) · lizard(변환) |
| jvm | pmd(`-f sarif`, quickstart 규칙) · checkstyle(`-f sarif`) · spotbugs(Gradle 플러그인, `enabled: false`) · detekt(`--report sarif:`) · ktlint(`--reporter=sarif,output=`) |
| python | ruff(`--output-format sarif`) · bandit(`-f sarif`) · mypy(`-O json` → 변환) |
| web · electron | eslint(SARIF 포매터) · tsc(출력 → 변환) |
| go | golangci-lint(v2 `--output.sarif.path`) · govulncheck(`-format sarif`, 의존성 조건) |

- 도구 찾기: `<루트>/.venv/bin` · `<루트>/.venv-verify/bin` · `<루트>/node_modules/.bin` · `PATH` 순서. `cmd[0]` 이 `./` 로 시작하면 루트 기준 파일.
- 상태: `ran` · `missing`(설치 안 됨) · `old`(minVersion 미만) · `timeout` · `error`(결과 파일이 없거나 SARIF 로 읽히지 않음) · `no-targets`. 도구의 exit code 로는 판정하지 않는다(대부분 문제가 있으면 1을 낸다). 결과 파일로 판정한다.
- `required` 분석기의 `missing` · `old` · `error` 와 모든 분석기의 `timeout` 은 미완료다. 선택 분석기의 `missing` 은 줄에 `건너뜀`, `error` 는 `오류` 로만 보인다.
- 미완료: 로컬은 `incomplete`(exit 2), CI(`CI` 가 비어 있지 않음)는 게이트 검사 `analyzers.required` 가 `failed`(exit 1)다(VQ-R7).
- 의존성 분석기(`category: dependency` 또는 `scope: lockfiles`)는 changed · affected 에서 바꾼 파일이 `trigger` 에 맞을 때만, full 에서는 항상 돈다(VQ-R6). `**/x` 는 루트의 `x` 에도 맞는다.
- Semgrep `{rules}`: `rules.source` 가 `registry:<이름>` 이면 `<이름>`, `path:<경로>` 면 루트 기준 경로. 킷은 규칙 파일을 넣지 않는다(VQ-R18).

## 4. 산출물(설계 09 §3.5 자리)

```text
.agents/reports/.gitignore                    "*"(처음 쓸 때)
.agents/reports/sarif/<runId>/<분석기>.sarif   정규화한 SARIF. runId = <레벨>-<YYYYMMDDHHmmss>-<head 7자>
.agents/reports/sarif/latest                  마지막 실행(심볼릭 링크, 안 되면 복사). 실행 폴더는 최근 20개만 둔다
.agents/reports/findings-latest.json          harness-kit.findings/v1
.agents/reports/quality-gate-last.json        harness-kit.quality-gate-result/v1
.agents/reports/metrics/latest.json · <YYYY-MM-DD>.jsonl   harness-kit.metrics/v1
```

- `findings-latest.json`: `runId` · `level` · `head` · `branch` · `base` · `analyzers{상태 · 도구 · 판 · 초 · 전체 · 새 것}` · `findings[]`(분석기 · 규칙 · 경로 · 줄 · 심각도 · 분류 · 메시지 200자 · 지문 · `new` · `accepted` · 속성). 발견은 5,000개까지(새 것 먼저), 넘으면 `truncated: true`. 코드 조각(snippet)은 옮기지 않는다.
- `metrics`(VQ-R19): 분석기별 `total` · `new` · `bySeverity` · `seconds`, `duplication{newCodePercent, repoPercent}`, `complexity{functionsOverCcn, newOrWorsened, maxCcn}`, `coverage: null`, `gate`, `seconds`(정적 분석 합계).
- 모든 파일은 같은 폴더 임시 파일 → rename 으로 쓴다. 쓰기 실패는 경고 한 줄이고 판정을 바꾸지 않는다.

## 5. 정규화 · 지문(`sarif/normalize.py`)

1. 경로: `artifactLocation.uri`(또는 `index` → `run.artifacts`)를 `file://` · 절대 · `originalUriBaseIds` 상대 · 루트 상대 순서로 풀고, `{targetsDir}` 복사 폴더 아래면 그 폴더 기준으로 되돌린다. realpath 로 루트와 비교하고 리포 밖 결과는 버린다. 결과에는 `uri`(루트 상대 POSIX) · `uriBaseId: "%SRCROOT%"` 를 쓴다.
2. 심각도: 결과 · 규칙 `properties.security-severity` → 9.0/7.0/4.0 경계. 없으면 결과 `level` → 규칙 `defaultConfiguration.level` → `warning`(SARIF 기본). `category: secret` 은 CRITICAL. 마지막에 `severityMap`(규칙 ID glob → 심각도)을 덮는다. `kind` 가 `pass` · `notApplicable` 인 결과는 버린다.
3. 지문: 바탕 = `partialFingerprints` 의 빈 값 아닌 항목(키 정렬, `harnessKit/v1` 제외) 또는 정규화한 시작 줄 내용(공백 묶기 · 앞뒤 공백 제거). 위치 정보가 없으면 메시지. `fp = sha256(ruleId \0 경로 \0 sha256(바탕) \0 순번)`, 순번은 같은 (규칙 · 경로 · 바탕) 안에서 줄 · 열 순서다. 줄 번호는 넣지 않는다(VQ-R10). 정규화한 SARIF 결과에 `partialFingerprints["harnessKit/v1"]` 로 남긴다.
4. 이름 바뀜: 기준선 `commit` 에서 작업 트리까지 `git diff -M --name-status -z` 의 `R` 줄로 새 경로 → 옛 경로 표를 만들고, 새 경로 발견은 옛 경로 지문도 기준선에서 찾는다. commit 이 없으면(얕은 clone) 표는 비어 있다.

변환기 계약은 설계 09 §3.5 그대로다(`--in` · `--out`, 경로 → 줄 → 규칙 정렬, 발견이 있어도 exit 0, 원본을 못 읽으면 exit 2). jscpd 는 `statistics.total` 을, lizard 는 함수 수 · 최대 CCN 을 `runs[0].properties` 에 남겨 지표로 쓴다. lizard CSV 는 머리 줄이 있어도 없어도 읽는다(1.26.1 은 없다).

## 6. 기준선 · 판정

- 새 문제 = 지문(또는 옛 경로 지문)이 그 분석기의 `findings` 에 없고, 오늘 이후 `until` 인 `accepted` 에도 없는 발견. 지난 `accepted` 는 무시하고 `check-config` 가 경고한다.
- 기준선이 없으면 모든 발견이 새 것이고 게이트는 경고만 한다(`mode: warn-no-baseline`).
- `quality.py baseline --update`: 에이전트 세션(verify_record 의 하네스 판정이 claude · codex · kiro · cursor)이면 exit 3. `findings-latest.json` 이 `full` · 현재 HEAD · 깨끗한 작업 트리 · base 브랜치(`git.base` 이름이거나 HEAD == `origin/<base>`)일 때만 쓴다. 이번 실행에 없던 분석기의 기존 항목과 `accepted` 는 남긴다.
- 게이트 검사(설계 09 §3.6): `newIssues.<심각도>`(null 은 `reported`), `dependencies.blockAtSeverity`(의존성 분류의 새 문제 중 그 심각도 이상, 한도 0), `duplication.newCodeMaxPercent`(바뀐 줄 중 jscpd 조각 안 줄 ÷ 바뀐 줄, `minChangedLines` 미만이면 `skipped`), `complexity.functionMaxCcn`(바뀐 줄과 겹치는 lizard 발견 중 기준선에 없거나 CCN 이 늘어난 것, 한도 0), `analyzers.required`(CI 에서만 failed). `coverage` · `review` 는 계산기가 없어 `skipped` 다.
- 바뀐 줄: `git diff -U0 <기준>` 의 `+` 범위 + 추적 안 된 파일 전체. 기준은 affected 의 merge-base, changed 의 `--base` 또는 HEAD, full 은 base 를 찾으면 merge-base, 못 찾으면 없음.
- 레벨: `enforceAt` 이면 위반이 `failed`, `warnAt` 이면 `warned`(exit 0, 줄은 보인다). 기준선이 없으면 `warned`.
- 형식 검사(`check-config`, fast): schema 값, 칸 형식, `levels` · `category` · `scope` · `sarif` 값, 변환기 파일 존재, 게이트 하한 `newIssues.CRITICAL == 0`, 기준선 형식, `accepted.until` 형식 · 180일 이하. `semgrep` 이 켜져 있고 `harness-kit.json` 의 `analyzers.semgrepRulesAcknowledged` 가 `true` 가 아니면 경고 한 줄(실패 아님).

## 7. base 판 판정(VQ-R11)

```text
CI: git show $HX_BASE_REF:scripts/verify.sh       > .agents/state/verify-base.sh
    git show $HX_BASE_REF:scripts/verify-entry.sh > .agents/state/verify-entry.sh
    둘 다 있으면 bash .agents/state/verify-base.sh --from-base "$HX_BASE_REF" --affected
    아니면 bash scripts/verify.sh --affected --bootstrap
verify-entry.sh(base 판) --from-base <ref>:
    루트 = 현재 폴더에서 위로 .agents/harness-kit.json · .agents/harness.json 을 찾은 곳
    <루트>/.agents/state/ci-base/ 를 비우고 git archive <ref> 로 base 에 있는 것만 꺼낸다:
      scripts/ · .agents/{verify-checks,quality-gate,analyzers,deploy}.json · .agents/quality-baseline.json
    HX_ROOT=<루트> HX_TOOLS_DIR=ci-base/scripts HX_GATE_CONFIG_DIR=ci-base HX_FROM_BASE=<ref> 로
    ci-base/scripts/verify.sh --affected 를 exec 한다
```

- `HX_GATE_CONFIG_DIR` 이 있으면 검사 · 분석 · 게이트 설정과 기준선은 그 폴더에서만 읽는다. base 에 없는 파일은 없는 것으로 본다(head 판으로 돌아가지 않는다).
- `HX_TOOLS_DIR` 이 있으면 `verify_static.py` · `check-maintenance.py` · 변환기를 그 폴더에서 부른다. 판정 대상(바뀐 파일 · 빌드 그래프)은 `HX_ROOT` 의 작업 트리다.
- `--bootstrap` 은 `HX_VERIFY_BOOTSTRAP=1` 로 넘어가 `quality-gate-last.json` 의 `bootstrap: true` 와 화면 한 줄로 남는다.

## 8. CI 템플릿(VQ-R16)

| 파일 | 단계 |
|---|---|
| `.github/workflows/harness-verify.yml` | job `verify`: checkout(fetch-depth 0) → `./.github/actions/harness-setup` → fast → (PR) base 판 affected → (schedule · 수동) full → SARIF 업로드. job `affected-head`: PR 이 검증 경로를 바꿨을 때만 head 판 affected, `continue-on-error` |
| `ci/harness-kit.gitlab-ci.yml` | `harness:fast` · `harness:affected`(MR, base 브랜치 fetch 후 base 판) · `harness:affected-head`(검증 경로 `changes`, `allow_failure`) · `harness:full`(schedule). 공통 틀 `.harness-kit-setup` 을 리포 `.gitlab-ci.yml` 이 덮어 이미지 · 셋업을 넣는다 |
| `.gitlab-ci.yml` | `include: local: ci/harness-kit.gitlab-ci.yml` 와 덮어쓰기 예시 주석 |
| `ci/harness.gocd.yaml` | 파이프라인 `harness-verify`(fast → affected) · `harness-nightly`(timer → full). task 는 `bash -c` 한 줄 |

- 검증 단계에서 실행하는 명령은 `bash scripts/verify.sh …` · `bash .agents/state/verify-base.sh …` 와 준비 명령(`mkdir -p .agents/state` · `git show` · `git fetch` · `git diff --quiet`)뿐이다. 배포 단계는 넣지 않고 자리 주석만 둔다(설계 14 §3.5).
- 분석기 설치 자리는 셋업(GitHub `harness-setup` · GitLab `.harness-kit-setup`) 주석이다. 킷은 설치하지 않는다.

## 9. Stop 훅

설계 README §8 은 Stop 훅을 `fast` 몫으로 두지만 지금 훅은 `changed` 를 부른다. 턴마다 Semgrep 규칙을 받고 분석기 미설치로 `incomplete` 를 에이전트 문맥에 싣지 않도록, `HARNESS_VERIFY_TRIGGER=stop-hook` 인 changed 실행은 정적 분석을 하지 않는다(출력 0줄, 기록 `analysis.status: skipped`). 커밋 전 · pre-push · 사람이 부른 changed 는 돈다.

## 10. 시험

설치본 안(`tests/harness_scripts/`, 실제 분석기 없이 가짜 도구와 고정 SARIF):

- `test_quality_sarif.py`: 경로 정규화(절대 · `file://` · 리포 밖 버림 · 복사 폴더), 심각도 표, 지문이 줄 50개를 위에 더해도 같다(기준선 20건 → 새 문제 0), 파일 이름만 바꿔도 새 문제 0, 같은 줄 두 번이면 순번이 다르다, 변환기 넷의 구조 검사 통과 · 두 번 돌린 바이트 같음 · 못 읽으면 exit 2.
- `test_quality_gate.py`: 등록한 분석기만 · 레벨이 맞을 때만(VQ-R5), lock 파일 조건(VQ-R6), required 없음 → 로컬 incomplete · CI failed, 선택 분석기 없음 → 건너뜀, timeout → incomplete, 기준선 새 것/기존 것, `accepted`(유효 · 만료), changed 경고 · affected 실패, 기준선 없음 → 경고, 의존성 차단, 복잡도 새 것 · 늘어남 · 같음, 새 코드 중복률, 지표 파일 칸(VQ-R19), 산출물 자리 · latest.
- `test_quality_verify.py`: verify-changed.py changed · affected 에 분석이 붙는다(통과 · 게이트 실패 exit 1), Stop 훅이면 분석 없음, `verify.sh --fast` 의 설정 검사(하한 위반 → 실패), `verify.sh --full` 단계, `baseline --update`(에이전트 세션 exit 3 · base 브랜치 full 결과로 씀), `quality.py scan` 묶음 줄(같은 규칙 5건 초과 → 한 줄), 요약 40줄 이하.
- `test_ci_templates.py`: 세 템플릿의 명령이 허용 목록뿐(정적), base 판 판정 fixture 셋(head 가 게이트 기준을 낮춤 · 검사 단계를 지움 · verify.sh 를 `exit 0` 으로 바꿈)이 모두 실패, base 에 하네스가 없으면 bootstrap 으로 head 판이 돈다.

킷 시험(`tests/test_quality_templates.py`): 다섯 스택 `analyzers.json` 의 공통 분석기 5개가 같다, 스택별 기본 분석기, `rules.bundled: false` 이고 킷 템플릿에 Semgrep 규칙 파일이 없다, `quality-gate.json` 기본값, 스택 `verify.yml` 이 없고 `harness-setup` 이 있다.

실제 도구 시험은 도구가 있을 때만 돈다(`skipUnless`).

## 11. 설계와 다른 점

| 설계 09 | 이 구현 | 이유 |
|---|---|---|
| §3.4 `verify_static.py` 를 등록 파일을 읽도록 바꾼다 | `verify_static.py`(문서 · 설정 L0 검사)는 그대로 두고 `quality_*.py` 를 새로 둔다 | 지금 파일은 L0 문법 · 링크 검사이고 시험이 그 출력에 묶여 있다 |
| §3.3 `alternatives: ["opengrep"]` 문자열만 | 문자열 또는 객체 | trivy 는 osv-scanner 와 인자가 다르다 |
| §3.3 자리표 7개 | `{targetsCsv}` · `{targetsDir}` · `{dirs}` 를 더한다. 칸 `enabled` · `include` · `raw` · `collect` · `convertArgs` · `fingerprint` 를 더한다 | PMD · detekt 는 쉼표 목록, gitleaks `dir` 는 폴더 하나, golangci-lint 는 패키지 폴더를 받는다 |
| §3.3 osv-scanner `{lockfiles}` | `scan source -r {root}` + `trigger` 조건 | `trigger` 의 `build.gradle*` 는 osv-scanner lock 파일 인자로 못 넘긴다. `{lockfiles}` 자리표는 지원한다 |
| §3.4 `scope: modules` = 01 이 계산한 모듈 폴더 | 바꾼 파일의 가장 가까운 빌드 파일 폴더 | 01 의 모듈 ID(Gradle 경로 · uv 멤버)는 폴더가 아니다 |
| §3.5 지문에 `partialFingerprints` 를 그대로 | 빈 값을 뺀 항목으로 바탕을 만들고 순번을 붙인다 | gitleaks `dir` 의 `partialFingerprints` 는 빈 문자열이라 그대로 쓰면 같은 파일 비밀값이 한 지문이 된다 |
| §3.7 CI 는 `verify.sh` 하나만 꺼낸다 | `verify.sh` 와 `verify-entry.sh` 를 꺼낸다 | 스택 `verify.sh` 는 같은 폴더의 `verify-entry.sh` 를 source 한다. 하나만 꺼내면 head 판이나 없는 파일을 읽는다 |
| §3.7 꺼내는 설정 넷 | 기준선 `quality-baseline.json` 도 base 에서 꺼낸다 | MR 이 기준선에 자기 새 문제를 넣으면 자기 MR 을 통과시킨다 |
| §3.7 GoCD 파이프라인 하나 | 파이프라인 둘(`harness-verify` · `harness-nightly`) | GoCD timer 는 파이프라인 단위라 full 만 timer 로 돌리려면 나눠야 한다 |
| §3.3 doctor 가 Semgrep 규칙 확인을 경고 | fast 의 `check-config` 가 경고 | CLI(HK-10 작업 중)를 건드리지 않는다. doctor 연결은 나중 이슈 |
| §3.5 SARIF 2.1.0 JSON 스키마 검사 | 표준 라이브러리 구조 검사(필수 칸 · 값 종류) | 네트워크 · jsonschema 없이 돈다 |
| §3.9 커버리지 | `coverage: null`, 커버리지 분석기는 등록하지 않는다 | HK-16 요구사항(VQ-R19 목록)에서 뺐다 |
| README §8 Stop 훅 = fast | 지금 훅(changed)은 정적 분석을 건너뛴다(§9) | 토큰 · 턴 시간 |
| 스택 `.github/workflows/verify.yml` | 지우고 셋업을 `harness-setup` 액션으로 옮긴다 | PR 마다 full 이 돌아 base 판 affected 와 겹친다 |
| §3.6 게이트 하한은 `newIssues.CRITICAL` · `review.openMax.CRITICAL` | `enforceAt` 에 `affected` · `full` 이 있어야 한다는 검사를 더한다 | "엄하게만 바꾼다"를 형식 검사로 강제한다. `enforceAt: []` 은 하한 둘을 지켜도 게이트를 끈다 |
| §3.7 bootstrap 조건은 "base 에 없으면" | `--bootstrap` 은 `HX_BASE_REF` 가 풀리고 base 에 검증 코드가 없을 때만 돈다(아니면 exit 2) | fetch 실패로 `git show` 가 비면 head 판이 자기 MR 을 판정한다 |
| §3.5 정규화 | 도구 지문 · 위치가 같은 결과는 하나로 센다. 메시지의 임시 복사 폴더 · 리포 절대 경로를 뺀다 | osv-scanner 2.7.1 은 같은 취약점을 두 번 낸다. gitleaks 메시지에 `{targetsDir}` 절대 경로가 남는다(실측) |
| §3.5 기준선 갱신 거부 = 에이전트 세션 판정 | 판정에서 `CI` 표지를 뺀다 | `CI=true` 를 붙인 에이전트 세션이 CI 로 보인다 |

## 12. 확인 필요

- opengrep 이 `--config p/default`(Semgrep 레지스트리)를 받는지. 안 받으면 팀이 `rules.source` 를 opengrep 규칙 경로로 바꾼다.
- 설치하지 않은 도구(PMD · Checkstyle · detekt · ktlint · ruff · bandit · mypy · ESLint 포매터 · golangci-lint v2 · govulncheck · trivy)의 SARIF 플래그와 최소 판. 이 컴퓨터에서 확인한 것은 gitleaks 8.30.1 · semgrep 1.186.0 · osv-scanner 2.7.1 · jscpd 5.4.3 · lizard 1.26.1 이다.
- multi-harness 루트의 full 이 도메인 폴더를 다시 분석하는지(도메인 게이트도 각자 분석한다). 지금은 루트 `analyzers.json` 이 있으면 루트 전체를 분석한다.
- `packages/plugin/skills/hx-bootstrap/manifest.md` 의 `.github/workflows/verify.yml` 줄(HK-9 작업 문서)은 병합 때 `harness-verify.yml` · `harness-setup` 으로 고친다.
