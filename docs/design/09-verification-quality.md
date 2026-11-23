# 09. 검증 확장: 리뷰 · 정적 분석 · 품질 게이트 · 승인 강제

- 단계: P23(v2.5). 선행: P18. 검증 레벨과 `verify.sh` 범위 계산은 01, CI 템플릿의 자리는 P19(05).
- 방향과 이유: [02 #verify](../harness-next/02-direction.html#verify) · [02 #verify-scope](../harness-next/02-direction.html#verify-scope) · [02 #roles](../harness-next/02-direction.html#roles) · [05 #principles](../harness-next/05-principles.html#principles) · [05 #people](../harness-next/05-principles.html#people) · [03 #p23](../harness-next/03-plan.html#p23) · D8 · D10
- 승인 기록 형식: 06 §3.7. 이 문서는 게이트 조건과 강제 장치를 정한다.

## 1. 목적·범위

MR마다 코드 리뷰 · 보안 스캔 · 품질 지표 · 승인 기록이 남고, 심각한 지적이나 새 CRITICAL이 열려 있거나 승인 기록이 없으면 다음 단계로 가지 못하게 한다. SonarQube 없이 오픈소스 분석기 조합으로 한다(D8).

범위에 넣는 것: `/hx-review`, `/hx-scan`, 분석기 등록 파일 `.agents/analyzers.json`, 검증 레벨별 실행, SARIF 정리와 변환기, 기준선과 새 문제 판정, `quality-gate.json`, CI 템플릿 단계, 게이트 조건표, 승인 강제(훅 · git 훅 · CI), 대시보드용 지표.

범위 밖: 분석기 설치(사람·CI 이미지가 한다), Semgrep 규칙 배포, 리뷰 모델 선택(12), 대시보드 화면(06).

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| VQ-R1 | `/hx-review <MR>`은 기능 브랜치를 체크아웃하지 않고 원격 브랜치의 diff · SDD 세 문서 · 규칙 · 스캔 결과를 읽는다. |
| VQ-R2 | `/hx-review`는 발견마다 ID · 심각도 · 위치 · 근거 · 권고 · 지문을 `.agents/reports/review/<이슈키>.md`에 쓰고, MR 요약 코멘트 하나를 만들거나 고친다. |
| VQ-R3 | 리뷰 세션은 이슈 폴더의 `review.md`를 쓰지 않는다. 구현 세션이 지적 처리 결과를 `review.md`에 쓰고 커밋한다. |
| VQ-R4 | 열린 CRITICAL · HIGH 리뷰 지적이 있으면 `mr` 게이트 승인은 거부되고 `verify.sh --full`은 실패한다. |
| VQ-R5 | 분석기는 `.agents/analyzers.json`에 등록된 것만 돌고, 검증 레벨이 그 분석기의 `levels`에 있을 때만 돈다. |
| VQ-R6 | 의존성 분석기는 lock 파일이 바뀐 `changed`·`affected` 실행과 모든 `full` 실행에서만 돈다. |
| VQ-R7 | `required: true`인 분석기가 설치돼 있지 않으면 로컬 검증 결과는 `incomplete`이고 CI 검증은 실패한다. |
| VQ-R8 | 모든 분석기 결과는 SARIF 2.1.0으로 `.agents/reports/sarif/`에 모인다. SARIF를 내지 못하는 도구는 킷 변환기가 바꾼다. |
| VQ-R9 | 품질 게이트는 기준선에 없는 문제(새 문제)만 막는다. 기준선의 문제는 보고만 한다. |
| VQ-R10 | 줄 번호가 바뀌어도 같은 문제는 같은 지문을 갖는다. |
| VQ-R11 | MR 파이프라인은 검증 코드(`scripts/verify.sh` · `scripts/harness/`)와 검증 설정(`verify-checks.json` · `quality-gate.json` · `analyzers.json` · `deploy.json`)을 병합 대상(base) 브랜치에서 꺼내 판정한다. MR이 바꾼 판은 병합 뒤부터 적용된다. |
| VQ-R12 | 에이전트 세션은 `approvals.md` · `quality-baseline.json` · 대시보드 토큰 파일을 쓰지 못한다. |
| VQ-R13 | `tasks.md` 머리를 `state: completed`로 바꾸는 편집에 유효한 `done` 승인 기록이 없으면 훅이 막고, `verify.sh fast`도 실패한다. |
| VQ-R14 | `approvals.md`의 기존 줄을 바꾸거나 지우는 커밋은 pre-commit 훅과 CI가 거부한다. |
| VQ-R15 | 사람 터미널 승인 명령은 에이전트 세션 안이거나 TTY가 아니면 거부한다. |
| VQ-R16 | 세 CI 템플릿(GitHub Actions · GitLab CI · GoCD)의 검증 단계는 `scripts/verify.sh`만, 선택 배포 단계(14 §3.5)는 `scripts/harness/deploy.py`만 부른다. |
| VQ-R17 | MR에는 킷이 남기는 요약 코멘트가 하나만 있다. |
| VQ-R18 | Semgrep 공식 규칙은 킷에 넣지 않고 실행할 때 받는다. |
| VQ-R19 | 검증 실행마다 분석기별 문제 수(전체·새 것) · 중복률 · 복잡도 초과 함수 수 · 커버리지 · 소요 시간을 지표 파일에 남긴다. |

## 3. 설계

### 3.1 `/hx-review`

역할 원본 `.agents/roles/reviewer.md`, 기본 하네스 `roles.review.harness`(D7 추천값 codex). 읽는 세션이라 worktree를 만들지 않는다.

입력 수집:

```text
/hx-review <MR>            # GitLab "!123", GitHub "#45", 또는 브랜치 이름
1. MR 정보: glab mr view <iid> -F json · gh pr view <n> --json headRefName,baseRefName,headRefOid
2. git fetch origin <head> <base>
3. diff = git diff --find-renames origin/<base>...origin/<head>
4. 이슈 키 = 브랜치 이름의 키. SDD = git show origin/<head>:.agents/docs/issues/<키>-<이름>/{requirements,design,tasks}.md
5. 규칙 = base의 .agents/rules/*.md 중 pr-review-policy.md, security·api 표준, ADR(.agents/docs/decisions/)
6. 스캔 결과 = CI 산출물(glab job artifact · gh run download) → 없으면 .agents/reports/findings-latest.json(같은 head SHA일 때만)
7. 이전 리뷰 = .agents/reports/review/<키>.md(있으면), 그 브랜치의 review.md
```

점검표(ID는 발견의 `check` 필드에 남는다):

| ID | 보는 것 | 근거 |
|---|---|---|
| `RV-COV` | requirements의 `R#` · `SC-#`마다 코드 위치와 시험 이름이 있는가. 없으면 누락 | requirements §4, diff |
| `RV-ADR` | design의 선택과 ADR을 따르는가, 버린 대안을 구현했는가 | design, decisions/ |
| `RV-RULE` | 보안 · API 표준 · 코드 유지 규칙 | `.agents/rules/` |
| `RV-EDGE` | 동시성 · 권한 · 경계값 · 실패 경로 · 재시도 · 시간대 | diff, design |
| `RV-TEST` | `R#`마다 시험 1개 이상, 실패 경로 시험, 고친 버그의 회귀 시험 | diff의 test 파일 |
| `RV-SCAN` | 스캔 새 문제의 해석: 실제 위험인지, 오탐 근거, 우선순위 | findings |
| `RV-DOC` | 기능 문서·API 문서 갱신이 필요한 변경인가 | `docs/features/` 배정 |

리뷰 보고서 `.agents/reports/review/<키>.md`(커밋 안 함):

```markdown
---
issue: HDRV3D-12
mr: "!123"
head: 4c1d9e0
base: develop
reviewer: { harness: codex, role: reviewer }
reviewedAt: 2026-11-24T09:12:00+09:00
verdict: changes-required        # approve | changes-required
counts: { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 1 }
---

## F-1 · HIGH · RV-EDGE
- 위치: src/upload/CleanupJob.kt:88
- 근거: 같은 파일을 두 작업자가 동시에 지울 때 존재 확인과 삭제 사이에 잠금이 없다(design §4.2 "중복 실행 없음")
- 실패 시나리오: 작업자 2개 동시 실행 → 두 번째 delete가 NoSuchFile 예외 → 작업 전체 실패
- 권고: delete 결과를 무시하는 idempotent 삭제로 바꾸고 동시 실행 시험을 더한다
- 지문: 5d1e8a…
```

- 발견은 7개까지 본문에 쓰고 나머지는 `counts`와 `## 나머지` 목록(위치·한 줄)으로 둔다.
- 지문 = `sha256(check + "\0" + 경로 + "\0" + 정규화한 해당 줄 ±1줄)`. 정규화는 공백 묶기와 앞뒤 공백 제거다. 다시 리뷰할 때 같은 지문은 같은 ID를 이어 쓴다.

MR 코멘트(VQ-R17): 코멘트 하나에 표시 `<!-- harness-kit:mr-summary -->`를 넣고, 그 안을 `<!-- section:review -->` · `<!-- section:scan -->` 구간으로 나눈다. `/hx-review`는 review 구간만, CI 보고 작업은 scan 구간만 고친다. 코멘트가 없으면 만들고, 있으면 고친다(GitLab `glab api -X PUT projects/:id/merge_requests/:iid/notes/:note_id`, GitHub `gh api -X PATCH repos/{o}/{r}/issues/comments/{id}`). review 구간 내용: 판정, 심각도별 수, 상위 발견 7개의 위치·한 줄, 대시보드 안내.

구현 세션의 `review.md`(이슈 폴더, 커밋함):

```markdown
# 리뷰 처리 — HDRV3D-12

| ID | 심각도 | 지문 | 처리 | 커밋 | 사유 |
|---|---|---|---|---|---|
| F-1 | HIGH | 5d1e8a… | 수용 | 9a7b2c1 | idempotent 삭제 + 동시 실행 시험 |
| F-2 | MEDIUM | 0c44f1… | 거절 제안 | — | 레거시 경로, 다음 Unit에서 교체(U-4) |
```

지적이 닫히는 조건:

- `수용`: 표의 커밋이 그 브랜치에 있고, 그 뒤 head로 다시 돈 `/hx-review`가 같은 지문을 보고하지 않는다.
- `거절 제안`: 사람이 관리 페이지에서 `review/F-n · risk-accepted`를 `approvals.md`에 남겼다(06 §3.7). CRITICAL · HIGH의 거절은 이 기록 없이는 닫히지 않는다. MEDIUM · LOW는 `거절 제안`만으로 닫힌다.

`수용`한 지적 중 같은 점검 ID가 30일 안에 이슈 2개 이상에서 나오면 규칙 후보가 된다(14 §3.11).

열린 CRITICAL · HIGH 계산은 `scripts/harness/review_state.py <이슈 폴더> --report <리뷰 보고서>`가 한다. 대시보드(06), `mr` 게이트(§3.8), `verify.sh --full`이 이것을 부른다. 리뷰 보고서가 로컬에 없는 CI에서는 MR 요약 코멘트의 review 구간 수치를 읽는다.

### 3.2 `/hx-scan`

`/hx-scan`은 판정하지 않는다. 판정은 `verify.sh`다.

1. `.agents/reports/findings-latest.json`의 `head`가 현재 HEAD와 다르거나 없으면 `bash scripts/verify.sh --affected`를 부른다(분석기는 그 안에서 돈다).
2. 새 문제를 심각도 · 분석기 · 경로로 묶고, 같은 규칙이 5건 넘게 반복되면 한 줄로 묶어 보여 준다.
3. 새 문제마다 오탐 근거를 찾고 `RV-SCAN` 해석을 낸다. 예외 등록은 사람이 한다(§3.5 `accepted`).

### 3.3 분석기 등록 `.agents/analyzers.json`

킷이 스택에 맞춰 깔고, 팀이 고친다. MR 파이프라인은 base 브랜치의 이 파일을 쓴다(VQ-R11).

```json
{
  "schema": "harness-kit.analyzers/v1",
  "analyzers": [
    {
      "id": "gitleaks", "layer": "common", "category": "secret", "required": true,
      "levels": ["changed", "affected", "full"], "scope": "files",
      "cmd": ["gitleaks", "dir", "{targets}", "--report-format", "sarif", "--report-path", "{out}", "--exit-code", "0"],
      "sarif": "native", "versionCmd": ["gitleaks", "version"], "minVersion": "8.19.0",
      "timeoutSec": 120, "license": "MIT"
    },
    {
      "id": "semgrep", "layer": "common", "category": "security", "required": true, "alternatives": ["opengrep"],
      "levels": ["changed", "affected", "full"], "scope": "files",
      "cmd": ["semgrep", "scan", "--config", "{rules}", "--sarif", "--output", "{out}", "--metrics", "off", "{targets}"],
      "rules": { "source": "registry:p/default", "license": "Semgrep Rules License v1.0", "bundled": false },
      "sarif": "native", "timeoutSec": 300, "license": "LGPL-2.1"
    },
    {
      "id": "osv-scanner", "layer": "common", "category": "dependency", "required": true, "alternatives": ["trivy"],
      "levels": ["changed", "affected", "full"], "scope": "lockfiles",
      "trigger": ["**/package-lock.json", "**/pnpm-lock.yaml", "**/uv.lock", "**/poetry.lock", "**/go.sum", "**/gradle.lockfile", "**/build.gradle*", "**/pom.xml"],
      "cmd": ["osv-scanner", "scan", "--format", "sarif", "--output", "{out}", "{lockfiles}"],
      "sarif": "native", "timeoutSec": 300, "license": "Apache-2.0"
    },
    {
      "id": "jscpd", "layer": "common", "category": "duplication", "required": false,
      "levels": ["affected", "full"], "scope": "modules",
      "cmd": ["jscpd", "--reporters", "json", "--output", "{tmp}", "--min-lines", "10", "{modules}"],
      "sarif": "convert:jscpd", "timeoutSec": 300, "license": "MIT"
    },
    {
      "id": "lizard", "layer": "common", "category": "complexity", "required": false,
      "levels": ["changed", "affected", "full"], "scope": "files",
      "cmd": ["lizard", "--csv", "{targets}"], "stdout": "{tmp}/lizard.csv",
      "sarif": "convert:lizard", "timeoutSec": 180, "license": "MIT"
    }
  ]
}
```

| 필드 | 뜻 |
|---|---|
| `layer` | `common` · `stack:<스택>`(jvm · python · web · electron · go) |
| `category` | `security` · `secret` · `dependency` · `duplication` · `complexity` · `lint` · `bug` · `type` · `coverage` |
| `scope` | `files`(바꾼 파일) · `modules`(01이 계산한 모듈 폴더) · `repo` · `lockfiles` |
| `cmd` 자리표 | `{targets}` 파일·모듈 목록, `{modules}`, `{lockfiles}`, `{out}` SARIF 경로, `{tmp}` 임시 폴더, `{rules}`, `{root}` |
| `sarif` | `native` · `convert:<변환기>` · `none`(지표만, 예: 커버리지) |
| `alternatives` | 같은 자리를 맡는 다른 도구. 앞의 것이 없으면 다음 것을 쓴다 |
| `required` | 없으면 `incomplete`(로컬) · 실패(CI)인지(VQ-R7) |

스택 층 기본값(도구 이름·SARIF 출력 방법; 플래그는 각 도구 최신 문서로 다시 확인한다, §6):

| 스택 | 분석기 | SARIF |
|---|---|---|
| 공통 | Semgrep CE 또는 Opengrep · gitleaks · OSV-Scanner 또는 Trivy · jscpd · lizard | native · native · native · 변환 · 변환 |
| jvm | PMD(`-f sarif`) · Checkstyle(SARIF 포매터) · SpotBugs + Find Security Bugs(Gradle·Maven 플러그인, SARIF 출력) · detekt(`--report sarif:`) · ktlint(`--reporter=sarif`) · JaCoCo(XML → 지표) | native ×5, 커버리지는 `none` |
| python | Ruff(`--output-format sarif`, S 규칙 포함) · Bandit(`-f sarif`) · mypy(`-O json` → 변환) · coverage.py(`json` → 지표) | native · native · 변환 · `none` |
| web · electron | ESLint + 보안 플러그인(SARIF 포매터) · TypeScript strict(`tsc --noEmit` 출력 → 변환) · c8 · istanbul(`json-summary` → 지표) | native · 변환 · `none` |
| go | golangci-lint(gosec 포함, SARIF 출력) · govulncheck(`-format sarif`) · `go test -coverprofile` → 지표 | native · native · `none` |

Semgrep 규칙(VQ-R18): `rules.bundled`는 항상 `false`다. `semgrep --config p/default`는 실행할 때 레지스트리에서 받는다. 레지스트리 규칙 라이선스 조건이 팀에 맞지 않으면 `alternatives`의 Opengrep과 그 규칙 저장소를 쓴다. doctor는 `semgrep`이 켜져 있고 `harness-kit.json`에 `analyzers.semgrepRulesAcknowledged: true`가 없으면 경고한다.

### 3.4 검증 레벨별 실행

`verify.sh`는 01이 정한 레벨 계산 뒤 `scripts/harness/verify_static.py --level <레벨> --files … --modules …`를 부른다. `verify_static.py`(지금 있음)를 등록 파일을 읽도록 바꾼다.

| 레벨 | 도는 분석기 | 목표 시간 |
|---|---|---|
| `fast` | 없음. `analyzers.json` · `quality-gate.json` 형식 검사만 | 2초 |
| `changed` | `scope: files`이고 `levels`에 `changed`가 있는 것(gitleaks · Semgrep · 스택 린터 · lizard). lock 파일이 바뀌었으면 의존성 분석기 | 정적 분석 합계 60초 |
| `affected` | `changed` 전부 + `scope: modules`(SpotBugs · mypy · tsc · jscpd · 커버리지 · govulncheck) | 정적 분석 합계 5분 |
| `full`(CI만) | 전부, `scope: repo`, 의존성 분석 항상 | 제한 없음 |

- 분석기는 서로 독립이라 동시 4개까지 돌린다. 하나가 `timeoutSec`을 넘으면 그 분석기만 `timeout`으로 `incomplete`.
- 화면 출력은 분석기마다 한 줄(이름 · 새 문제 수 · 시간)이고, 자세한 내용은 파일에만 둔다(12 §3.8).

### 3.5 SARIF 정리, 변환기, 기준선

출력 자리:

```text
.agents/reports/
├── sarif/<runId>/<분석기>.sarif     runId = <레벨>-<YYYYMMDDHHmmss>-<head 7자>
├── sarif/latest/ → <runId>          마지막 실행(심볼릭 링크, 안 되면 복사)
├── findings-latest.json              정규화한 발견 목록(대시보드·게이트 입력)
├── quality-gate-last.json            게이트 판정
└── metrics/latest.json · metrics/<YYYY-MM-DD>.jsonl
```

정규화(`scripts/harness/sarif/normalize.py`):

1. `artifactLocation.uri`를 리포 상대 POSIX 경로로 바꾸고 `uriBaseId: "%SRCROOT%"`를 붙인다. 리포 밖 경로 결과는 버린다.
2. 심각도: `properties.security-severity`(CVSS)가 있으면 9.0 이상 CRITICAL, 7.0 이상 HIGH, 4.0 이상 MEDIUM, 그 아래 LOW. 없으면 `level` `error` → HIGH, `warning` → MEDIUM, `note`·`none` → LOW. `category: secret`은 항상 CRITICAL. 분석기별 덮어쓰기는 `analyzers.json`의 `severityMap`으로 한다.
3. 지문: 도구의 `partialFingerprints`가 있으면 그것, 없으면 `sha256(ruleId + "\0" + 경로 + "\0" + 정규화한 줄 내용 + "\0" + 같은 (규칙·경로·내용) 안의 순번)`. 줄 번호는 넣지 않는다(VQ-R10). 파일 이름이 바뀐 경우 `git diff -M --name-status base...head`의 이름 바뀜 표로 기준선 경로를 옮겨 비교한다.

변환기 계약: `python3 scripts/harness/sarif/<이름>.py --in <원본> --out <sarif> [--threshold …]`, 결과 정렬 고정(경로 → 줄 → 규칙), 발견이 있어도 exit 0, 원본을 못 읽으면 exit 2.

| 변환기 | 입력 | 결과 |
|---|---|---|
| `jscpd` | `jscpd-report.json`의 `duplicates[]` | 쌍마다 결과 1개, `ruleId: jscpd/duplicate`, `level: warning`, 위치 2개(첫·둘째 조각), `properties: {lines, tokens, format}` |
| `lizard` | `--csv` 열 `NLOC, CCN, token, PARAM, length, location, file, function, long_name, start, end` | CCN이 `complexity.functionMaxCcn`을 넘는 함수마다 `ruleId: lizard/ccn`, `level: warning`, `properties: {ccn, nloc, function}`. 전체 함수 분포는 지표 파일로 |
| `mypy` | `-O json` 줄마다 JSON | `ruleId: mypy/<code>`, `level`은 `severity` 그대로 |
| `tsc` | `파일(줄,열): error TSxxxx: 메시지` | `ruleId: tsc/TSxxxx`, `level: error` |

기준선 `.agents/quality-baseline.json`(커밋함, 에이전트 쓰기 금지):

```json
{
  "schema": "harness-kit.quality-baseline/v1",
  "commit": "a1b2c3d", "createdAt": "2026-11-20T02:00:00Z",
  "findings": {
    "semgrep": { "5d1e8a…": { "ruleId": "java.lang.security.audit.sqli", "path": "src/legacy/Report.java", "severity": "HIGH" } },
    "lizard":  { "0b77c2…": { "ruleId": "lizard/ccn", "path": "src/legacy/Parser.kt", "severity": "MEDIUM", "ccn": 31 } }
  },
  "metrics": { "duplicationPercent": 4.2, "functionsOverCcn": 37 },
  "accepted": [
    { "fingerprint": "c90a…", "analyzer": "gitleaks", "reason": "테스트 고정값, 실제 키 아님", "by": "kim@example.com", "until": "2027-03-31" }
  ]
}
```

- 새 문제 = 지문이 그 분석기의 `findings`에 없고 `accepted`에도 없는 발견.
- `accepted`의 `until`은 등록일부터 180일 이하. 지난 항목은 무시하고 doctor가 경고한다.
- 갱신: `python3 scripts/harness/quality.py baseline --update`. base 브랜치 HEAD에서 `full` 결과로만 만든다(CI 야간 작업 또는 사람 터미널). 이 명령은 에이전트 세션에서 거부한다(§3.8과 같은 판정).
- 처음 도입할 때 기준선이 없으면 첫 `full` 실행 결과로 만들고, 그 전까지 게이트는 `warn`으로만 돈다.

새 코드 판정:

- 중복률 = (바뀐 줄 중 jscpd 중복 조각에 든 줄 수) ÷ (바뀐 줄 수) × 100. 바뀐 줄이 `minChangedLines`(기본 50) 미만이면 판정하지 않는다.
- 복잡도: diff의 바뀐 줄과 범위가 겹치는 함수 중 CCN이 기준을 넘는 것. 기준선에 없던 함수거나 기준선보다 CCN이 늘었으면 위반, 기준선보다 같거나 줄었으면 보고만 한다.

### 3.6 `.agents/quality-gate.json`

```json
{
  "schema": "harness-kit.quality-gate/v1",
  "newIssues": { "CRITICAL": 0, "HIGH": null, "MEDIUM": null, "LOW": null },
  "duplication": { "newCodeMaxPercent": 3.0, "minChangedLines": 50 },
  "complexity": { "functionMaxCcn": 15, "mode": "new-or-worsened" },
  "coverage": { "newCodeMinPercent": null },
  "dependencies": { "blockAtSeverity": "CRITICAL" },
  "review": { "openMax": { "CRITICAL": 0, "HIGH": 0 } },
  "enforceAt": ["affected", "full"],
  "warnAt": ["changed"]
}
```

- 숫자는 허용 최대 건수, `null`은 보고만 한다. 기본값은 새 CRITICAL 0건 · 새 코드 중복 3% 이하 · 함수 복잡도 15 이하(02 #verify 제안값).
- 회사 팩·프로젝트는 값을 엄하게만 바꿀 수 있다. 게이트 하한(04)은 `newIssues.CRITICAL = 0`과 `review.openMax.CRITICAL = 0`이다. 개인 층은 이 파일을 덮지 못한다.
- `changed`에서는 위반을 경고로만 보이고, `affected` · `full`에서 실패시킨다.

판정 결과 `.agents/reports/quality-gate-last.json`:

```json
{
  "schema": "harness-kit.quality-gate-result/v1",
  "level": "affected", "head": "4c1d9e0", "base": "develop", "status": "failed",
  "checks": [
    { "id": "newIssues.CRITICAL", "value": 1, "limit": 0, "status": "failed", "items": ["semgrep:5d1e8a…"] },
    { "id": "duplication.newCodeMaxPercent", "value": 1.8, "limit": 3.0, "status": "passed" },
    { "id": "complexity.functionMaxCcn", "value": 1, "limit": 0, "status": "failed", "items": ["src/upload/CleanupJob.kt:cleanup ccn 19"] }
  ],
  "incomplete": [ { "analyzer": "spotbugs", "reason": "not-installed" } ]
}
```

### 3.7 CI 템플릿

세 템플릿의 검증 단계는 `scripts/verify.sh`만 부른다(VQ-R16). base 브랜치 이름은 환경 변수 `HX_BASE_REF`로 넘기고 해석은 01을 따른다.

MR 파이프라인은 base 판으로 판정한다(VQ-R11):

```text
1. git show $HX_BASE_REF:scripts/verify.sh > .agents/state/verify-base.sh
   base에 없으면(하네스를 처음 들이는 MR) head 판 scripts/verify.sh --affected로 판정하고 코멘트에 bootstrap을 적는다
2. bash .agents/state/verify-base.sh --from-base $HX_BASE_REF --affected
   base 판 verify.sh가 scripts/harness/와 검증 설정 넷(verify-checks · quality-gate · analyzers · deploy)을
   git archive로 .agents/state/ci-base/에 꺼낸다(base에 없는 경로는 뺀다). HX_TOOLS_DIR · HX_GATE_CONFIG_DIR로
   그 판을 가리킨 채 판정한다. 판정 대상(작업 트리)은 MR head이고, 리포 루트는 현재 폴더에서 찾는다(README §10)
3. MR이 위 경로를 바꿨으면 정보용 작업 harness:affected-head가 head 판으로 한 번 더 돌린다.
   이 작업은 실패해도 MR을 막지 않고, 두 판의 결과 차이를 요약 코멘트 scan 구간에 적는다
```

- 브랜치가 검사 단계를 지우거나 `verify.sh`를 `exit 0`으로 바꿔도 그 MR의 판정은 base 판이 한다. 바뀐 판은 병합 뒤 다음 MR부터 적용된다.
- `full`(야간 · 릴리스)은 base에서 돌기 때문에 꺼내기가 없다.
- CI 진입 파일(`.github/workflows/harness-verify.yml` · `.gitlab-ci.yml` · `ci/harness-kit.gitlab-ci.yml`)도 MR에서 바뀔 수 있다. 이 파일들과 위 경로는 코드 소유자 규칙(GitHub `CODEOWNERS` + 보호 브랜치의 코드 소유자 승인, GitLab 코드 소유자 승인)으로 `approvers.mr` 그룹의 승인을 요구한다. `doctor`가 규칙 파일에 이 경로들이 있는지 본다.

| 단계 | 언제 | 명령 | 산출물 |
|---|---|---|---|
| fast | 모든 push · MR | `bash scripts/verify.sh --fast` | — |
| affected | MR | base 판 `verify.sh --from-base <base> --affected`(위 1~2, 정적 분석 · 품질 게이트 · 게이트 조건 검사 포함) | `.agents/reports/**` |
| full | 야간 schedule · 릴리스 태그 | `bash scripts/verify.sh --full` | `.agents/reports/**`, 기준선 갱신은 별도 수동 작업 |
| 보고 | affected · full 끝(실패해도) | 별도 명령 없음. `verify.sh`가 `CI=true`이고 MR 정보가 있으면 마지막에 요약 코멘트 scan 구간을 고친다(§6) | MR 요약 코멘트, SARIF 업로드(GitHub는 별도 step) |

GitHub Actions(`.github/workflows/harness-verify.yml`):

```yaml
on:
  pull_request:
  push: { branches: [develop] }
  schedule: [{ cron: "0 18 * * *" }]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: bash scripts/verify.sh --fast
      - if: github.event_name == 'pull_request'
        env: { HX_BASE_REF: "origin/${{ github.base_ref }}" }
        run: |
          mkdir -p .agents/state
          git show "$HX_BASE_REF:scripts/verify.sh" > .agents/state/verify-base.sh || true
          if [ -s .agents/state/verify-base.sh ]; then bash .agents/state/verify-base.sh --from-base "$HX_BASE_REF" --affected; else bash scripts/verify.sh --affected --bootstrap; fi
      - if: github.event_name == 'schedule'
        run: bash scripts/verify.sh --full
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: .agents/reports/sarif/latest }
```

GitLab CI: 리포의 `.gitlab-ci.yml`이 킷 템플릿을 include한다.

```yaml
include:
  - local: ci/harness-kit.gitlab-ci.yml        # 킷이 깐 파일(주인 kit)
# ci/harness-kit.gitlab-ci.yml
stages: [fast, affected, full]
harness:fast:
  stage: fast
  script: [bash scripts/verify.sh --fast]
harness:affected:
  stage: affected
  rules: [{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }]
  variables: { HX_BASE_REF: "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME", GIT_DEPTH: "0" }
  script:
    - mkdir -p .agents/state
    - git show "$HX_BASE_REF:scripts/verify.sh" > .agents/state/verify-base.sh || true
    - if [ -s .agents/state/verify-base.sh ]; then bash .agents/state/verify-base.sh --from-base "$HX_BASE_REF" --affected; else bash scripts/verify.sh --affected --bootstrap; fi
  artifacts: { when: always, paths: [.agents/reports/], expire_in: 14 days }
harness:full:
  stage: full
  rules: [{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]
  script: [bash scripts/verify.sh --full]
  artifacts: { when: always, paths: [.agents/reports/], expire_in: 30 days }
```

GoCD(`harness.gocd.yaml`): 파이프라인 하나에 stage `fast` → `affected`(MR 브랜치 재료일 때) → `full`(timer), 각 job의 task는 `bash scripts/verify.sh <레벨>` 한 줄, artifact는 `.agents/reports`. GoCD에는 MR 개념이 없어 브랜치 플러그인 재료의 base를 `HX_BASE_REF`로 넘긴다.

### 3.8 게이트 조건과 승인 강제

게이트 조건(대시보드 06 §3.3·§3.7, 설계 08 §3.6, `verify.sh`가 같은 표를 쓴다. 구현은 `scripts/harness/sdd_gates.py`와 대시보드 Node 모듈, 같은 fixture로 시험한다):

| 게이트 | 통과 조건 |
|---|---|
| `codebase` | (접수 종류 `feature` · `change` · `refactor`일 때) Intent `approvals.md`에 `codebase · approved` 기록, 기록한 `current-state.md`와 참조 모델 sha = 현재(08 §3.13) |
| `intent` | (`codebase`가 해당하면 통과) Intent `approvals.md`에 `intent · approved` 기록, 승인자 유효, 기록한 `intent.md`·`units.json` sha = 현재 |
| `plans` | `intent` 통과, `plans/*.md` 각각 승인 기록 sha = 현재 |
| `requirements` | (Intent에 속하면 `plans` 통과 — `flow.gates`에 있을 때) `requirements.md` `status: approved` + 유효한 기록, 막는 게이트가 `requirements`인 열린 질문 0, `[NEEDS CLARIFICATION` 0 |
| `design` | `requirements` 통과, `design.md` 같은 조건, `dependsOn` 계약 이슈의 design 통과, design §13 배포 · 롤백 칸(14 §3.2 DO-R1) |
| `tasks` | `design` 통과, `tasks.md` `status: approved` + 유효한 기록 |
| `mr` | `tasks` 통과, 같은 head의 `affected` 검증 `passed`, 품질 게이트 `passed`, 열린 리뷰 CRITICAL · HIGH 0, `mr · approved` 기록 |
| `done` | `mr` 통과, 이슈 브랜치가 base에 병합됨, `done · approved` 기록 |
| `deploy` | 14 §3.4의 D1~D7: 포함 이슈 `done` 통과, 계획(design §13) 승인 유효, 롤백 시험 통과 또는 사람이 넣은 면제, 배포 커밋의 `full` 통과, 배포 점검표, 승인자, (켰으면) 검증 환경 E2E 통과. 승인 대상은 배포 기록의 계획 구간 |

`flow.gates`에 없는 게이트는 조건에서 빠진다. 하한 네 게이트(requirements · design · mr · done)는 뺄 수 없다(04). 이슈 머리 `risk`가 `high`이면(또는 `mr` 판정 때 diff가 `risk.highPaths`에 걸리면) design · mr · deploy는 서로 다른 승인자 `risk.highApprovals`명(기본 2)의 기록이 있어야 통과한다(08 §3.15).

강제 장치:

| 무엇을 막나 | Claude Code | Codex · Kiro | git 훅 | CI(`verify.sh`) |
|---|---|---|---|---|
| 에이전트가 `**/approvals.md` · `.agents/quality-baseline.json` · `.agents/state/dashboard.token` · `.agents/state/approvals-log.jsonl`를 쓰거나 읽음(토큰) | 설정 `permissions.deny`에 `Edit(//**/approvals.md)` 등 병합, PreToolUse 훅 `protect-sources.sh` 확장(Bash 명령의 경로·리다이렉션 검사) | 각 하네스 PreToolUse 훅(§6) | — | — |
| `approvals.md` 기존 줄 변경·삭제 | — | — | pre-commit: `git diff --cached -U0`에 `-` 줄이 있으면 거부, 새 기록 형식 검사 | fast: base 대비 같은 검사 |
| 승인 없이 `status: approved` | PreToolUse: 저장할 내용의 머리가 `approved`로 바뀌면 거부 | 같음 | pre-commit | fast: `sdd_gates.py check` |
| 승인 없이 `state: completed`(VQ-R13) | PreToolUse: `tasks.md` 머리가 `completed`로 바뀔 때 `done` 기록 검사 | 같음 | pre-commit | fast |
| 열린 CRITICAL · HIGH 상태로 병합 | — | — | — | affected·full: `review_state.py` |
| base 브랜치 직접 push | `permissions.deny`: `Bash(git push * develop*)` 등 base 이름으로 생성 | 각 하네스 deny | pre-push: 에이전트 세션이고 대상이 base면 거부 | 서버 보호 브랜치 설정(사람이 켠다, doctor가 안내) |
| 검증 코드 · 게이트 설정 자기 완화 | — | — | — | MR은 base의 `verify.sh` · `scripts/harness/` · 검증 설정으로 판정한다(VQ-R11, §3.7). CI 진입 파일은 코드 소유자 승인 |

에이전트 세션 판정은 06 §3.11과 같다(`CLAUDECODE=1`, 메시지 소켓 변수, 하네스 변수, 부모 프로세스). pre-commit·pre-push는 사람 커밋을 막지 않도록 이 판정이 참일 때만 에이전트 규칙을 적용한다. `approvals.md` 덧붙이기 검사는 사람·에이전트 모두에게 적용한다.

사람 터미널 승인(VQ-R15):

```text
python3 scripts/harness/approve.py <이슈키|Intent키|deploy:<배포 기록 이름>> <게이트> [--changes-requested [--rule-candidate]]
        [--waive-rollback "<사유>"] --phrase "<문구>"
(Node가 있는 리포는 npx harness-kit approve <대상> --gate <게이트> … 로 같은 일을 한다, 06 §3.15. 아래 절차는 둘 다 같다)
1. 에이전트 세션 판정이 참이면 exit 3 "에이전트 세션에서는 승인하지 못한다"
2. stdin·stdout이 TTY가 아니면 exit 3
3. 대상 문서와 sha256, 게이트 조건(위 표), [NEEDS CLARIFICATION] 검사 — 대시보드와 같은 순서(06 §3.7 3~8)
4. "확인하려면 이슈 키를 입력한다:" — 입력이 키와 다르면 exit 1
5. approvals.md 덧붙이기(경로: terminal), 문서 status 변경, 로컬 기록
```

승인 어휘 규칙(`.agents/rules/approval-vocabulary.md`): 채팅에서 한 말은 어떤 말이든 승인이 아니다. "좋아" · "OK" · "반영해" · "push해" · "머지해" · "배포해"가 모두 같다. 게이트 승인은 네 경로로만 생긴다.

| 경로 | 방법 | `approvals.md`의 `경로` |
|---|---|---|
| 사람 터미널 | `npx harness-kit approve`(Node 없는 리포는 `approve.py`) | `terminal` |
| 관리 페이지 | 승인 버튼(PIN) | `dashboard` |
| Jira | 사람이 한 승인 전이를 `sync jira --approvals`로 가져온다(10 §3.4) | `jira` |
| AI-DLC(켰을 때) | AI-DLC 사람 입력 확인 훅이 받은 승인을 `sync aidlc`가 옮긴다. 기록에 승인자가 있을 때만(10 §3.2) | `aidlc` |

- 승인할 때 사람이 넣은 문구는 그 승인 기록의 `문구` 줄에 남는다(06 §3.7). 문구는 기록이고, 문구만으로 승인이 생기지는 않는다.
- 대화의 "반영해 · push해 · 머지해"는 그 대화의 커밋 · push · 병합 지시로 쓸 수 있다. 게이트 조건을 대신하지 못해서, 병합은 `mr` 게이트가 통과해야 되고 base 직접 push는 막힌다.
- AI-DLC 승인은 사람 입력을 AI-DLC 훅이 확인한 것이라 채팅과 다르다. 그래서 옮겨 인정하고(출처 `source: aidlc`), AI-DLC 세션의 그 밖의 대화는 승인이 아니다.
- 몹 정리 회의에서 말로 한 결정도 승인이 아니다. 승인자가 자기 컴퓨터에서 위 경로로 승인한다(08 §3.14).

위조 경고: `verify.sh fast`는 `경로: dashboard`인 기록의 `기록 ID`가 이 컴퓨터의 `.agents/state/approvals-log.jsonl`에 없고, 그 기록을 더한 커밋이 이 컴퓨터에서 만들어졌으면(커밋 시각이 로그 최초 시각 이후) 경고한다. 다른 사람 컴퓨터의 승인은 판정하지 않는다.

### 3.9 대시보드용 지표

`metrics/<YYYY-MM-DD>.jsonl`에 실행마다 한 줄, `metrics/latest.json`에 마지막 값:

```json
{
  "schema": "harness-kit.metrics/v1",
  "at": "2026-11-24T09:30:11+09:00", "level": "affected", "head": "4c1d9e0", "branch": "feat/HDRV3D-12-upload-cleanup",
  "analyzers": {
    "semgrep": { "total": 12, "new": 1, "bySeverity": { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 9, "LOW": 2 }, "seconds": 41.2 },
    "gitleaks": { "total": 0, "new": 0, "seconds": 3.1 }
  },
  "duplication": { "newCodePercent": 1.8, "repoPercent": 4.1 },
  "complexity": { "functionsOverCcn": 38, "newOrWorsened": 1, "maxCcn": 31 },
  "coverage": { "linePercent": 78.4, "newCodePercent": 91.0 },
  "gate": "failed",
  "review": { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 1 }
}
```

대시보드 검증 탭(06 §3.13)은 이 파일로 심각도별 문제, 중복률, 복잡도, 커버리지, base 브랜치 최근 30회 추세를 그린다. 이슈별 사람 개입 수(`approvals.md`의 `changes-requested` · `risk-accepted` 수), 요구사항 → 병합 리드타임(Intent 생성 커밋 → 병합 커밋)은 git과 승인 기록에서 계산한다(04 #measure). 자기 보고 값은 쓰지 않는다. 배포까지의 전달 지표(리드 타임 · 배포 실패율 · 복구 시간 · 승인 대기 시간 · 재작업 비율)와 도입 전 기준선은 14 §3.10이다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| SonarQube Community Build | 브랜치·MR 분석과 일부 보안 규칙이 유료 판에만 있고, 서버를 운영해야 한다(D8) |
| 기존 문제까지 모두 막는 게이트 | 도입 첫날 모든 MR이 막힌다. 기준선으로 새 문제만 막는다 |
| 줄 번호가 든 지문 | 위에 한 줄만 더해도 모든 문제가 새 문제가 된다 |
| Semgrep 레지스트리 규칙을 킷에 복사 | 2024-12부터 별도 규칙 라이선스가 붙는다. 실행 때 받는다 |
| 리뷰 세션이 기능 브랜치를 체크아웃 | 읽는 세션이 worktree를 만들게 되고(D5), 구현 세션 파일과 섞인다 |
| 리뷰 세션이 `review.md`를 직접 커밋 | 리뷰 세션은 기능 브랜치를 체크아웃하지 않는다. 처리 결과의 주인은 구현 세션이다 |
| MR 헤드의 `quality-gate.json` · `verify-checks.json` · `verify.sh` 사용 | 같은 MR에서 기준을 낮추거나 검사 단계를 지워 자기 MR을 통과시킬 수 있다 |
| 채팅의 정해진 낱말("반영해" 등)을 승인으로 센다 | 에이전트가 사람 말을 지어내거나 잘못 읽어도 막을 장치가 없다. 승인은 사람만 쓸 수 있는 경로(README §3의 넷)로만 받는다 |
| 대시보드 승인과 터미널 승인을 같은 Python 스크립트 하나로 | 대시보드가 스크립트를 부르는 경로를 에이전트도 쓸 수 있다. 두 구현 + 같은 fixture로 같게 묶는다 |
| 분석기를 모두 `changed`에서 실행 | SpotBugs·커버리지는 모듈 빌드가 필요해 `changed` 목표 시간(1~3분)을 넘는다 |

## 5. 완료 기준

1. fixture에 심은 결함 3종(비밀값, 문자열로 조립한 SQL, 알려진 취약 의존성)을 `affected` 실행이 모두 새 CRITICAL·HIGH로 잡고 품질 게이트가 `failed`다.
2. requirements의 `R2.1` 하나를 구현하지 않은 fixture MR에서 `/hx-review`가 `RV-COV` 발견으로 `R2.1`을 보고한다.
3. 시험: 열린 HIGH 리뷰 지적이 있으면 `verify.sh --full`이 exit 1이고, `approvals.md`에 `review/F-1 · risk-accepted`를 더하면 통과한다.
4. 시험: 승인 기록 없이 `tasks.md`를 `state: completed`로 바꾸는 Claude Edit 도구 호출을 훅이 막는다. 같은 변경을 git으로 커밋하면 `verify.sh --fast`가 실패한다.
5. 시험: `approvals.md`의 기존 줄 하나를 바꾼 커밋을 pre-commit이 거부하고, 훅을 건너뛴 커밋은 CI fast가 거부한다.
6. 시험: `CLAUDECODE=1`에서 `approve.py`가 exit 3, TTY 없는 실행도 exit 3.
7. 줄 50개를 파일 위에 더한 fixture에서 기준선 문제 20건이 새 문제 0건으로 판정된다. 파일 이름만 바꾼 fixture도 새 문제 0건.
8. jscpd·lizard·mypy·tsc 변환기 출력이 SARIF 2.1.0 JSON 스키마 검사를 통과하고, 같은 입력에 두 번 돌린 출력 바이트가 같다.
9. 세 CI 템플릿 파일의 검증 단계에서 실행하는 명령이 base 판 · head 판 `verify.sh`뿐이고, 배포 단계는 `deploy.py`뿐이다(템플릿 lint 시험). MR 헤드에서 `quality-gate.json` 기준을 낮춘 fixture, `verify-checks.json`의 단계를 지운 fixture, `verify.sh`를 `exit 0`으로 바꾼 fixture가 모두 base 판으로 판정되어 실패한다. base에 `verify.sh`가 없는 fixture는 `bootstrap`으로 head 판이 돈다.
10. 다시 리뷰해도 MR 요약 코멘트 수가 1이다(GitLab·GitHub 각각 수동 점검 1회).
11. `changed` 레벨 정적 분석 합계가 jvm 예시 리포(파일 1개 변경)에서 60초 이하.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| 도구별 SARIF 플래그와 최소 버전(Checkstyle·SpotBugs·detekt·ktlint·ESLint 포매터·golangci-lint v1/v2·govulncheck·Bandit) | 각 도구 최신 문서와 `--help`로 확인해 `analyzers.json` 기본값과 `minVersion`에 적는다 |
| GitLab이 SARIF를 MR 보안 위젯에 받는지(자체 SAST 형식만 받는지) | GitLab 문서 확인. 안 되면 산출물 + 요약 코멘트만 쓴다 |
| CI 작업이 MR 코멘트를 쓸 권한(GitLab `CI_JOB_TOKEN` 범위, 프로젝트 토큰 필요 여부) | 현장 GitLab에서 시험 MR로 확인 |
| report 단계를 `verify.sh`의 어느 인자로 부를지(계약 §7 인자에 없다) | 01·02와 정해 계약 §7에 더하거나, affected·full 끝에서 자동으로 돌게 한다 |
| Codex·Kiro PreToolUse 훅이 파일 쓰기 도구 입력(경로·새 내용)을 주는지 | 각 하네스에서 훅 입력을 기록해 본다. 안 되면 git 훅·CI 검사만으로 막는다고 문서에 적는다 |
| Claude `permissions.deny` 경로 패턴(`Edit(//**/approvals.md)`)이 worktree 경로에도 걸리는지 | worktree에서 연 세션으로 시험한다(03의 worktree 훅 시험과 같이) |
| GitHub `upload-sarif`가 여러 파일 폴더와 `%SRCROOT%`를 받는지 | 시험 리포에서 확인 |
| CI 진입 파일을 MR에서 바꾸는 경로를 코드 소유자 규칙보다 강하게 막을지(GitHub `pull_request_target`로 base 워크플로 실행, GitLab 파이프라인 실행 정책) | 두 플랫폼 요금제별 지원과 head 코드를 비밀값 없이 돌리는 설정을 시험 리포에서 확인한다 |
