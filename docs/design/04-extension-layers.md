# 04. 확장 층 — 킷 · 회사 팩 · 프로젝트 · 개인

- 단계: P18(v2.0.0). 계획: [harness-next 03장 P18 "확장 층"](../harness-next/03-plan.html#p18).
- 근거: [05장 하네스 고쳐 쓰기](../harness-next/05-principles.html#extend) · [05장 폴더와 주인](../harness-next/05-principles.html#folders).
- 엔진의 레이어 해석·3방향 비교는 [02 §3.5 · §3.10](02-cli-engine.md), 하네스 배치는 [03](03-projection-and-hooks.md).

## 1. 목적·범위

회사·팀·개인이 하네스에 더한 것을 킷 업데이트가 지우지 않게 네 층으로 나눈다. 같은 경로·이름이면 어느 층이 이기는지, 이길 수 없는 하한이 무엇인지 정한다.

| 층 | 주인(lock `owner`) | 원본 자리 | 커밋 | 킷 `update` 때 | 같은 경로·이름일 때 |
|---|---|---|---|---|---|
| 1 킷 | `kit` | 킷 템플릿 → `.agents/` 등 | 예 | 교체, 사람이 고친 파일은 `.new` | 가장 약하다 |
| 2 회사 팩 | `pack:<이름>` | 팩 리포·패키지 → `.agents/` 등 | 예(배치 결과) | 건드리지 않는다. `update --packs`일 때만 같은 규칙으로 교체 | 킷을 이긴다 |
| 3 프로젝트 | `user` | `.agents/` 안 팀 파일 | 예 | 건드리지 않는다 | 팩·킷을 이긴다 |
| 4 개인 | (개인 lock) | `.agents/local/` | 아니오 | 건드리지 않는다 | 더하기만 한다 |

범위 밖: 사용자 전역 폴더(`~/.claude/skills` 등) 쓰기(README 원칙 7). 스킬 목록이 읽기만 한다([07](07-skills-inventory.md)).

## 2. 요구사항

- R1.1 `harness-kit.json`의 `packs`에 적은 팩을 `update --packs`(또는 `init`)가 받아 배치하고, 그 파일을 `pack:<이름>`으로 lock에 기록한다.
- R1.2 팩은 `git:`·`npm:`·`file:` 세 소스를 받는다. lock에는 해석한 커밋 sha·무결성 해시를 남긴다.
- R1.3 팩의 `requires.kit` 범위가 설치할 킷 버전을 포함하지 않으면 설치를 멈추고 exit 3.
- R2.1 킷 `update`(옵션 없음) 뒤 팩 소유 파일의 해시가 그대로다.
- R2.2 팩이 킷 경로를 덮으려면 `pack.json`의 `overrides`에 적어야 한다. 적지 않은 킷 경로가 팩에 있으면 설치를 멈추고 exit 3.
- R2.3 두 팩이 같은 경로·id를 가지면 아무것도 쓰지 않고 충돌 목록과 함께 exit 4.
- R3.1 개인 층 설정(`.agents/local/harness-kit.local.json`)은 `roles`와 `git.ide`만 바꾼다. 그 밖의 키는 무시하고 doctor가 경고한다.
- R3.2 개인 층은 더하기만 한다. 공유 스킬·규칙과 같은 이름의 개인 파일은 배치하지 않고 경고한다.
- R4.1 게이트 하한(requirements · design · mr · done)과 floor 훅 3개는 팩·개인 층이 빼거나 약하게 할 수 없다.
- R5.1 `doctor`는 경로·id마다 이긴 층과 진 층을 보여 준다(`--only overrides`).
- R6.1 `pack new`는 프로젝트 파일을 팩 구조로 옮긴 팩 골격을 만들고, 그 팩을 다른 리포에 깔면 같은 내용이 나온다.

## 3. 설계

### 3.1 이름과 경로

층 비교는 설치 경로로 한다. 이름이 경로를 정하므로 이름이 같으면 경로가 같다.

| 종류 | 이름 → 경로 |
|---|---|
| 규칙 | `.agents/rules/<이름>.md` |
| 스킬 | `.agents/skills/<이름>/`(폴더 단위로 비교) |
| 역할 | `.agents/roles/<이름>.md` |
| 가드 | `scripts/guards/<이름>.sh` |
| SDD·기획물 템플릿 | `.agents/docs/_spec-templates/<경로>` |
| 훅 · 검증 단계 · 스킬 지도 항목 | 파일 하나 안의 항목: `.agents/hooks.json`의 `id`, `.agents/verify-checks.json`의 `id`, `.agents/skill-map.json`의 키 |

항목 단위 파일 세 개는 lock에 `merge` 항목으로 두고, 항목마다 `owner`를 가진다. 킷은 자기 항목만 넣고·바꾸고·뺀다.

```jsonc
// .agents/verify-checks.json (발췌)
{ "checks": [
  { "id": "feature-docs", "owner": "kit", "paths": ["docs/features/*"], "command": ["python3", "tools/docs/feature_docs.py", "check"] },
  { "id": "acme-license", "owner": "pack:acme", "paths": ["**/package.json", "**/build.gradle.kts"], "command": ["bash", "scripts/guards/acme-license.sh"] },
  { "id": "api-snapshot", "owner": "user", "paths": ["openapi/*"], "command": ["python3", "tools/api/snapshot.py", "--check"] }
] }
```

`owner`가 없는 항목은 `user`로 본다(지금 파일에는 `owner`가 없다).

### 3.2 팩 형식

```text
acme-harness-pack/                  git 리포 또는 npm 패키지
├── pack.json
├── common/                         킷 templates/common 과 같은 세그먼트 이름
│   ├── agents-rules/acme-security.md
│   ├── agents-skills/acme-release-note/SKILL.md
│   ├── agents-root/roles/acme-auditor.md
│   ├── agents-docs/_spec-templates/design/_template.md
│   └── scripts/guards/acme-license.sh
├── stacks/jvm/agents-rules/acme-jvm-deps.md        킷과 같은 스택일 때만 깐다
├── stacks/jvm/arch/hexagonal/…                     같은 스택·변형일 때만
├── domains/frontend/…                              같은 도메인일 때만
├── fragments/
│   ├── hooks.json                  .agents/hooks.json 에 id 단위 병합
│   └── verify-checks.json          .agents/verify-checks.json 에 id 단위 병합
├── tests/                          팩 자체 시험(설치하지 않는다)
└── README.md                       (설치하지 않는다)
```

- 팩에 쓸 수 있는 세그먼트: `agents-rules/` `agents-skills/` `agents-root/`(역할·`.agents` 직속 설정) `agents-docs/_spec-templates/` `scripts/`(가드·팩 훅 스크립트) `tools/<팩 이름>/`.
- 쓸 수 없는 세그먼트: `root/`(AGENTS.md는 킷·프로젝트 몫), `claude/` `codex/` `cursor/` `kiro-*`(하네스 파일은 어댑터가 원본에서 만든다, [03](03-projection-and-hooks.md)). 있으면 설치를 멈춘다.
- 토큰 치환은 킷과 같다(02 §3.6). 팩이 쓰는 추가 토큰은 `pack.json`의 `tokens`에 적고 값은 `harness-kit.json`의 `tokens`에서 읽는다.

```jsonc
// pack.json
{
  "schema": "harness-kit.pack/v1",
  "name": "acme",                              // ^[a-z][a-z0-9-]{1,30}$ → owner "pack:acme"
  "version": "1.2.0",                          // semver. git 소스면 태그 v1.2.0 과 같아야 한다
  "description": "ACME 보안·릴리스 규칙",
  "requires": { "kit": ">=2.0.0 <3.0.0" },
  "provides": {
    "rules": ["acme-security", "acme-jvm-deps"],
    "skills": ["acme-release-note"],
    "roles": ["acme-auditor"],
    "guards": ["acme-license"],
    "hooks": ["harness-acme-secret-scan"],     // id 는 harness-<팩 이름>- 로 시작한다
    "verifyChecks": ["acme-license"]
  },
  "overrides": [".agents/docs/_spec-templates/design/_template.md"],
  "tokens": ["ACME_ORG"]
}
```

검증(설치 전, 하나라도 어기면 exit 3):

1. `schema`·`name`·`version`·`requires.kit` 형식.
2. 팩 파일의 설치 경로 집합 ⊆ `provides`가 가리키는 경로 ∪ `overrides`.
3. 킷이 같은 경로를 가진 팩 파일은 `overrides`에 있어야 한다.
4. 훅 id가 `harness-<name>-` 접두이고, floor 훅 id(3.8)와 같지 않다.
5. 금지 세그먼트가 없다. 심볼릭 링크·실행 파일 아닌 `.sh`가 없다.

### 3.3 팩 소스

`harness-kit.json`의 `packs`(문자열 배열, README §5):

| 소스 | 예 | 받는 방법 | lock `resolved` |
|---|---|---|---|
| git | `git:gitlab.com/acme/harness-pack#v1.2.0` | `git clone --depth 1 --branch v1.2.0 https://gitlab.com/acme/harness-pack.git`(`git:ssh://…`면 ssh) | `git:<커밋 sha>` |
| npm | `npm:@acme/harness-pack@1.2.0` | `npm pack @acme/harness-pack@1.2.0 --pack-destination <캐시>` → tgz 풀기(번들의 tar 해석기) | `sha512-…`(npm integrity) |
| 로컬 | `file:../acme-harness-pack` · `file:tools/packs/acme` | 그 폴더를 읽는다 | `tree:<tree-sha256>` |

- 캐시: `.agents/state/packs/<이름>@<버전>-<resolved 앞 12자>/`. 프로젝트 안이고 커밋하지 않는다.
- git ref가 태그가 아니면(브랜치) 설치는 하되 doctor가 `pack-unpinned` 경고를 낸다. 같은 설정으로 다른 장비가 다른 내용을 받을 수 있다.
- `file:`이 리포 밖 경로면 doctor가 `pack-local-path` 경고를 낸다. 다른 사람 장비에는 그 경로가 없다.
- 인증은 git·npm 설정을 그대로 쓴다. CLI는 자격증명을 읽거나 저장하지 않는다.

lock 기록:

```jsonc
"packs": [
  { "name": "acme", "version": "1.2.0", "source": "git:gitlab.com/acme/harness-pack#v1.2.0",
    "resolved": "git:4be1c0d…", "requiresKit": ">=2.0.0 <3.0.0" }
]
```

### 3.4 설치·업데이트·제거

| 사람이 하는 일 | 명령 | 결과 |
|---|---|---|
| 팩을 넣는다 | `packs`에 한 줄 추가(MR) → `npx harness-kit update --packs` | 팩 파일 배치(주인 `pack:<이름>`), 덮은 킷 경로는 킷 판을 쓰지 않는다 |
| 킷을 올린다 | `npx harness-kit update` | 팩 파일은 skip-pack. 새 킷이 팩의 `requires.kit` 밖이면 exit 3: `팩 acme 1.2.0 은 kit >=2.0.0 <3.0.0 을 요구한다. 팩을 올리거나 kit 버전을 맞춘다` |
| 팩을 올린다 | 태그를 바꾼 MR → `update --packs` | 팩 파일에 02 §3.10 표를 그대로 쓴다(B = lock의 팩 기준 해시). 팩에서 빠진 파일은 orphan. 그 경로를 킷도 가지면 킷 판으로 돌아간다(C = B일 때) |
| 팩을 뺀다 | `packs`에서 지운 MR → `update --packs` | 고치지 않은 팩 파일을 지운다. 덮였던 킷 경로는 킷 판으로 되돌린다. 사람이 고친 팩 파일은 남기고 주인을 `user`로 바꾼다 |

`update --packs`는 킷 버전을 바꾸지 않는다. 킷과 팩을 같이 올리려면 `update`와 `update --packs`를 이 순서로 부른다.

### 3.5 우선순위와 충돌

경로마다(02 §3.5의 `resolve`):

1. lock 주인이 `user`이거나, lock에 없고 파일이 있고 원하는 내용과 다르면 → 프로젝트가 이긴다(skip-user).
2. 팩 후보가 하나면 팩이 이긴다. 그 경로가 킷에도 있으면 `overrides` 선언을 확인한다(3.2 검증 3).
3. 팩 후보가 둘 이상이면 충돌이다.
4. 팩 후보가 없으면 킷 레이어 중 마지막이 이긴다.

항목 단위 파일(hooks.json 등)도 같다: `user` > `pack:*` > `kit`, 팩끼리 같은 id는 충돌.

충돌이 하나라도 있으면 아무것도 쓰지 않는다.

```text
✖ 팩 충돌 2건 — 아무것도 쓰지 않았다
  .agents/rules/security-extra.md     pack:acme@1.2.0  ↔  pack:acme-web@0.4.0
  hooks.json id harness-acme-scan     pack:acme@1.2.0  ↔  pack:acme-web@0.4.0
  해결: 한 팩에서 빼고 새 버전을 낸다. 또는 프로젝트가 직접 관리한다:
        npx harness-kit update --forget .agents/rules/security-extra.md   (주인을 user 로 바꾼다)
```

덮어쓴 것은 충돌이 아니고 보고만 한다:

```text
↷ .agents/docs/_spec-templates/design/_template.md   kit@2.0.0 → pack:acme@1.2.0 (overrides 선언)
↷ .agents/rules/tech.md                              kit@2.0.0 → user (사람이 고친 파일)
```

### 3.6 개인 층

```text
.agents/local/                      .gitignore 에 있다(킷 템플릿 .gitignore 에 추가)
├── harness-kit.local.json          roles · git.ide 만
├── harness-kit.local.lock          개인 배치 기록(lock v2 형식, owner "user")
├── rules/<이름>.md                 개인 규칙
├── skills/<이름>/SKILL.md          개인 스킬
└── hooks.json                      개인 훅(hooks.json 과 같은 형식)
```

```jsonc
// .agents/local/harness-kit.local.json
{
  "roles": { "review": { "harness": "claude" } },   // 받는다: 역할별 harness
  "git": { "ide": "idea" },                          // 받는다
  "verify": { "fullOnlyInCI": false },               // 무시 + doctor 경고
  "flow": { "gates": ["requirements"] }              // 무시 + doctor 경고
}
```

| 키 | 개인 층 |
|---|---|
| `roles.<역할>.harness` · `git.ide` | 덮는다 |
| `flow.*` · `approvers` · `groups` · `verify.*` · `issueKey.*` · `git.base` · `git.worktreeRoot` · `git.maxPerRepo` · `packs` · `modules` · `agents` | 무시, `personal-ignored` 경고 |

개인 파일의 배치(공유 lock에 기록하지 않는다):

| 원본 | Claude Code | Codex | Kiro |
|---|---|---|---|
| `skills/<이름>/` | `.claude/skills/<이름>` 링크 | `.agents/skills/<이름>` 링크 | `.kiro/skills/<이름>` 링크 |
| `rules/<이름>.md` | 6장 확인(로컬 메모리 파일 지원) | 6장 확인 | `.kiro/steering/local-<이름>.md` render |
| `hooks.json` | `.claude/settings.local.json` merge | 지원 없음 → doctor 정보 | `.kiro/hooks/local-<id>.json` render |

- 공유 폴더 안에 만든 개인 파일(`.agents/skills/<이름>` 링크 등)은 `.git/info/exclude`의 킷 블록(`# harness-kit local begin` … `end`)에 경로를 적어 git이 보지 않게 한다. `.git/info/exclude`는 리포 안이고 커밋되지 않는다.
- 공유 스킬·규칙과 이름이 같으면 배치하지 않는다: `⚠ 개인 스킬 hx-plan 은 공유 스킬과 이름이 같아 배치하지 않았다`.
- 개인 훅은 floor 훅 id를 쓸 수 없다. 개인 훅이 같은 이벤트에 더해지는 것은 허용한다.
- 하네스 자체 로컬 설정으로 킷 훅을 끄는 경우도 doctor가 본다: `.claude/settings.local.json`의 `disableAllHooks: true`, 킷 훅 명령을 덮는 항목 → `personal-weakens` 경고.

### 3.7 팩·프로젝트 훅과 검증 단계

- 팩 훅은 `fragments/hooks.json`에서 와서 `.agents/hooks.json`에 `owner: "pack:<이름>"`으로 들어간다. 어댑터는 킷 훅과 같은 방식으로 하네스 설정을 만든다(03 §3.4). 스크립트는 팩이 깐 `scripts/` 파일이어야 한다.
- 프로젝트 훅은 `.agents/hooks.json`에 직접 적는다(`owner: "user"`, id `harness-` 접두 — 병합 알고리즘이 킷 관리 항목으로 찾는 표지). lock `keys`에는 넣지 않으므로 킷 `uninstall`이 지우지 않는다.
- 검증 단계는 `.agents/verify-checks.json`에 같은 방식으로 들어가고 changed·affected 레벨에서 경로가 맞으면 돈다(01 §3.1).

### 3.8 게이트 하한

| 항목 | 하한 | 프로젝트 | 팩 | 개인 | 어기면 |
|---|---|---|---|---|---|
| `flow.gates` | `requirements` · `design` · `mr` · `done`이 있다 | 더할 수 있다. 빼면 doctor 오류 | 설정 파일을 쓰지 않는다 | 무시 | `gate-floor`(오류). `check-sdd-prerequisites`는 설정과 상관없이 하한 게이트를 검사한다 |
| floor 훅 | `harness-protect-sources` · `harness-block-full-verify` · `harness-verify-gate` | hooks.json에서 지우면 doctor `missing`, `repair`가 되살린다 | 같은 id 정의 불가(설치 거부) | 같은 id 불가 | 오류 |
| `approvers` | 없음. 비우면 이 리포의 git 사용자 누구나 승인한다(README §5) | 게이트마다 정할 수 있다 | 불가 | 무시 | 오류 없음. `deploy`의 `risk: high` 두 사람 규칙은 그대로다(14 §3.4) |
| 보호 경로 deny | `permissions.deny`의 `{{PROTECTED_PATH}}` 항목 | `PROTECTED_PATH` 토큰으로 바꾼다 | 불가 | 무시 | `merge-missing`(오류) |
| `verify.fullOnlyInCI` | 기본 `true` | `false`로 바꿀 수 있다(팀 결정, MR로) | 불가 | 무시 | `false`면 `full-allowed` 경고 |

하한은 킷 코드에 상수로 둔다(`packages/cli/src/core/floor.ts`, `scripts/harness/sdd_layout.py`의 `GATE_FLOOR`). 설정으로 바꿀 수 없다.

### 3.9 `pack new`

```text
npx harness-kit pack new <이름> --dir <경로> [--from <리포 경로>]… [--kit-range ">=2.0.0 <3.0.0"]
```

1. `--dir`는 필수다. 빈 폴더이거나 없는 경로여야 한다. 현재 리포의 `.agents/` 안이면 거부한다.
2. 골격을 만든다: `pack.json`(version `0.1.0`), `README.md`, `common/`, `fragments/hooks.json`(빈 배열), `fragments/verify-checks.json`(빈 배열), `tests/test_pack.py`(3.2 검증을 도는 시험), `.gitignore`.
3. `--from`마다 리포 경로를 layout.json 세그먼트로 거꾸로 바꿔 복사한다: `.agents/rules/acme-security.md` → `common/agents-rules/acme-security.md`. 종류에 맞게 `provides`에 이름을 더한다. 킷이 가진 경로면 `overrides`에 넣고 경고한다.
4. 훅·검증 단계는 `--from .agents/hooks.json#harness-x`처럼 `#id`로 고른다. id를 `harness-<팩 이름>-` 접두로 바꾼다.
5. 끝에 다음 단계를 출력한다: `git init` → 커밋 → `git tag v0.1.0` → 프로젝트 `packs`에 `git:<host>/<path>#v0.1.0` → `update --packs`.

### 3.10 doctor 덮어쓰기 보고

`npx harness-kit doctor --only overrides [--json]`:

```text
덮어쓴 것 (이긴 층 ← 진 층)
  .agents/docs/_spec-templates/design/_template.md   pack:acme@1.2.0 ← kit@2.0.0
  .agents/rules/tech.md                              user ← kit@2.0.0          (.new 없음)
  .agents/verify-checks.json#api-snapshot            user
  roles.review.harness                               local(claude) ← project(codex)
무시한 개인 설정 2건
  .agents/local/harness-kit.local.json verify.fullOnlyInCI — 개인 층은 roles · git.ide 만 바꾼다
  .agents/local/harness-kit.local.json flow.gates
하한 0건 위반
```

```jsonc
{ "overrides": [
    { "target": ".agents/docs/_spec-templates/design/_template.md", "winner": "pack:acme@1.2.0", "losers": ["kit@2.0.0"], "declared": true },
    { "target": "roles.review.harness", "winner": "local", "value": "claude", "losers": [{ "layer": "project", "value": "codex" }] }
  ],
  "ignoredPersonal": [ { "key": "verify.fullOnlyInCI", "file": ".agents/local/harness-kit.local.json" } ],
  "floorViolations": [] }
```

관리 페이지 하네스 탭(P20, [06](06-dashboard.md))이 같은 JSON을 읽는다.

### 3.11 올리는 경로: 프로젝트 → 팩 → 킷

1. 프로젝트 → 팩: `pack new acme --from <파일>… --dir ../acme-harness-pack` → 팩 리포 MR·태그 → 프로젝트 `packs`에 추가 → `update --packs`.
2. 팩 → 킷: 킷 MR이 일반화한 판을 템플릿에 넣는다(회사 이름·사내 주소를 빼고, 외부 도구 이름은 모듈 안에만 — D1). 팩의 다음 버전은 그 파일을 빼고 `requires.kit`을 그 킷 버전 이상으로 올린다.
3. knots의 역수출 도구(`tools/harness/kit_export`)가 하던 일은 1번 경로로 바꾼다.

주인 이전 규칙(`update`·`update --packs` 때):

| 지금 주인 | 새로 제공하는 층 | 조건 | 결과 |
|---|---|---|---|
| `user` | 팩 | sha(C) = sha(팩 판) | 주인 `pack:<이름>`, 파일 그대로 |
| `user` | 팩 | 다르다 | `user` 유지, `↷ 프로젝트 판이 팩 판과 다르다` 보고 |
| `pack:<이름>` | 킷(팩이 그 파일을 뺐다) | sha(C) = 팩 기준 B | 주인 `kit`, 내용을 킷 판으로(달라졌으면 update) |
| `pack:<이름>` | 킷 | sha(C) ≠ B | 주인 `user`, 킷 판은 `.new` |

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 팩을 킷 저장소의 fork로 운영 | 킷을 올릴 때마다 fork를 병합해야 한다. 팩은 바뀐 파일만 가진다 |
| 팩이 하네스 파일(`.claude/` 등)을 직접 가진다 | 원본이 두 곳이 된다. 하네스 파일은 어댑터가 원본에서 만든다 |
| 팩끼리 같은 경로면 `packs` 순서로 뒤가 이긴다 | 순서를 바꾸는 MR 하나로 보안 규칙이 조용히 바뀐다. 충돌로 멈추고 사람이 정한다 |
| 팩이 `overrides` 선언 없이 킷 경로를 덮는다 | 킷 업데이트 내용이 이유 없이 사라진다. 선언이 있어야 doctor 보고가 의미를 가진다 |
| 개인 층이 모든 설정을 덮는다 | 개인 설정 하나로 검증·승인 게이트가 꺼진다(05장 원칙) |
| 개인 파일도 공유 lock에 기록 | 공유 lock이 사람마다 달라져 커밋마다 충돌한다 |
| 팩 캐시를 사용자 폴더(`~/.cache`)에 | 프로젝트 밖에 쓴다(README 원칙 7) |

## 5. 완료 기준

[03장 P18 완료 기준](../harness-next/03-plan.html#p18)의 확장 층 두 항목을 포함한다.

1. `packs: ["file:fixtures/acme-pack"]` fixture에서 `update --packs` → 팩 파일 6개가 `pack:acme`로 기록된다. 템플릿을 바꾼 킷으로 `update` → 그 6개 파일의 sha256이 그대로다.
2. 개인 설정에 `{"verify": {"fullOnlyInCI": false}, "flow": {"gates": []}}`를 넣으면 full 차단 훅이 여전히 막고, `doctor`가 `personal-ignored` 2건을 낸다.
3. 같은 경로를 가진 팩 두 개 → `update --packs` exit 4, 쓴 파일 0개.
4. `overrides`에 없는 킷 경로를 가진 팩 → exit 3. floor 훅 id를 가진 팩 → exit 3.
5. `pack new acme --from .agents/rules/acme-security.md --dir <임시>` → 그 팩을 빈 리포에 `file:`로 깔면 `.agents/rules/acme-security.md` 바이트가 원래 리포와 같다.
6. `doctor --only overrides --json`의 `overrides` 수 = 이긴 층이 `kit`이 아닌 경로·항목 수(fixture에서 셈과 같다).
7. 프로젝트가 `flow.gates`에서 `design`을 빼면 `doctor --check` exit 1. `check-sdd-prerequisites`는 design approved 없이 tasks 생성을 거부한다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| Claude Code의 개인 메모리 파일(`CLAUDE.local.md`) 지원 상태 | 현재 문서와 실제 동작. 지원하지 않으면 개인 규칙은 Claude에 배치하지 않고 doctor 정보로 남긴다 |
| `.claude/settings.local.json` 훅이 공유 설정 훅과 합쳐지는지, `disableAllHooks`의 범위 | 두 파일에 서로 다른 Stop 훅을 두고 둘 다 도는지 본다 |
| Codex의 개인용 지침 파일(예: `AGENTS.override.md`) 동작과 커밋 여부 | Codex 문서와 실제 동작 |
| `.git/info/exclude`가 worktree에서도 적용되는지 | worktree에서 `git status`로 개인 링크가 안 보이는지 본다(공통 git 폴더의 파일이다) |
| 사내 GitLab 비공개 팩을 `git clone`할 때 인증 방식(ssh · 토큰) | 현장 장비 두 대에서 `update --packs --dry-run` |
| 팩끼리 충돌 정책(멈춤) | 사람 확인. 순서 우선이 필요한 팀이 있으면 `packs` 항목 형식을 바꿔야 한다(README §5 수정) |
| `pack new --dir`가 리포 밖 경로에 쓰는 것과 README 원칙 7 | 사람 확인. 이 문서는 사람이 명시한 경로에만 쓰는 예외로 둔다 |
