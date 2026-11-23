# 02. CLI 엔진 — 설치·업데이트·점검·복구·제거

- 단계: P17(v2.0.0-alpha). 계획: [harness-next 03장 P17](../harness-next/03-plan.html#p17).
- 근거: [02장 설치 엔진과 배치](../harness-next/02-direction.html#engine) · [02장 다른 도구와 같은 리포에서](../harness-next/02-direction.html#coexist) · D3.
- 설정·lock 형식은 [README §5·§6](README.md#5-agentsharness-kitjson), 명령 이름은 [README §7](README.md#7-명령-이름)을 따른다.

## 1. 목적·범위

에이전트 세션 없이 `npx harness-kit` 한 줄로 v1.0.8과 같은 결과를 설치하고, 점검·복구·제거까지 한다.

| 범위 | 내용 |
|---|---|
| 넣는다 | 모노레포 구조(3.1), `packages/cli/src/`(TypeScript → `dist/cli.js` 번들 하나), `packages/templates/layout.json`, lock v2 읽기·쓰기, v1 lock(TSV)·v1 메타 읽기, `init`·`plan`·`add`·`remove`·`update`·`outdated`·`doctor`·`repair`·`uninstall`·`list`, 플러그인 스킬의 CLI 호출, setup.sh와의 결과 동일성 시험 |
| P17에서 작업 종류 | `copy`만 쓴다(v1.0.8과 같은 결과). 엔진은 `mirror`·`render`·`merge`·`none`을 모두 읽고 쓰지만, 그것을 만드는 하네스 어댑터는 P18([03](03-projection-and-hooks.md)) |
| 이름만 둔다 | `dashboard`(P20, 06) · `skills`(P20, 07) · `sync`(P24) · `pack new`(P18, [04](04-extension-layers.md)). P17에서는 exit 2와 제공 단계를 출력한다 |
| 넣지 않는다 | 리포 스크립트(`verify.sh`·`worktree.py`·`check_layout.py`)는 Python 그대로. 매일 쓰는 명령은 Node 없이 돈다 |

## 2. 요구사항

- R1.1 Node 18 이상에서 `npx harness-kit <명령>`이 돈다. Node가 18 미만이면 exit 5와 필요한 버전을 출력한다.
- R1.2 `dist/cli.js`는 파일 하나이고, 런타임에 `node_modules`의 패키지를 읽지 않는다. `package.json`의 `dependencies`는 비어 있다.
- R2.1 `init`은 같은 선택값에서 setup.sh와 같은 파일 목록·내용·실행 권한을 만든다(lock·메타 파일 제외).
- R2.2 `init`은 쓰기 전에 전체 작업 목록을 만들고, `--dry-run`이면 목록만 출력한다.
- R2.3 이미 설치된 리포(`.agents/harness-kit.json` 있음)에서 `init`은 exit 3으로 끝나고 `update`·`add`를 안내한다.
- R3.1 `update`는 킷이 깐 뒤 사람이 고치지 않은 파일만 교체하고, 고친 파일은 `<경로>.new`로 옆에 둔다.
- R3.2 `update`는 v1 lock을 읽고 v2로 쓴다. v1 메타는 v2 메타로 바꾼다.
- R3.3 `update`는 주인이 `user`·`external:*`인 파일과 팩 파일(팩 갱신이 아닐 때)을 쓰지 않는다.
- R4.1 `doctor`는 아무것도 쓰지 않는다. `--check`면 오류 등급 발견이 하나라도 있을 때 exit 1.
- R4.2 새 설치 직후 `doctor --check`는 exit 0.
- R5.1 `repair`는 `missing`·`stale`·생성물의 `drifted`와 병합 키 누락을 되돌리고, 사람이 고친 템플릿 복사 파일(`copy`)은 건드리지 않는다.
- R6.1 `uninstall`은 킷 소유이면서 고치지 않은 파일을 지우고, 병합한 설정에서 킷 몫만 뺀다. 고친 파일은 남기고 목록을 출력한다.
- R7.1 플러그인 스킬 `hx-bootstrap`·`hx-update`·`hx-agent-add`는 CLI를 부른다. Node가 없거나 18 미만이면 setup.sh·update.sh·add-agent.sh로 내려간다(v2.0 한 버전 동안).
- R8.1 모든 명령은 `--json`을 받고, 사람용 출력과 같은 정보를 JSON 한 개로 stdout에 낸다.

## 3. 설계

### 3.1 킷 저장소 구조(모노레포)

원본은 `packages/` 한 곳에 두고, 배포 형식(Claude · Codex 플러그인, Kiro 설치, npm)은 원본에서 만든다. 지금(v1.0.8)은 템플릿 459개를 포함한 킷 전체가 Claude 플러그인의 스킬 폴더(`packages/templates/`) 안에 있어서, 배포 경로가 늘 때마다 그 폴더를 거치도록 휘어진다.

```text
harness-starter-kit/
├── package.json                      private, 워크스페이스 루트. scripts: build · test · release
├── pnpm-workspace.yaml               packages/*
├── packages/
│   ├── cli/                          npm "harness-kit", bin { "harness-kit": "dist/cli.js" }, engines { "node": ">=18" }
│   │   ├── src/
│   │   │   ├── main.ts               인자 해석(node:util parseArgs) → 명령 실행 → exit code
│   │   │   ├── commands/             init.ts plan.ts add.ts remove.ts update.ts outdated.ts doctor.ts
│   │   │   │                         repair.ts uninstall.ts list.ts projects.ts usage.ts …
│   │   │   ├── core/                 layout · layers · tokens · plan · apply · meta · lock · hash · merge/ · fsx · git · prompt
│   │   │   ├── adapters/             하네스 어댑터(03)
│   │   │   └── modules/              외부 도구 모듈 연결(aidlc · entire, 10)
│   │   ├── test/                     vitest 단위 시험, fixtures/
│   │   └── build.mjs                 esbuild → dist/cli.js 하나(dashboard 포함, 런타임 의존 0)
│   ├── dashboard/                    관리 페이지 서버 라우트 · 읽기 모듈 · 화면 정적 파일(06). cli 번들에 같이 묶는다
│   │   ├── src/                      server · guard · readers/ · writers/ · render/
│   │   └── static/                   화면 파일 + vendor/flow.bundle.js(flow-view 빌드 결과를 커밋)
│   ├── flow-view/                    React Flow 화면 소스(개발 의존만: react · @xyflow/react · esbuild). 결과물만 dashboard로
│   ├── templates/                    프로젝트에 깔리는 내용의 원본
│   │   ├── layout.json               템플릿 경로 → 설치 경로(3.4)
│   │   ├── common/ · domains/ · stacks/ · arch/ · optional/
│   │   └── …                         리포 스크립트(verify.sh · harness/*.py · hooks/*)도 여기
│   ├── legacy-setup/<스킬>/          setup.sh · lib/ · update.sh · add-agent.sh. Node 없는 환경용, v2.0 동안만
│   └── plugin/                       얇은 플러그인의 원본: 매니페스트 · commands/ · skills/hx-*/SKILL.md
├── plugins/harness-kit/              생성물. 손으로 고치지 않는다(아래)
│   ├── .claude-plugin/ · .codex-plugin/
│   ├── commands/ · skills/hx-*/      얇은 스킬: 대화로 값을 받고 CLI를 부른다(3.14)
│   └── skills/hx-bootstrap/
│       ├── bin/harness-kit.js        packages/cli/dist/cli.js 사본
│       ├── templates/                packages/templates 사본(오프라인 설치용)
│       └── setup.sh · lib/ …         packages/legacy-setup 사본
├── .claude-plugin/marketplace.json · .agents/plugins/marketplace.json   지금 자리 그대로(./plugins/harness-kit)
├── install-kiro.sh                   생성된 플러그인 스킬 폴더를 복사한다
├── scripts/release.sh · gen-plugins.mjs · sync-commands.sh   킷 개발 도구(플러그인에 넣지 않는다)
├── tests/                            e2e · test_cli_parity.py(3.15) · test_generated.py(생성물 = 원본)
└── docs/
```

- 원본은 `packages/`다. `plugins/harness-kit/`은 `scripts/gen-plugins.mjs`가 `packages/plugin` → `packages/legacy-setup/<스킬>` → `packages/templates`(→ `skills/hx-bootstrap/templates/`) 순서로 겹쳐 만들고 커밋한다. 같은 경로가 두 층에 있으면 거부한다(HK-1). Claude · Codex 마켓플레이스가 git에서 플러그인 폴더만 받아 가기 때문이다. `tests/test_generated.py`가 생성물과 원본(빌드 결과 포함)이 바이트 단위로 같은지 보고, fast 검증 · CI에서 돈다. 플러그인 폴더를 손으로 고치면 이 시험이 실패한다.
- 마켓플레이스 경로(`./plugins/harness-kit`)와 플러그인 스킬 이름(`hx-*`)은 그대로다. 사용자는 구조 이동을 알아챌 필요가 없다.
- 템플릿 자리 찾기: `HARNESS_KIT_TEMPLATES` → `<cli 폴더>/../templates`(플러그인 `bin/` 옆) → `<cli 폴더>/../../templates`(npm 패키지 안). 둘 다 없으면 exit 5. npm 패키지 `files`: `dist/`, `templates/`(빌드 때 `packages/templates`를 패키지 안으로 복사한다).
- 워크스페이스 도구는 pnpm workspaces만 쓴다. 패키지가 다섯이라 Turborepo · Nx는 두지 않는다. 개발 의존: `typescript`, `esbuild`, `vitest`, `jsonc-parser`(번들에 넣는다, P18의 `.vscode/settings.json` 주석 보존 병합용), flow-view의 `react` · `@xyflow/react`.
- 버전: `packages/cli/package.json` · 두 마켓플레이스 파일 · 플러그인 Claude · Codex 매니페스트 다섯 곳을 `scripts/release.sh <버전>`이 같이 올리고 `gen-plugins.mjs`를 돌린다.
- 이동 순서: v1.1 전에 파일만 옮기는 커밋 하나(`git mv`, 동작 같음, `git log --follow`로 이력 유지) → 생성 스크립트 · 생성물 시험 → v1.1. 이 문서와 다른 설계 문서의 킷 저장소 경로는 이동 뒤 기준이다.

### 3.2 공통 플래그와 종료 코드

| 플래그 | 뜻 |
|---|---|
| `--cwd <경로>` | 대상 리포(기본 현재 폴더). git 리포가 아니어도 된다 |
| `--dry-run` | 작업 목록만 출력하고 쓰지 않는다 |
| `--yes` | 질문 없이 기본값·플래그 값으로 진행한다. TTY가 아니면 자동으로 켠다 |
| `--json` | 결과를 JSON 하나로 stdout에. 사람용 줄은 stderr로 |
| `--templates <경로>` | 번들 템플릿 대신 이 폴더를 쓴다(킷 개발용) |
| `--no-color` · `--quiet` | 색 끄기 · 요약만 |

| 코드 | 뜻 | 예 |
|---|---|---|
| 0 | 성공(바뀐 것 없음 포함) | |
| 1 | 검사가 문제를 찾았다 | `doctor --check` 오류, `outdated --check` 새 버전 있음 |
| 2 | 사용법 오류 | 모르는 플래그·스택·변형·모듈, P17에 없는 명령 |
| 3 | 리포 상태 오류 | 설치 안 됨, 이미 설치됨, lock 해석 실패, 설치된 킷이 CLI보다 새 버전 |
| 4 | 사람 판단이 필요한 결과가 남았다 | `.new` 생성, 수정본이라 지우지 않은 파일, 팩 충돌 |
| 5 | 실행 환경 오류 | Node < 18, git 필요한 작업에 git 없음, 쓰기 권한 없음 |
| 130 | 사용자가 중단했다 | Ctrl-C, 확인 질문에 "아니오" |

### 3.3 명령

| 명령 | 플래그 | 하는 일 | 코드 |
|---|---|---|---|
| `init` | `--stack` `--arch` `--domain` `--lang kotlin\|java` `--agents <목록\|all>` `--modules <목록\|all\|none>` `--name` `--slug` `--package-ns` `--protected-path` `--token KEY=VALUE`(반복) `--issue-source kit\|jira` `--issue-prefix` `--base` `--adopt` `--force` `--install-tools` `--no-register` | 질문(TTY) 또는 플래그로 선택값을 받고 3.7 작업 목록을 적용한다. 플래그가 없는 토큰은 setup.sh와 같은 이름의 환경변수(`PROJECT_NAME` 등)를 읽는다. `--adopt`는 이미 있는 파일을 모두 `user`로 기록하고 없는 것만 깐다. 고른 모듈의 외부 도구(AI-DLC · Entire)가 없으면 사람 터미널에서 설치할지 묻고, `--install-tools`면 묻지 않고 그 도구의 공식 설치기를 부른다(10 MD-R3). 끝나면 등록부에 이 리포를 더한다(`--no-register`면 빼고, 06 §3.17). 설치 끝에 `python3 tools/docs/feature_docs.py build`를 한 번 돌린다(setup.sh와 같다) | 0 2 3 5 |
| `plan` | `init`과 같음 | 작업 목록만 출력한다. 쓰지 않는다 | 0 2 |
| `add <이름>…` | `--dry-run` | 하네스(`claude` `codex` `cursor` `kiro`)나 모듈(`jira-workflow` `notion` `platform-guards` `multi-harness`, P22부터 `aidlc` `entire`)을 켜고 그 몫만 깐다. 메타의 `agents`·`modules`에 더한다 | 0 2 3 4 |
| `remove <이름>…` | `--dry-run` | 그 하네스·모듈의 킷 소유 파일 중 고치지 않은 것만 지우고 병합 키를 뺀다. 메타에서 뺀다 | 0 2 3 4 |
| `update` | `--dry-run` `--accept-all` `--prune` `--forget <경로>`(반복) `--to <버전\|소스>` `--packs` `--tools` `--allow-unverified` | 3.10. `--tools`는 켠 모듈의 외부 도구를 사람이 고른 것만 그 도구의 업데이트 명령으로 올린다(10 MD-R15). `--prune`은 킷에서 빠진 미수정 파일을 지운다. `--forget`은 그 경로를 `user`·`none`으로 바꿔 다음부터 받지 않는다 | 0 2 3 4 |
| `outdated` | `--check` | 설치 버전 · CLI 버전 · 소스의 최신 태그(`git ls-remote --tags`), 팩 버전, 외부 도구 버전(P22) | 0 1 3 |
| `doctor` | `--check` `--only <종류>` | 3.11. 읽기만 한다 | 0 1 3 |
| `repair` | `--dry-run` `--only missing\|drifted\|stale\|merge` | 3.12 | 0 3 4 |
| `uninstall` | `--dry-run` `--keep-state` `--keep-packs` | 3.13. TTY에서는 지울 목록을 보여 주고 확인을 받는다 | 0 3 4 130 |
| `list` | `--files` | 메타 요약(스택·변형·하네스·모듈·팩), `--files`면 lock 항목을 주인·작업 종류별로 | 0 3 |

### 3.4 `templates/layout.json`

setup.sh·lib의 `harness_remap`·`harness_agent_of`·`harness_is_executable`·`harness_dest_name`·`list_layer`·스택 기본값을 데이터로 옮긴다. 세그먼트는 위에서부터 처음 맞는 것을 쓴다(`root/CLAUDE.md`가 `root/`보다 앞).

```jsonc
{
  "schema": "harness-kit.layout/v1",
  "ignore": [".DS_Store", "ABOUT", "module.json"],     // 파일 이름. 모듈 설명(ABOUT)·모듈 정의(module.json, 10 문서)는 설치하지 않는다
  "layers": [
    { "id": "common",  "dir": "common" },
    { "id": "domain",  "dir": "domains/{domain}", "whenExists": true },   // backend 는 폴더가 없다
    { "id": "stack",   "dir": "stacks/{stack}", "exclude": ["arch/**"] },
    { "id": "arch",    "dir": "stacks/{stack}/arch/{arch}" },
    { "id": "module",  "dir": "optional/{module}", "each": "modules" }
  ],
  "segments": [
    { "from": "root/CLAUDE.md",  "to": "CLAUDE.md",        "harness": "claude" },
    { "from": "root/",           "to": "",                 "harness": null },
    { "from": "kiro-steering/",  "to": ".kiro/steering/",  "harness": "kiro" },
    { "from": "kiro-skills/",    "to": ".kiro/skills/",    "harness": "kiro" },
    { "from": "kiro-agents/",    "to": ".kiro/agents/",    "harness": "kiro" },
    { "from": "kiro-hooks/",     "to": ".kiro/hooks/",     "harness": "kiro" },
    { "from": "kiro-root/",      "to": ".kiro/",           "harness": "kiro" },
    { "from": "agents-rules/",   "to": ".agents/rules/",   "harness": null },
    { "from": "agents-skills/",  "to": ".agents/skills/",  "harness": null },
    { "from": "agents-docs/",    "to": ".agents/docs/",    "harness": null },
    { "from": "agents-root/",    "to": ".agents/",         "harness": null },
    { "from": "scripts/",        "to": "scripts/",         "harness": null },
    { "from": "claude/",         "to": ".claude/",         "harness": "claude" },
    { "from": "codex/",          "to": ".codex/",          "harness": "codex" },
    { "from": "cursor/",         "to": ".cursor/",         "harness": "cursor" },
    { "from": "",                "to": "",                 "harness": null }      // docs/ · tools/ 는 같은 경로
  ],
  "pathTokens": { "__PROJECT_SLUG__": "PROJECT_SLUG" },
  "executable": ["**/*.sh", "scripts/**/*.py", "scripts/git-hooks/*"],
  "tokens": ["PROJECT_NAME", "PROJECT_SLUG", "PACKAGE_NS", "SERVICE_NAME", "PRIMARY_LANGUAGE",
             "BUILD_TOOL", "TEST_CMD", "DOMAIN_EXAMPLE", "PROTECTED_PATH"],
  "harnesses": ["claude", "codex", "cursor", "kiro"],
  "modules": ["jira-workflow", "platform-guards", "multi-harness"],
  "domains": ["backend", "frontend"],
  "stacks": {
    "jvm":      { "domain": "backend",  "defaultArch": "hexagonal",
                  "tokens": { "PRIMARY_LANGUAGE": "Kotlin/Java", "BUILD_TOOL": "Gradle", "TEST_CMD": "./gradlew check" },
                  "lang": { "kotlin": { "PRIMARY_LANGUAGE": "Kotlin" }, "java": { "PRIMARY_LANGUAGE": "Java" } } },
    "python":   { "domain": "backend",  "defaultArch": "hexagonal",
                  "tokens": { "PRIMARY_LANGUAGE": "Python", "BUILD_TOOL": "uv", "TEST_CMD": "pytest" } },
    "go":       { "domain": "backend",  "defaultArch": "hexagonal",
                  "tokens": { "PRIMARY_LANGUAGE": "Go", "BUILD_TOOL": "go", "TEST_CMD": "go test -race ./..." } },
    "web":      { "domain": "frontend", "defaultArch": "nextjs-app",
                  "tokens": { "PRIMARY_LANGUAGE": "TypeScript", "BUILD_TOOL": "pnpm", "TEST_CMD": "pnpm test" } },
    "electron": { "domain": "frontend", "defaultArch": "main-renderer",
                  "tokens": { "PRIMARY_LANGUAGE": "TypeScript", "BUILD_TOOL": "pnpm + electron-builder", "TEST_CMD": "pnpm test" } }
  },
  "tokenDefaults": { "PROJECT_SLUG": "{targetBasename}", "PROJECT_NAME": "{PROJECT_SLUG}",
                     "SERVICE_NAME": "{PROJECT_SLUG}", "PROTECTED_PATH": "docs/references" }
}
```

- `harness: null`은 core(항상 설치)다. 하네스 세그먼트의 파일은 그 하네스를 골랐을 때만 깐다.
- `executable`의 `**`는 `/`를 넘는다. bash `case`의 `*`가 `/`를 넘는 것과 같은 결과다.
- 스택·변형 목록은 `templates/stacks/*`·`arch/*` 폴더에서 읽는다(layout.json에 복제하지 않는다).
- P18은 세그먼트에 `"op"`를 더한다(`claude/commands/` → 어댑터 생성으로 바뀌는 등). P17의 layout.json에는 `op`가 없고 모두 `copy`다.
- 동일성 시험(3.15)의 첫 단계가 `harness_remap`·`harness_agent_of`에 템플릿 경로 전부를 넣은 결과와 layout.json 해석 결과를 비교한다. 한쪽만 고치면 시험이 깨진다.

### 3.5 레이어 해석

순서: common → domains → stacks → arch → optional(모듈, 메타 순서) → packs(`packs` 배열 순서, [04](04-extension-layers.md)) → project.

```text
resolve(meta, templates, packs, repo, lock):
  cand = Map<설치경로, 후보[]>
  for layer in [common, domain?, stack(arch 제외), arch, module…]:
    for f in files(layer) - ignore:
      seg = 첫 번째로 맞는 segment(f)
      if seg.harness and seg.harness ∉ meta.agents: continue
      dest = pathTokens(seg.to + f[len(seg.from):])
      cand[dest].push({owner:"kit", layer, src:f})
  for pack in packs: (같은 방식, owner:"pack:<이름>")
  for dest, list in cand:
    kitWin  = list의 owner=kit 중 마지막(뒤 레이어가 이긴다)
    packWin = owner=pack:* 가 둘 이상이면 충돌(exit 4), 하나면 그것
    winner  = packWin ?? kitWin
    if lock[dest].owner == "user" 또는 (lock에 없고, 파일이 있고, 내용이 winner와 다르다): project가 이긴다 → skip-user
    if lock[dest].owner 가 external:*: skip-external
```

v1 동작과 다른 점: setup.sh는 `--force` 없이 처음 설치할 때 이미 있는 파일을 건너뛰므로, 같은 경로가 두 레이어에 있으면 앞 레이어가 이긴다. 지금 그런 경로가 `platform-guards` 모듈을 켤 때 4개 있다(`scripts/run-guards.sh` · `scripts/guards/_template.sh` · `.agents/rules/platform-invariants.md` · `.kiro/steering/platform-invariants.md`). 이 중 3개는 내용이 다르다. setup.sh 첫 설치는 common 판을 깔고, update.sh는 다음 실행에서 모듈 판으로 바꾼다. 머리 주석("뒤 레이어가 앞을 덮는다")과 결과가 다르다. P17은 setup.sh도 뒤 레이어 우선으로 고친 뒤 동일성 시험을 돌린다(같은 경로는 마지막 레이어 하나만 쓰고 lock에 한 줄만 남긴다).

### 3.6 토큰 치환

- 대상: layout.json `tokens`의 `{{KEY}}`. 값이 빈 문자열이면 그 토큰을 남긴다(setup.sh와 같다). 스펙 작성 시점 토큰(`PRODUCT_SLUG`·`FEATURE_NAME`·`EPIC_ID`)은 목록에 없어서 남는다.
- 방식: 바이트 단위 리터럴 치환. 파일에 NUL 바이트가 있으면 이진 파일로 보고 치환하지 않는다.
- 경로 토큰: `__PROJECT_SLUG__` → `PROJECT_SLUG` 값(비면 그대로).
- 값 우선순위: 플래그 > 환경변수 > 메타 `tokens` > 스택 기본값 > `tokenDefaults`.
- setup.sh 차이: `sed "s|{{K}}|v|g"`는 값 안의 `&`를 일치 문자열로, `|`를 구분자로 해석한다. 값 `R&D`는 `R{{K}}D`가 된다. P17에서 setup.sh의 `harness_subst`가 `&`·`|`·`\`를 이스케이프하게 고친다. 동일성 시험에 `&`가 든 값 조합을 하나 넣는다(3.15 #8).

### 3.7 작업 목록

```ts
type Owner = "kit" | "user" | `pack:${string}` | `external:${string}`;
type OpKind = "copy" | "mirror" | "render" | "merge" | "none";   // 심볼릭 링크는 쓰지 않는다(03 §3.12)
type Action = "create" | "replace" | "same" | "conflict" | "skip-user" | "skip-external" | "skip-pack"
            | "delete" | "keep-modified" | "orphan" | "restore" | "merge-keys" | "unmerge-keys";

interface PlannedOp {
  path: string;                    // 리포 기준 POSIX 상대 경로. 절대경로·'..'·'.git' 포함 시 계획 단계에서 거부
  op: OpKind; owner: Owner; layer: string;
  action: Action; reason?: string;
  src?: string;                    // copy: 템플릿 상대 경로
  content?: Uint8Array;            // copy·render: 치환까지 끝낸 바이트
  sha256?: string;                 // content 의 해시
  from?: string; fromSha256?: string;   // mirror · render: 리포 안 원본(.agents/…)과 그 해시
  keys?: string[];                 // merge
  executable?: boolean;
}
```

적용 순서: 폴더 만들기 → 파일(같은 폴더의 임시 파일에 쓰고 rename) → 링크 → 병합 → `.new` → 메타 → lock. lock을 마지막에 쓰므로 중간에 멈춰도 다시 실행하면 같은 결과가 나온다. 이미 쓴 파일은 `same`이 되고, lock은 그때 갱신된다.

`plan --json` 출력:

```json
{
  "command": "init", "target": "/work/my-api",
  "selection": { "stack": "jvm", "arch": "hexagonal", "domain": "backend", "agents": ["claude", "kiro"], "modules": [] },
  "counts": { "create": 258, "skip-user": 0, "excludedByHarness": 19 },
  "ops": [ { "path": ".agents/rules/git-workflow.md", "op": "copy", "owner": "kit", "layer": "common", "action": "create" } ]
}
```

### 3.8 메타 `.agents/harness-kit.json`

v2 형식은 README §5. 이 문서가 더하는 키는 `tokens`·`installedAt`·`updatedAt` 세 개다. `tokens`가 없으면 `update`가 `PACKAGE_NS` 같은 값을 다시 치환할 수 없다(README 예시에 없다 — 보고 항목).

| v1 키 | v2 키 |
|---|---|
| `kitVersion` | `kit.version` |
| `domain` · `stack` · `arch` · `agents` · `modules` | 같은 이름 |
| `tokens.PROJECT_NAME` · `tokens.PROJECT_SLUG` | `project.name` · `project.slug`(그리고 `tokens`에도 남긴다) |
| `tokens.*` | `tokens.*` |
| `installedAt` · `updatedAt` | 같은 이름 |
| (없음) | `schema`, `flow`·`roles`·`approvers`·`groups`·`issueKey`·`git`·`packs`·`verify`·`versions`는 README 기본값. `issueKey.prefix`는 `PROJECT_SLUG` 대문자 |

- 쓰기: 모르는 키는 보존한다. 키 순서는 README §5 순서, 들여쓰기 2칸, 끝 줄바꿈.
- 메타가 v1이고 명령이 읽기 전용(`doctor`·`list`·`outdated`)이면 메모리에서만 바꾼다.

### 3.9 lock v2

- 형식: README §6. `entries`는 `path` 사전순, 들여쓰기 2칸. 같은 `path`는 한 줄만.
- 항목 필드: 모든 op에 `path`·`op`·`owner`. `copy` → `sha256`·`layer`. `mirror` → `from`·`fromSha256`·`sha256`(폴더면 둘 다 tree-sha256). `render` → `from`·`fromSha256`·`sha256`. `merge` → `keys`. `none` → 없음.
- `sha256`은 킷이 그 파일을 쓸 때의 내용 해시(기준 B)다. 지금 파일의 해시가 아니다. 모르면 `null`이고, `null`은 언제나 "사람이 고쳤다"로 본다.
- tree-sha256: 폴더 안 파일을 상대 경로 사전순으로 `"<경로>\0<sha256>\n"`을 이어 붙인 문자열의 sha256.
- `layer` 값: 템플릿 폴더 경로(`common`, `domains/frontend`, `stacks/jvm`, `stacks/jvm/arch/hexagonal`, `optional/jira-workflow`, `packs/acme/common`).
- `kit.source`: `github:<owner>/harness-starter-kit#v2.0.0` · `npm:harness-kit@2.0.0` · `plugin:harness-kit@2.0.0` · `file:<경로>`(개발).

v1(TSV) 읽기:

```text
# harness-kit lock v1 — sha256<TAB>layer<TAB>agent<TAB>path
5d13…94ba01	common	core	.agents/docs/README.md
```

1. 첫 줄이 `# harness-kit lock v1`이면 v1이다. `#`로 시작하는 줄과 빈 줄은 건너뛴다.
2. 줄마다 `{path, op:"copy", owner:"kit", sha256: (값이 "-"면 null), layer: 변환(라벨)}`. 라벨 변환: `common` → `common`, `frontend`·`backend` → `domains/<값>`, `<stack>` → `stacks/<stack>`, `<stack>/<arch>` → `stacks/<stack>/arch/<arch>`, `mod/<m>` → `optional/<m>`.
3. 세 번째 열은 주인이 아니라 하네스(`core`·`claude`·`codex`·`cursor`·`kiro`)다. v2에서는 버린다. 하네스는 layout.json 세그먼트로 경로에서 다시 구한다.
4. 같은 경로가 여러 줄이면(3.5의 겹치는 경로) 레이어 순서상 뒤의 줄의 `layer`, 앞 줄의 `sha256`을 쓴다. v1 setup.sh가 실제로 쓴 내용이 앞 레이어 판이기 때문이다.
5. 쓰기 명령(`update`·`add`·`remove`·`repair`)이 처음 lock을 쓸 때 v2로 쓴다. 옛 파일은 `.agents/state/harness-kit.lock.v1.bak`에 남긴다.

### 3.10 update — 3방향 비교

입력: D = 새 킷이 원하는 내용(치환 후), C = 지금 파일, B = lock의 기준 해시, O = lock의 주인.

| 조건(위에서부터) | 판정 | 쓰기 | lock |
|---|---|---|---|
| O = `user` 또는 `external:*` | skip-user · skip-external | 없음 | 그대로 |
| O = `pack:*`이고 `--packs` 아님 | skip-pack | 없음 | 그대로 |
| lock에 없고 C 없음 | new | D | B := sha(D) |
| lock에 없고 C 있음, sha(C) = sha(D) | same | 없음 | B := sha(D), owner kit |
| lock에 없고 C 있음, 다름 | skip-user | 없음 | owner user로 기록 |
| lock에 있고 C 없음 | restore(지운 파일을 되살린다, v1과 같다) | D | B := sha(D) |
| sha(C) = sha(D) | same | 없음 | B := sha(D) |
| sha(C) = B | update | D | B := sha(D) |
| 그 밖(B = null 포함) | conflict | `<경로>.new` = D. `--accept-all`이면 C → `.bak`, D | B 그대로(다음에도 수정본으로 남는다) |
| lock에 있고 D 없음(킷에서 빠짐) | orphan | 보고만. `--prune`이고 sha(C) = B면 지운다 | `--prune`으로 지웠으면 항목 삭제 |

- `--forget <경로>`: 그 항목을 `{op:"none", owner:"user"}`로 바꾼다. 다음 update부터 restore·conflict가 생기지 않는다.
- 이미 `.new`가 있으면 최신 D로 덮어쓰고 "갱신된 .new"로 보고한다.
- mirror(P18): 리포 안 원본에서 다시 복사한다. C가 v1 포인터 파일이고 sha(C) = B(사람이 안 고쳤다)면 복사본으로 바꾼다(replace). C가 심볼릭 링크면(v2 초기 판) 실제 복사본으로 바꾼다. 복사본을 사람이 고쳤으면(sha(C) ≠ 기록) conflict로 보고하고 "원본 `.agents/…`를 고친다"를 안내한다.
- merge(P18): 3방향 비교 없이, 파일을 읽어 킷 키만 넣고·바꾸고·뺀다([03](03-projection-and-hooks.md#35-병합-규칙)). 파일을 해석할 수 없으면 conflict(쓰지 않는다).
- render(P18): copy와 같은 표, B = `sha256`. `fromSha256`도 갱신한다.
- 메타 `kit.version`과 lock `kit.version`을 새 버전으로 쓴다. CLI 버전이 설치 버전보다 낮으면 exit 3(내려가는 update는 `--to`로 명시해야 한다).
- 결과에 conflict가 있으면 exit 4, 출력 끝에 `diff -u <경로> <경로>.new` 목록.

### 3.11 doctor

| 검사 | 판정 값 | 등급 |
|---|---|---|
| 메타·lock 해석, 스키마 | `meta-invalid` · `lock-invalid` · `lock-v1` | 오류 · 오류 · 정보 |
| 킷 버전 | 메타·lock·CLI 버전 비교 → `version-mismatch` | 경고(설치 > CLI면 오류) |
| copy 항목 | `ok` · `drifted`(sha(C) ≠ B, 사람 수정) · `missing` | 정보 · 정보 · 오류 |
| render 항목 | `ok` · `drifted`(생성 파일을 손으로 고침) · `stale`(원본 해시 ≠ `fromSha256`) · `missing` | 경고 · 오류 · 오류 |
| mirror 항목 | `ok` · `stale`(원본 tree-sha256 ≠ `fromSha256`) · `drifted`(복사본을 손으로 고침) · `missing` | 오류 |
| 하네스 폴더의 킷 경로에 심볼릭 링크 | `symlink-found`(v2 초기 판의 흔적. `repair`가 복사본으로 바꾼다) | 오류 |
| merge 항목 | 기록된 키가 파일에 없음 → `merge-missing` | 오류 |
| 하네스 폴더의 lock에 없는 파일 | `foreign`(알려진 외부 도구 경로면 `external:<도구>`로 표시) | 정보 |
| `.new` · `.bak` 남음 | `pending-new` | 경고 |
| 역할 배정 | `roles.*.harness` ∉ `agents`, 외부 도구가 깔린 하네스와 역할 하네스가 다름 → `role-mismatch` | 경고 |
| 외부 도구 버전(P22) | `versions` 범위 밖 → `version-mismatch` | 경고 |
| 개인 층(P18) | 무시되는 키 → `personal-ignored` | 경고 |
| 게이트 하한(P18) | `flow.gates`에 requirements·design·mr·done 중 빠짐 → `gate-floor` | 오류 |
| 진입 파일 크기 | `AGENTS.md` + `CLAUDE.md` > 24KB → `entry-size` | 경고 |
| `.gitignore` | `.agents/state/` · `.agents/local/` · `.agents/reports/` 없음 → `gitignore` | 경고 |

`--check`는 오류 등급이 하나라도 있으면 exit 1. `--json` 출력:

```json
{
  "kit": { "installed": "2.0.0", "cli": "2.0.0" },
  "summary": { "ok": 251, "drifted": 2, "missing": 0, "stale": 0, "foreign": 4, "errors": 0, "warnings": 1 },
  "findings": [
    { "kind": "drifted", "severity": "info", "path": ".agents/rules/tech.md", "owner": "kit", "hint": "사람이 고친 파일이다. update 때 .new 로 받는다" },
    { "kind": "entry-size", "severity": "warn", "path": "AGENTS.md", "detail": { "bytes": 61234, "limit": 24576 } }
  ]
}
```

판정은 리포 스크립트 `scripts/harness/check_layout.py`([03](03-projection-and-hooks.md#39-check_layoutpy))와 같은 규칙이다. 같은 fixture에서 두 구현의 판정 목록이 같은지 시험한다.

### 3.12 repair

| 발견 | 하는 일 |
|---|---|
| `missing`(copy·kit) | lock `kit.version`과 CLI 버전이 같으면 템플릿에서 다시 쓴다. 다르면 고치지 않고 `update`를 안내한다(다른 판의 내용을 넣지 않는다) |
| `missing`·`stale`(render) | 리포 안 원본(`from`)에서 다시 만든다. 킷 버전과 무관하다 |
| `drifted`(render) | 고친 파일을 `<경로>.bak`으로 옮기고 다시 만든다. 보고에 `.bak` 경로를 넣는다 |
| `missing`·`stale`(mirror) | 리포 안 원본(`from`)에서 다시 복사한다 |
| `drifted`(mirror) | 고친 복사본을 `.agents/state/repair-backup/<시각>/`에 옮기고 원본에서 다시 복사한다. 보고에 "고친 내용은 원본에 옮긴다"와 백업 경로를 넣는다 |
| `symlink-found` | 링크를 지우고 그 대상을 실제 복사본으로 만든다(mirror 항목으로 기록) |
| `merge-missing` | 킷 키를 다시 병합한다 |
| `drifted`(copy) | 하지 않는다(사람이 고친 파일) |

### 3.13 uninstall

1. 계획: lock 항목마다 — copy·mirror·render는 sha(C) = B면 `delete`, 다르면 `keep-modified`. merge는 `unmerge-keys`(킷 키만 뺀다. 남은 내용이 `{}`이고 lock에 `createdByKit: true`면 파일도 지운다). `pack:*`은 `--keep-packs`가 없으면 킷과 같은 규칙. `user`·`external:*`은 남긴다. 킷이 만든 `.new`는 지운다.
2. 비게 된 폴더 중 킷이 만든 폴더(lock 항목의 상위 폴더)만 지운다.
3. `git config --get core.hooksPath`가 `scripts/git-hooks`면 `git config --unset core.hooksPath`.
4. `--keep-state`가 없으면 마지막으로 `.agents/harness-kit.lock`·`.agents/harness-kit.json`을 지운다. `.agents/state/`는 커밋하지 않는 폴더라 그대로 둔다.
5. `keep-modified`가 하나라도 있으면 목록과 함께 exit 4.

### 3.14 플러그인 스킬에서 부르기

```text
hx-bootstrap SKILL.md 절차
1. 대화로 스택·변형·하네스·모듈·토큰·이슈 키를 받는다(지금 SKILL.md 질문 그대로).
2. node --version 이 v18 이상이면:
     node "<이 스킬 폴더>/bin/harness-kit.js" plan --cwd "<대상>" --stack … --yes --json
   계획 요약(파일 수, skip-user 수)을 사람에게 보여 주고 승인을 받는다.
     node "<이 스킬 폴더>/bin/harness-kit.js" init --cwd "<대상>" --stack … --yes
3. Node 가 없거나 18 미만이면:
     STACK=… bash "<이 스킬 폴더>/setup.sh" --arch=… --agents=… "<대상>"
   출력 첫 줄에 "Node 18 이 없어 setup.sh 로 설치했다. v2.1 부터는 Node 가 필요하다"를 붙인다.
```

- `hx-update` → `update --dry-run` 결과를 보여 준 뒤 `update`. 내려가는 경로는 `bash ../hx-bootstrap/../hx-update/update.sh`.
- `hx-agent-add` → `add <하네스>…`. 내려가는 경로는 `add-agent.sh`.
- 스킬이 CLI를 부를 때 `--json`을 쓰고, exit 4면 `.new` 목록을 사람에게 그대로 보여 준다. 에이전트가 `.new`를 병합하지 않는다(사람이 고른다).
- setup.sh로 깐 리포를 나중에 CLI로 `update`하면 v1 lock 읽기(3.9) 경로로 들어간다.

### 3.15 setup.sh ↔ CLI 동일성 시험

`tests/test_cli_parity.py`(unittest). 조합마다 빈 임시 폴더 두 개에 각각 설치하고 비교한다.

| # | 스택 · 변형 | 하네스 | 모듈 | 노리는 것 |
|---|---|---|---|---|
| 1 | jvm · hexagonal | claude | none | 기본값 |
| 2 | jvm · layered-multimodule, `--lang=kotlin` | all | jira-workflow | 언어 토큰, 모듈 세그먼트 |
| 3 | jvm · hexagonal-standalone | claude, codex | platform-guards | 겹치는 경로 4개(3.5) |
| 4 | python · hexagonal | codex | none | Claude 없는 설치 |
| 5 | python · django | claude, kiro | multi-harness | Kiro 세그먼트 5종, `__PROJECT_SLUG__` 경로 토큰 |
| 6 | go · feature | cursor | none | Cursor만 |
| 7 | web · nextjs-app(도메인 frontend) | all | none | 도메인 레이어 |
| 8 | web · feature-sliced | claude | platform-guards, jira-workflow | `PROJECT_NAME` 값 `R&D\|Lab`(`&`·`\|` 치환) |
| 9 | electron · monorepo | kiro | none | 도메인 + Kiro만 |
| 10 | jvm · modulith, 대상에 `AGENTS.md`·`.claude/settings.json`이 미리 있음 | all | none | 있는 파일 건너뛰기(setup.sh 기본) = CLI `--adopt` |

비교 규칙:

1. 파일 목록: 양쪽 `find -type f -o -type l` 결과가 같다.
2. 내용: 파일마다 바이트가 같다. 실행 권한 비트가 같다.
3. 제외: `.agents/harness-kit.lock`, `.agents/harness-kit.json`(이 둘은 의미 비교: 스택·변형·도메인·하네스·모듈·토큰이 같다), `docs/features/` 생성물의 날짜 문자열(정규식으로 지운 뒤 비교).
4. 시간: 조합 10개 합계 120초 이내(CI 기준). 그보다 길면 `feature_docs.py build`를 조합 1·7에서만 돌린다.
5. 선행 시험: layout.json 해석 = `harness_remap`·`harness_agent_of`(템플릿 파일 전부).

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| bash 확장(지금 setup.sh에 병합·링크·doctor 추가) | JSON·TOML 병합과 3방향 비교를 bash로 쓰면 `sed` 기반 JSON 파서가 늘어난다. 지금도 메타를 `sed`로 읽는다 |
| Python CLI | 플러그인 사용자는 Node가 있지만 Python 3.11+(`tomllib`)가 없는 환경이 있다. 리포 스크립트는 Python이므로 매일 쓰는 명령은 그대로 둔다 |
| 런타임 의존 패키지(commander·prompts·yaml) | `npx` 첫 실행 설치 시간과 공급망 범위가 는다. `node:util` parseArgs·readline으로 된다 |
| 원본을 지금처럼 플러그인 스킬 폴더 안에 두고 루트에 `cli/`만 더한다 | 배포 경로(Claude · Codex 플러그인, Kiro, npm)가 모두 스킬 폴더를 거치도록 휘고, CLI 사본 · 템플릿 탐색이 세 갈래가 된다. 관리 페이지 · React Flow 소스 · 모듈 연결 코드가 둘 자리가 없다 |
| 저장소를 CLI · 템플릿 · 플러그인으로 나눈다 | 한 기능을 바꿀 때 저장소 여럿의 버전을 맞춰 올려야 한다. 이 규모에서는 모노레포 하나로 충분하다 |
| 플러그인 폴더를 생성하되 커밋하지 않는다 | 마켓플레이스가 git에서 플러그인 폴더를 받아 가므로 커밋돼 있어야 한다. 대신 생성물 = 원본 시험으로 묶는다 |
| layout.json 없이 TypeScript에 매핑을 쓴다 | setup.sh와 CLI가 매핑을 따로 가져 어긋나도 모른다. 데이터 한 벌 + 동일성 시험으로 묶는다 |
| lock v2를 TSV에 열 추가 | `keys`·`target`·`from` 같은 선택 필드가 op마다 달라 열 의미가 흔들린다 |
| update가 수정본을 3방향 텍스트 병합 | 병합 결과가 틀려도 조용히 커밋된다. `.new`를 사람이 본다 |
| 킷에서 빠진 파일을 update가 바로 지운다 | 사람이 계속 쓰는 파일일 수 있다. `--prune`으로 명시한다 |

## 5. 완료 기준

[03장 P17 완료 기준](../harness-next/03-plan.html#p17)에 측정 방법을 붙인다.

1. 3.15의 조합 10개에서 setup.sh와 CLI 결과가 lock·메타를 빼고 파일 목록·내용·권한 모두 같다.
2. 새 설치 직후 `npx harness-kit doctor --check`가 exit 0(조합 10개 모두).
3. 킷 파일 하나(`.agents/rules/git-workflow.md`)를 고친 뒤 템플릿을 바꾼 킷으로 `update` → 그 파일 옆에 `.new` 1개, exit 4. 이어서 `uninstall` → 리포에 남은 킷 파일이 고친 그 파일 하나(`.agents/state/` 제외).
4. v1.0.7 설치 fixture(knots lock 형식)에서 `update`가 v1 lock을 읽어 v2로 쓴다. 이전 lock의 경로 수 = v2 `entries` 수 − 새로 생긴 파일 수.
5. `npm pack` 결과의 `package.json` `dependencies`가 비어 있고, `node dist/cli.js --version`이 `node_modules` 없는 폴더에서 돈다.
6. Node 16 환경에서 `npx harness-kit init`이 exit 5와 "Node 18 이상"을 출력한다. 같은 환경에서 `hx-bootstrap` 스킬 절차가 setup.sh로 설치를 끝낸다.
7. `doctor`와 `check_layout.py`의 판정 목록이 fixture 5종(정상·수정·누락·오래된 생성·끊어진 링크)에서 같다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| D3 배포 경로(GitHub 직접 · npm · 사내 레지스트리) | 사람 결정. 추천값(GitHub 직접 `npx github:<owner>/harness-starter-kit#v2.0.0`)으로 `kit.source`를 쓴다 |
| 비공개 GitHub 저장소에서 `npx github:…`가 git 인증을 쓰는지, 첫 실행 시간 | 인증된 장비와 안 된 장비에서 실행해 시간과 오류 문구를 잰다 |
| Claude·Codex 마켓플레이스가 플러그인 폴더의 `bin/` 파일 실행 권한을 보존하는지 | 플러그인을 설치한 뒤 `ls -l`로 본다. 보존하지 않아도 `node <경로>`로 부르므로 문제는 없다 |
| knots lock v1의 `-` 해시 항목 수 | lock 에서 첫 열이 `-`인 줄을 센다. 많으면 update 첫 실행에서 conflict가 그만큼 생긴다 |
| 템플릿에 이진 파일이 있는지 | `find templates -type f -exec grep -lP '\x00' {} +`. 있으면 3.6의 NUL 규칙이 맞는지 본다 |
| `--adopt`로 손으로 만든 하네스(hr-vision-3d)를 받을 때 foreign·skip-user 수 | hdr 사본에 `init --adopt --dry-run --json`을 돌려 센다 |
| README §5에 `tokens`가 없는 것 | 계약 수정 여부 사람 확인(이 문서는 `tokens`를 더한다) |
