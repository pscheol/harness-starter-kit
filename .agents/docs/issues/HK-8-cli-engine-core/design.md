---
key: HK-8
area: cli
type: feat
title: npx harness-kit CLI의 뼈대와 init · plan · doctor · list를 만든다
status: approved
created: 2026-11-23
---

# Design — HK-8

근거: [requirements.md](requirements.md), [설계 02](../../../../docs/design/02-cli-engine.md) §3.1~§3.11 · §3.15, [README §5 · §6](../../../../docs/design/README.md). 기준 동작은 `packages/legacy-setup/hx-bootstrap/setup.sh` + `lib/harness-lib.sh`(v1.0.8)다. 설계 02와 setup.sh가 다르면 R2.1 때문에 setup.sh를 따르고 §10에 적는다.

## 1. 패키지 구조

```text
packages/cli/
├── package.json          name harness-kit · bin dist/cli.js · engines node>=18.3 · dependencies {}
├── tsconfig.json         strict, noEmit(타입 검사만). 번들은 esbuild
├── build.mjs             esbuild → dist/cli.js 한 파일(cjs, node18, shebang, 소스 해시 머리줄)
├── scripts/src-hash.mjs  소스 해시(build.mjs · gen-plugins.mjs가 같이 쓴다)
├── vitest.config.mts     시험에 버전 상수를 넣는다
├── src/
│   ├── cli.ts            번들 진입점(실제 프로세스를 Io 로 넘긴다)
│   ├── main.ts           Node 버전 확인 → 인자 해석 → 명령 → 종료 코드(시험은 Io 를 바꿔 부른다)
│   ├── cli/              args.ts(parseArgs 2단계) · output.ts(사람 · JSON) · prompt.ts(TTY 질문)
│   ├── commands/         init.ts(plan 포함) · doctor.ts · list.ts · reserved.ts
│   └── core/             layout · selection · tokens · resolve · plan · apply · meta · lock · json · hash · fsx · templates · version · errors
└── test/                 vitest 단위 시험 + fixtures/
```

- 런타임 의존은 0개다. `node:util` parseArgs · `node:readline` · `node:fs` · `node:path` · `node:crypto` · `node:child_process`만 쓴다.
- 개발 의존: `typescript`(5.x) · `esbuild` · `vitest` · `@types/node`(18.x — Node 18에 없는 API를 쓰면 타입 검사가 실패한다).
- `pnpm -C packages/cli test` = `tsc --noEmit` + `vitest run`.

## 2. 빌드와 배포 사본

### 2.1 build.mjs

- esbuild: `bundle`, `platform: node`, `target: node18`, `format: cjs`, `absWorkingDir: packages/cli`, 버전은 `package.json`에서 `define`으로 넣는다.
- 형식이 cjs인 이유: `.js` 파일은 위쪽 `package.json`에 `"type"`이 없으면 CommonJS로 읽힌다. Node 18 · 20은 ESM 자동 판별이 없어서 esm 번들은 `import` 구문 오류로 멈춘다.
- 머리 두 줄: `#!/usr/bin/env node`, `// harness-kit <버전> · src-sha256 <64자> · 생성물(packages/cli/build.mjs)`. 끝나면 `chmod 755`.
- 같은 소스 · 같은 esbuild 판이면 바이트가 같다(경로 주석이 `packages/cli` 기준 상대 경로).

### 2.2 소스 해시

대상: `packages/cli`의 `build.mjs` · `package.json` · `tsconfig.json` · `scripts/**` · `src/**`(`.DS_Store` 제외). 값: 상대 경로 사전순으로 `"<경로>\0<sha256>\n"`을 이어 붙인 문자열의 sha256(설계 02 §3.9의 tree-sha256과 같은 식). JS(`scripts/src-hash.mjs`)와 Python(`tests/cli_dist.py`)이 같은 식을 쓴다.

### 2.3 gen-plugins.mjs

CLI 사본의 원본(`skills/hx-bootstrap/bin/harness-kit.js`, 755)은 머리줄 해시가 지금 소스 해시와 같은 번들만 쓴다.

| 상황 | 쓰기(`gen`) | `--check` |
|---|---|---|
| `dist/cli.js` 있음, 해시 같음 | dist를 복사 | dist와 바이트 · 실행 비트 비교 |
| `dist/cli.js` 있음, 해시 다름(오래된 빌드) | exit 2 `pnpm build 뒤 다시` | exit 2(같은 안내) |
| `dist/cli.js` 없음, 커밋된 사본 해시 같음 | 커밋된 사본을 원본으로 쓴다 | 커밋된 사본을 원본으로 쓴다 |
| `dist/cli.js` 없음, 사본 없음 · 해시 다름 | exit 2 `pnpm install && pnpm build` | `- skills/hx-bootstrap/bin/harness-kit.js` 1건, exit 1 |

- 빌드는 생성 스크립트 안에서 돌리지 않는다. 생성 스크립트는 Node 표준 모듈만 쓰고 `node_modules` 없이 돈다(HK-1 성질 유지). 새로 받은 저장소(dist 없음)에서도 CLI 소스를 고치지 않았으면 `gen` · `--check`가 돈다. CLI 소스를 고치면 `pnpm build`가 먼저다. 루트 `pnpm gen`이 `pnpm build && node scripts/gen-plugins.mjs`로 순서를 묶는다.
- dist가 없을 때는 소스 해시로만 사본을 본다. 사본 본문을 손으로 고치고 머리줄을 남기면 이 경우에는 잡지 못한다. dist가 있으면(개발 환경 · `pnpm build` 뒤) 바이트 비교로 잡는다.
- 같은 경로가 다른 층에 있으면 지금처럼 거부한다(겹침 검사에 CLI 사본도 넣는다).

### 2.4 무시 · 루트 스크립트

- `.gitignore`: `node_modules/`, `packages/cli/dist/`. 사본은 `plugins/harness-kit/…/bin/harness-kit.js`로 커밋한다.
- 루트 `package.json` scripts: `build`(cli 빌드) · `test:cli` · `gen`(빌드 후 생성) · `gen:check`(생성 비교만) · `test`(Python 시험, 지금 그대로).
- Python 시험이 `dist`를 쓸 때(`tests/cli_dist.py`): 해시가 맞는 `dist` → 그대로, 없거나 다르고 `node_modules/esbuild`가 있으면 `node packages/cli/build.mjs` → 그래도 없으면 해시가 맞는 플러그인 사본 → 그래도 없으면 실패와 `pnpm install && pnpm build` 안내.

## 3. layout.json (`packages/templates/layout.json`)

setup.sh · harness-lib.sh의 매핑을 데이터로 옮긴다. JSON이라 주석은 이 표에 둔다.

| 키 | 값 | 옮긴 곳 |
|---|---|---|
| `schema` | `harness-kit.layout/v1` | — |
| `ignore` | `.DS_Store` · `ABOUT`(파일 이름) | `list_layer`의 `! -name` |
| `overlap` | `first` — 같은 설치 경로가 두 레이어에 있으면 앞 레이어 판을 쓴다 | `copy_tree`의 "있으면 skip"(§10 D1) |
| `layers` | common → `domains/{domain}`(`whenExists`) → `stacks/{stack}`(`exclude: **/arch/**`) → `stacks/{stack}/arch/{arch}` → `optional/{module}`(`each: modules`, 고른 순서) | `layer_roots` · `list_layer "$root" 1` |
| `segments` | 16개, 위에서 처음 맞는 것. `from`이 `/`로 끝나거나 빈 문자열이면 접두 일치, 아니면 정확히 일치. `harness: null`은 core | `harness_agent_of` + `harness_remap` |
| `pathTokens` | `__PROJECT_SLUG__` → `PROJECT_SLUG`(값이 비면 그대로) | `harness_dest_name` |
| `executable` | `**/*.sh` · `scripts/**/*.py` · `scripts/git-hooks/**`(설치 경로 기준, `**`는 `/`를 넘는다) | `harness_is_executable` |
| `tokens` | 9개, 이 순서로 차례로 치환 | `HARNESS_TOKENS` |
| `harnesses` · `harnessDetect` · `defaultHarnesses` | 4종, 폴더 · 환경변수 감지 규칙, 감지 0개면 `claude` | `HARNESS_ALL_AGENTS` · `harness_detect_agents` |
| `modules` · `domains` | 3종 · 2종(유효 이름. 폴더 유무와 별개) | `HARNESS_ALL_MODULES` · `HARNESS_ALL_DOMAINS` |
| `defaultStack` · `stacks` · `stackFallback` | 기본 jvm. 스택마다 `domain` · `defaultArch` · `tokens` · (jvm) `lang`. 표에 없는 스택 폴더는 `defaultArch: hexagonal`, 도메인 없음, 토큰 기본값 없음 | `STACK` 기본값 · `harness_domain_of` · `harness_default_arch` · 스택별 `case` |
| `tokenDefaults` | `PROJECT_SLUG={targetBasename}` · `PROJECT_NAME={PROJECT_SLUG}` · `SERVICE_NAME={PROJECT_SLUG}` · `PROTECTED_PATH=docs/references` | setup.sh 297~303행 |

- 스택 · 변형 목록은 `stacks/*` · `stacks/<스택>/arch/*` 폴더에서 읽는다.
- 레이어의 `layer` 값(lock)은 치환한 `dir`이다: `common`, `domains/frontend`, `stacks/jvm`, `stacks/jvm/arch/hexagonal`, `optional/jira-workflow`.
- 시험 `layout-lib.test.ts`가 템플릿 파일 462개 전부를 bash `harness_agent_of` · `harness_remap` · `harness_dest_name` · `harness_is_executable`에 넣은 결과와 layout.json 해석 결과를 비교한다(설계 02 §3.15 선행 시험). 한쪽만 고치면 깨진다.

## 4. 해석

### 4.1 선택값

| 값 | 우선순위 · 검사 | 오류 |
|---|---|---|
| stack | `--stack` > TTY 질문 > `defaultStack`. `stacks/<값>/` 폴더가 있어야 한다 | exit 2, 가능한 목록 |
| arch | `--arch` > 질문 > 스택 `defaultArch`. `arch/<값>/` 폴더 | exit 2 |
| domain | `--domain` > 스택 `domain`. `domains` 안의 이름. 폴더가 없으면 레이어만 건너뛴다(backend) | exit 2 |
| lang | `--lang`, 스택에 `lang` 표가 있을 때만(jvm). `PRIMARY_LANGUAGE` 기본값을 바꾼다 | exit 2 |
| agents | `--agents`(쉼표 · 공백, `all`) > 질문 > 감지 > `defaultHarnesses`. 적은 순서 유지, 중복 제거 | 모르는 이름 · 빈 값 exit 2 |
| modules | `--modules`(`all` · `none`) > 질문 > 없음. 적은 순서가 레이어 순서다 | 모르는 이름 exit 2, 폴더 없음 exit 5 |

STACK · ARCH · HARNESS_AGENTS 같은 환경변수는 읽지 않는다(설계 02 §3.3은 토큰만 환경변수를 읽는다).

### 4.2 토큰

- 값: 플래그(`--name` `--slug` `--package-ns` `--protected-path` `--token K=V`) > 같은 이름 환경변수(빈 값은 없는 것으로 본다, `${V:-기본}`과 같다) > 스택 · `lang` 기본값 > `tokenDefaults`. `{PROJECT_SLUG}`는 앞에서 정한 값, `{targetBasename}`은 대상 폴더 이름이다.
- 치환: `tokens` 순서대로 `{{KEY}}`를 리터럴로 모두 바꾼다(`split`/`join`, 정규식 · `$&` 해석 없음). 값이 빈 문자열이면 그 토큰은 남는다. 앞 토큰 값에 뒤 토큰이 들어 있으면 그것도 바뀐다(sed `-e` 순서와 같다).
- NUL 바이트가 있는 파일은 치환하지 않는다(지금 템플릿에는 없다).
- `--slug`는 `/` · NUL · `.` · `..`를 받지 않는다(경로 이름이 된다). exit 2.

### 4.3 후보와 이기는 판

레이어마다 파일을 바이트 순으로 걷고, `ignore` · `exclude`를 빼고, 첫 세그먼트를 찾는다. 하네스 세그먼트인데 그 하네스를 고르지 않았으면 `excludedByHarness`로 센다. 설치 경로 = `to + 나머지`에 경로 토큰 적용. 같은 설치 경로의 후보가 둘 이상이면 `overlap: first`로 첫 후보가 이기고 나머지는 `overlaps`로 보고한다.

## 5. 작업 목록과 적용

### 5.1 판정(P17은 `op: copy`만)

| 대상 파일 상태 | 기본 | `--force` | `--adopt` |
|---|---|---|---|
| 없음 | create | create | create |
| 파일, 바이트 = 원하는 내용 | same | same(실행 비트가 다르면 replace) | skip-user |
| 파일, 다름 | skip-user | replace | skip-user |
| 폴더 · 그 밖 | skip-user(`파일이 아니다`) | skip-user | skip-user |

- lock 항목: create · replace · same → `owner: kit`, `sha256` = 원하는 내용의 해시, `layer`. skip-user → `owner: user`, `sha256: null`, `layer`.
- 경로 검사: 절대 경로 · `..` · `.git` 조각이 있으면 계획 단계에서 exit 3. 쓰기 전에 가장 가까운 이미 있는 상위 폴더의 실제 경로가 대상 폴더 안인지 본다(링크로 리포 밖을 가리키면 exit 3).
- `--adopt`와 `--force`를 같이 주면 exit 2.

### 5.2 적용 순서

1. 대상 폴더를 만든다(`mkdir -p`). 이미 설치됨(`.agents/harness-kit.json` 있음)이면 아무것도 쓰지 않고 exit 3, `update` · `add` 안내.
2. 파일: 같은 폴더의 임시 파일(`.<이름>.hk-<난수>`)에 `mode 0666`(실행 파일 `0777`)로 만들고 `rename`. 모드는 umask를 거친다 — setup.sh의 `sed > tmp && mv` + `chmod +x`와 같은 결과(umask 022 → 644 · 755).
3. `.agents/harness.json`(하네스 매니페스트): setup.sh `harness_write_manifest`와 같은 바이트. 있어도 덮는다(setup.sh와 같다). lock에는 적지 않는다(v1 lock과 같은 범위).
4. `tools/docs/` 아래 작업이 모두 킷 판이고 `python3`가 있으면 `python3 tools/docs/feature_docs.py build`(stdout 버림, §10 D17). 실패하면 경고만 하고 계속한다(setup.sh와 같다).
5. lock v2, 마지막에 메타 v2. 메타가 "설치됨" 판정이므로 중간에 멈추면 `init`을 다시 돌려 같은 결과를 얻는다(이미 쓴 파일은 same).

쓰기 오류 `EACCES` · `EPERM` · `EROFS`는 exit 5.

## 6. 메타 v2 · lock v2

### 6.1 메타 `.agents/harness-kit.json`

init이 쓰는 키(README §5 순서): `schema` `harness-kit/v2` · `kit.version` · `project.name` · `project.slug` · `stack` · `arch` · `domain` · `agents` · `modules` · `flow`(`design: kit`, `record: none`, 게이트 9개) · `issueKey`(`--issue-source` 기본 `kit`, `--issue-prefix` 기본 `PROJECT_SLUG` 대문자) · `git`(`base` = `--base` 기본 `develop`, `worktreeRoot` `../{repo}.worktrees`, `maxPerRepo` 3, `ide` `code`) · `packs` `[]` · `verify.fullOnlyInCI` `true` · `tokens`(9개 전부, 빈 값 포함) · `installedAt` · `updatedAt`(오늘, `YYYY-MM-DD`).

- 쓰기: 아는 키는 위 순서, 모르는 키는 원래 순서로 뒤에 둔다. 들여쓰기 2칸, 끝 줄바꿈. 값이 스칼라뿐인 배열은 한 줄(`["claude", "codex"]`) — v1 `harness_meta_list`(한 줄 배열을 `sed`로 읽는다)가 그대로 읽는다.
- 읽기: `schema`가 `harness-kit/v2`면 v2. `kitVersion`이 있으면 v1로 보고 메모리에서 v2로 바꾼다(02 §3.8 표, v1.1 기본값 `issueKey` · `git.base` · `verify.fullOnlyInCI`). 그 밖 · 해석 실패는 `meta-invalid`.

### 6.2 lock `.agents/harness-kit.lock`

- 쓰기: `schema` `harness-kit.lock/v2` · `kit.version` · `kit.source` · `packs: []` · `entries`(`path` 사전순, 같은 경로 한 줄, 항목은 한 줄 JSON).
- `kit.source`: `--templates` · `HARNESS_KIT_TEMPLATES`를 썼거나 모노레포 `packages/templates`면 `file:<템플릿 폴더>`, CLI 파일이 `bin/` 안이면 `plugin:harness-kit@<버전>`, 그 밖은 `npm:harness-kit@<버전>`.
- 읽기 v1(TSV): 02 §3.9 규칙 1~4. 라벨 `common` → `common`, `frontend` · `backend` → `domains/<값>`, `<s>/<a>` → `stacks/<s>/arch/<a>`, `mod/<m>` → `optional/<m>`, 그 밖 `<s>` → `stacks/<s>`. 해시 `-` → `null`. 같은 경로가 여러 줄이면 뒤 줄의 `layer`, 앞 줄의 `sha256`.

## 7. 명령

| 명령 | 하는 일 | 코드 |
|---|---|---|
| `init` | §4 해석 → §5 계획 → 적용. TTY이고 `--yes` · `--json`이 없으면 빠진 값(스택 · 변형 · 하네스 · 모듈)을 묻고 마지막에 `진행할까? [Y/n]`. `--dry-run`이면 `plan`과 같다 | 0 2 3 5 130 |
| `plan` | 계획만 출력한다. 쓰지 않는다(대상 폴더도 만들지 않는다) | 0 2 3 5 |
| `doctor` | 읽기만 한다. `--check`면 오류가 하나라도 있을 때 exit 1. `--only <종류,…>`로 거른다 | 0 1 2 3 |
| `list` | 메타 요약. `--files`면 lock 항목을 주인 · 작업 종류별로 | 0 3 |
| `add` `remove` `update` `outdated` `repair` `uninstall` | "P17 다음 조각" 안내 | 2 |
| `pack` · `dashboard` `skills` `status` `projects` `sessions` `dispatch` `usage` `answer` `flow` · `intake` `approve` `mob` `units` · `review` `quality` · `deploy` `ops` `metrics` `rules` `sync` | 제공 단계(P18 · P20 · P21 · P23 · P24) 안내 | 2 |

- 공통 플래그: `--cwd` `--dry-run` `--yes` `--json` `--templates` `--no-color` `--quiet` `--help`. `--version`(`-v`) · `--help`(`-h`)는 명령 없이도 받는다. 명령별로 모르는 플래그는 exit 2.
- Node 확인: `process.versions.node`가 18.3 미만이면 다른 일을 하기 전에 exit 5와 `Node 18.3 이상이 필요하다(지금 vX)`(§10 D18).
- 템플릿 자리: `--templates` > `HARNESS_KIT_TEMPLATES` > `<CLI 폴더>/../templates`(플러그인 `bin/` 옆, npm 패키지) > `<CLI 폴더>/../../templates`(모노레포 `packages/cli/dist`). `layout.json`이 있는 첫 폴더. 없으면 exit 5.
- `--json`: stdout에 JSON 객체 하나. 오류도 `{"command", "error": {"code", "message"}}`로 stdout에 낸다. stderr에는 쓰지 않는다(§10 D9).
- 사람용 출력은 요약 위주다. `plan`은 작업 목록 전체(`--quiet`면 create가 아닌 것만), `init`은 요약과 create가 아닌 항목(skip-user · replace)만 적는다. JSON도 같은 규칙으로 `ops`를 담는다.
- 플래그 중 `--install-tools` · `--no-register`(외부 도구 설치 · 전역 등록부)는 이번 조각에 없다(모르는 플래그로 exit 2).

### 7.1 doctor 검사(이번 조각)

| 검사 | 판정 | 등급 |
|---|---|---|
| 메타 | `meta-invalid`(없으면 exit 3 "설치 안 됨") | 오류 |
| lock | `lock-invalid`(없음 · 해석 실패) · `lock-v1` | 오류 · 정보 |
| 킷 버전 | 메타 · lock · CLI 비교 → `version-mismatch` | 경고(설치 > CLI면 오류) |
| copy 항목(`owner: kit`) | `ok` · `drifted`(sha(C) ≠ B 또는 B = null) · `missing` | — · 정보 · 오류 |
| `.gitignore` | `.agents/state/` · `.agents/local/` · `.agents/reports/` 중 빠진 것 → `gitignore` 1건 | 경고 |
| 진입 파일 | `AGENTS.md` + `CLAUDE.md` > 24,576바이트 → `entry-size` | 경고 |

`ok`는 요약 수로만 내고 발견 목록에는 넣지 않는다. 버전 비교는 semver(사전 출시 태그 포함)로 한다.

## 8. 모듈

| 파일 | 책임 |
|---|---|
| `core/errors.ts` | `CliError(code, message, hint?)` · 종료 코드 상수 |
| `core/version.ts` | 빌드 때 넣은 버전 · Node 버전 확인 · semver 비교 |
| `core/json.ts` | 결정적 JSON 쓰기(스칼라 배열 한 줄, 객체 배열은 항목마다 한 줄) |
| `core/hash.ts` | sha256 |
| `core/fsx.ts` | 파일 걷기(바이트 순) · 원자적 쓰기 · 안쪽 경로 검사 |
| `core/templates.ts` | 템플릿 자리 찾기 · `kit.source` |
| `core/layout.ts` | layout.json 읽기 · 검사 · 세그먼트 · glob · 실행 비트 · 경로 토큰 |
| `core/selection.ts` | §4.1 선택값 · 하네스 감지 |
| `core/tokens.ts` | §4.2 값 정하기 · 치환 |
| `core/resolve.ts` | §4.3 후보 · 이기는 판 |
| `core/plan.ts` | §5.1 작업 목록 · 개수 |
| `core/apply.ts` | §5.2 적용 |
| `core/meta.ts` · `core/lock.ts` | §6 읽기 · 쓰기 |
| `commands/*.ts` | 명령별 흐름과 출력 객체 |
| `cli/args.ts` · `cli/output.ts` · `cli/prompt.ts` | 인자 · 출력 · 질문 |
| `main.ts` | 진입점 |

## 9. 시험 계획

### 9.1 단위(vitest, `packages/cli/test/`)

| 파일 | 본다 |
|---|---|
| `layout.test.ts` | 세그먼트 첫 일치 · 정확 일치(`root/CLAUDE.md`) · glob(`**`가 `/`를 넘는다) · 실행 비트 · 경로 토큰 · 깨진 layout.json 거부 |
| `layout-lib.test.ts` | 템플릿 전부: layout.json 해석 = bash harness-lib.sh 4함수. 같은 레이어 안 겹침 0 |
| `tokens.test.ts` | 우선순위 4단계 · `lang` · 빈 값 남김 · `&` · `|` · `\` · `$&` 리터럴 · 순서 치환 · NUL 파일 |
| `selection.test.ts` | 오류 exit 2(스택 · 변형 · 도메인 · lang · 하네스 · 모듈) · `all` · `none` · 순서 · 감지(폴더 · 환경 · 기본) |
| `plan.test.ts` | fixture 템플릿: 겹침 first · 하네스 제외 수 · create/same/skip-user/replace · `--adopt` · `--force` · `..` 거부 · 링크로 밖을 가리키면 거부 |
| `state.test.ts` | json · 메타 · lock: 형식 · 키 순서 · 모르는 키 보존 · v1 메타 → v2 · v1 lock 규칙 1~4 · v2 정렬 · 왕복 |
| `cli.test.ts` | `main(argv)`: `--version` · 모르는 명령 · 예약 명령 단계 · 모르는 플래그 · 두 번째 init exit 3 · `--dry-run` 쓰기 0 · 모든 명령 `--json` 한 객체 · 메타 v1.1 기본값 · lock v2 · Node 16 · 18.2 → exit 5 · 프로토타입 이름 명령 · 사람 tools/docs 면 기능 문서 건너뜀 |
| `doctor.test.ts` | 새 설치 `--check` 0 · 파일 삭제 → missing · exit 1 · 수정 → drifted · 쓰기 0(전후 트리 같음) · gitignore · entry-size · v1 lock → lock-v1 · 메타 깨짐 |

### 9.2 동일성(`tests/test_cli_parity.py`)

조합마다 `<tmp>/sh/<슬러그>`와 `<tmp>/cli/<슬러그>`(같은 폴더 이름)에 같은 환경 토큰으로 setup.sh와 `node <cli> init --yes --cwd …`을 돌린다. 비교: 파일 목록(파일 · 링크) · 바이트 · 권한 비트(`mode & 0o777`). 제외: `.agents/harness-kit.lock` · `.agents/harness-kit.json`. 둘은 의미 비교(스택 · 변형 · 도메인 · 하네스 · 모듈 · 토큰, lock 경로 집합과 경로별 해시). 이어서 두 설치본에 `doctor --check`가 exit 0. 조합은 스레드 4개로 동시에 돈다.

| # | 스택 · 변형 | 하네스 | 모듈 | 노리는 것 |
|---|---|---|---|---|
| 1~5 | jvm · python · go · web · electron, 기본 변형 | all | none | 스택 5개 |
| 6 | jvm · layered-multimodule `--lang=kotlin` | all | jira-workflow | lang 토큰 · 모듈 세그먼트 |
| 7 | jvm · hexagonal-standalone | claude,codex | platform-guards | 겹치는 경로 4개(first) |
| 8 | python · django | claude,kiro | multi-harness | Kiro 5종 · `__PROJECT_SLUG__` |
| 9 | go · feature | cursor | none | Cursor만 |
| 10 | web · feature-sliced | claude | platform-guards,jira-workflow | 모듈 순서 |
| 11 | electron · monorepo | kiro | none | 도메인 + Kiro만 |
| 12 | jvm · modulith, `AGENTS.md` · `.claude/settings.json` 미리 있음 | all | none | 있는 파일 건너뛰기 |
| 13 | python · modular | all | all | 모듈 전부 |
| 14 | jvm · hexagonal | claude | none | Claude만 |
| 15 | go · flat `--domain=frontend` | codex | none | 도메인 직접 지정 |
| 16 | web · react-spa, `PROJECT_SLUG` · `PROJECT_NAME` 없음 | claude | none | 슬러그 기본값(폴더 이름) |
| 17~24 | 남은 변형 8개(jvm 4 · python 2 · go 1 · electron 1) | all | none | 변형 전부(23개) |

### 9.3 번들 · 생성물

- `test_cli_parity.py`의 번들 시험: `cli.js`만 빈 폴더에 복사해 `--version` · 템플릿 없음 exit 5 · `--templates`로 plan(node_modules 없이), 번들 옆 템플릿 찾기, Node 버전을 16 · 18.2로 꾸며 exit 5(아무것도 쓰지 않음), `require` 가 `node:` 모듈뿐, `package.json` `dependencies` 비어 있음 · engines `>=18.3`.
- `test_generated.py`: 플러그인 사본이 있고 실행 비트가 있고 머리줄 해시 = 소스 해시. 소스를 고친 복사본에서 `--check`가 실패(exit 1 또는 2).

## 10. 설계와 다른 점

| # | 설계 02 | 이 구현 | 이유 |
|---|---|---|---|
| D1 | 같은 경로는 뒤 레이어 우선, setup.sh도 고친다(§3.5) | `overlap: first`(앞 레이어 판). layout.json 값 하나로 바꾼다 | setup.sh를 고치지 않는다(다른 작업과 겹침). R2.1은 setup.sh 결과를 따른다. setup.sh를 고치면 `last`로 바꾸고 동일성 시험이 확인한다 |
| D2 | setup.sh `harness_subst`가 `&` · `|` · `\`를 이스케이프하게 고치고 시험 #8에 `R&D|Lab`(§3.6 · §3.15) | CLI는 리터럴 치환. 동일성 시험은 그런 값을 넣지 않고, 단위 시험이 CLI 쪽만 본다 | setup.sh가 그 값에서 다르게(또는 sed 오류로) 동작한다. setup.sh 수정은 범위 밖 |
| D3 | `ignore`에 `module.json` | `.DS_Store` · `ABOUT`만 | setup.sh가 `module.json`을 빼지 않는다. 지금 그런 파일은 0개 |
| D4 | stack 레이어 `exclude: arch/**` | `**/arch/**` | setup.sh `! -path "*/arch/*"`는 깊이와 상관없이 뺀다. 지금 결과는 같다 |
| D5 | `executable`에 `scripts/git-hooks/*` | `scripts/git-hooks/**` | bash `case`의 `*`는 `/`를 넘는다 |
| D6 | 작업 목록에 템플릿 파일만 | `.agents/harness.json`을 `generated`로 따로 보고하고 쓴다. lock에는 없다 | setup.sh가 매번 쓰는 파일이다. 빠지면 동일성이 깨진다 |
| D7 | lock을 마지막에 쓴다(§3.7) | 메타를 마지막에 쓴다 | init의 "설치됨" 판정이 메타다. 메타가 마지막이어야 멈춘 init을 다시 돌릴 수 있다 |
| D8 | `plan` 코드 0 · 2 | 이미 설치된 리포에서 exit 3 | `plan` = `init --dry-run`. 스킬이 plan에서 미리 알게 한다 |
| D9 | `--json`이면 사람용 줄을 stderr로 | stderr에 쓰지 않는다 | 스킬이 JSON 하나만 받는다. 세션에 붙는 출력이 늘지 않는다 |
| D10 | 메타에 README §5 기본값(roles · approvers · groups · risk · codebase · intake · versions 포함) | `flow` · `issueKey` · `git` · `packs` · `verify` · `tokens`만 | 나머지 키를 읽는 기능이 P18~P22에 생긴다. 그때 메타 병합으로 더한다(모르는 키 보존) |
| D11 | init 플래그 `--install-tools` · `--no-register` | 없음 | 외부 도구 모듈(P22) · 전역 등록부(06 §3.17)가 이번 범위 밖 |
| D12 | §3.15 규칙 3: `docs/features/` 날짜 문자열을 지운 뒤 비교 | 그대로 비교 | 생성물에 날짜가 없다. 같은 환경에서 두 번 설치하면 바이트가 같다 |
| D13 | §3.11 "doctor와 check_layout.py 판정이 같다" | 시험하지 않는다 | `check_layout.py`는 P18 |
| D14 | 매니페스트 값 그대로 삽입 | `.agents/harness.json` 값은 JSON 이스케이프 | `"`가 든 이름에서 setup.sh는 깨진 JSON을 쓴다. 보통 값에서는 바이트가 같다 |
| D15 | 종료 코드 표(§3.2)에 내부 오류가 없다 | 예상하지 못한 예외는 `내부 오류: …`와 exit 1 | Node 기본값과 같다. `doctor --check`의 1과 구별하려면 메시지를 본다 |
| D16 | 하네스 폴더 · 템플릿 파일 자리의 링크(§3.12 원칙) | 설치 경로가 링크면 skip-user. 상위 폴더가 끊어진 링크이거나 링크로 리포 밖을 가리키면 exit 3. 상위 경로가 파일이면 그 아래는 skip-user | setup.sh는 링크를 따라 쓰고(`cp`), 상위가 파일이면 `mkdir -p`에서 멈춘다. 동일성 조합에는 둘 다 없다 |
| D17 | 설치 끝에 `feature_docs.py build`를 돌린다(setup.sh와 같다) | `tools/docs/` 아래 작업이 모두 킷 판(create · replace · same)일 때만 돌린다. 하나라도 skip-user면 건너뛴다 | 사람이 둔 `tools/docs/` 코드를 `init`이 실행하지 않게 한다(검토 지적). 빈 폴더 설치와 동일성 조합에서는 결과가 같다 |
| D18 | R1.1 "Node 18 이상", engines `>=18` | engines `>=18.3`, 18.3 미만이면 exit 5 | `util.parseArgs`가 18.3에 들어왔다. 18.0~18.2에서는 모든 명령이 TypeError로 멈춘다 |
| D19 | §3.5 모듈 목록에서 `all` · `none` | 모르는 이름을 먼저 모두 거부한 뒤 `all` · `none`을 본다 | setup.sh는 `bogus,all`을 전체로 받는다. 파일 결과는 같고 오타를 놓치지 않는다 |

## 11. 확인 필요

- 사람이 정할 것: D1(`overlap`을 `last`로 바꿀 시점과 setup.sh 수정 담당), D2(setup.sh 이스케이프 수정 담당).
- 첫 설치마다 doctor가 `gitignore` 경고 1건을 낸다. 스택 5개의 `root/.gitignore`에 `.agents/state/` · `.agents/local/` · `.agents/reports/`가 없다. 템플릿 수정은 이 이슈 범위 밖이다.
