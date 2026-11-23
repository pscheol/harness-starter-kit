# 07. 스킬 목록과 스킬 지도

- 단계: P20(v2.2). 선행: P18(하네스 어댑터, 03).
- 방향과 이유: [02 #skills](../harness-next/02-direction.html#skills) · [04 #skills](../harness-next/04-usage.html#skills) · [05 #extend](../harness-next/05-principles.html#extend) · [03 #p20](../harness-next/03-plan.html#p20)
- 쓰는 곳: 대시보드 스킬 탭(06), `npx harness-kit skills`, 기획물 명령(08), `/hx-review`(09).

## 1. 목적·범위

이 컴퓨터와 리포에 있는 스킬을 모아 이름·설명·출처·쓸 수 있는 하네스·이름 겹침을 보여 주고, 킷 흐름의 단계에 연결한다. 킷 명령은 이 연결(스킬 지도)로 깔린 스킬을 찾아 쓰고, 없으면 킷 템플릿을 쓴다.

범위에 넣는 것: 읽는 위치와 순서, `SKILL.md` 머리 읽기, Claude 플러그인 해석, 중복·이름 겹침, 하네스별 사용 가능 여부, `.agents/skill-map.json` 형식, 설명 낱말로 단계 추정, CLI `skills`, 개인 정보 규칙.

범위 밖: 스킬 설치·삭제, 사용자 폴더 수정, 스킬 본문 품질 평가, 하네스 어댑터 자체(03).

측정값(2026-11-23, 이 컴퓨터, 읽기만 했다):

| 위치 | `<위치>/*/SKILL.md` | 그중 심볼릭 링크 | 비고 |
|---|---|---|---|
| `~/.claude/skills` | 221 | 152(→ `~/.agents/skills`) | 하위 폴더(`gstack/` 등) 안에 SKILL.md 131개가 더 있다(한 단계 아래) |
| `~/.agents/skills` | 156 | 0 | |
| `~/.kiro/skills` | 143 | 135(→ `~/.agents/skills`) | |
| `~/.codex/skills` | 2 | 0 | 항목 3개 중 1개는 SKILL.md 없는 폴더 |
| `~/.cursor/skills` · `~/.gemini/skills` | 2 · 1 | 0 | |
| 사용자 위치 합계 | 525 파일 | — | 실제 파일(realpath) 238개 |
| 플러그인 캐시 전체 | 1,296 | — | 마켓플레이스 14곳, 버전 폴더 74개. harness-next의 1,278은 다른 날 측정값 |
| 켜 둔 플러그인 41개의 설치 버전 | 488 | — | `installed_plugins.json`의 `installPath` + `plugin.json`의 `skills` 경로 기준 |

## 2. 요구사항

| ID | 요구사항(EARS) |
|---|---|
| SK-R1 | 스캐너는 §3.1 표의 위치만 읽고, 리포 밖에는 쓰지 않는다. |
| SK-R2 | 스캐너는 각 스킬에서 `SKILL.md` 한 파일만 읽고, 앞 64 KiB 안의 머리만 해석한다. |
| SK-R3 | 위치 바로 아래 폴더(`<위치>/<이름>/SKILL.md`)만 스킬로 센다. 더 깊은 SKILL.md는 `nested` 정보로만 센다. |
| SK-R4 | 플러그인은 켜 둔 것만, 그 플러그인의 설치 기록이 가리키는 버전 하나만 읽는다. |
| SK-R5 | 같은 realpath에 여러 위치로 닿으면 스캐너는 스킬 하나로 묶고 위치를 모두 기록한다. |
| SK-R6 | 내용(sha256)이 다른 두 스킬이 같은 이름이고 같은 하네스에 보이면 스캐너는 이름 겹침으로 보고하고, 그 하네스 규칙으로 어느 쪽이 쓰이는지 적는다. |
| SK-R7 | 스캐너는 스킬마다 하네스(Claude · Codex · Cursor · Kiro · Gemini)별 `loaded` · `shadowed` · `no`를 계산한다. |
| SK-R8 | 스킬 지도에 있는 스킬은 지도의 단계를, 머리의 `metadata.hx-stages`가 있으면 그 단계를, 둘 다 없으면 설명 낱말로 추정한 단계를 `추정`으로 표시한다. |
| SK-R9 | 킷 명령이 스킬 지도의 칸(slot)을 찾으면 목록 순서대로 처음으로 깔려 있고 현재 하네스에서 `loaded`인 스킬을 쓰고, 없으면 지도에 적힌 대체 템플릿을 쓴다. |
| SK-R10 | `npx harness-kit skills --stage <단계>`는 그 단계의 스킬을 지도 출처 먼저, 추정 다음 순서로 출력한다. |
| SK-R11 | 스캔 결과는 커밋하지 않고, 대시보드 내보내기·네트워크 전송에 넣지 않는다. |
| SK-R12 | 머리가 없거나 YAML 오류인 SKILL.md는 목록에 `error`로 남기고 스캔을 계속한다. |
| SK-R13 | 심볼릭 링크가 고리를 이루거나 대상이 일반 파일이 아니면 스캐너는 그 항목을 건너뛰고 `error`로 남긴다. |
| SK-R14 | 스킬 지도에 절대경로·홈 경로가 들어 있으면 doctor가 경고한다. |
| SK-R15 | 이 컴퓨터에서 스킬 탭의 위치별 개수는 같은 규칙(§3.1 · §3.4)으로 센 `find` 결과와 같다. |

## 3. 설계

### 3.1 읽는 위치와 순서

어댑터(03)가 하네스마다 `skillRoots()`를 내고, 스캐너는 그 합집합을 아래 순서로 읽는다. 순서는 표시 순서와 이름 겹침 판정의 입력이다. 어떤 하네스가 어느 위치를 읽는지는 어댑터가 원본이고, 아래는 v2.2 기본값과 근거다.

| 순서 | 위치 | scope | 읽는 하네스 | 근거 |
|---|---|---|---|---|
| 1 | `<리포>/.agents/skills/` | project | Codex(작업 폴더 → 리포 루트), Cursor, Gemini(별칭), Claude는 킷 링크 `.claude/skills/hx-*`로 | Codex Build skills, Cursor Skills, Gemini CLI Skills 문서 |
| 2 | `<리포>/.claude/skills/` | project | Claude, Cursor(호환 경로) | Claude Code Skills, Cursor Skills |
| 3 | `<리포>/.kiro/skills/` | project | Kiro(에이전트 `resources`의 `skill://` 패턴) | Kiro custom agents 설정 문서 |
| 4 | `<리포>/.cursor/skills/` · `.gemini/skills/` · `.codex/skills/` | project | Cursor · Gemini · Cursor(호환) | 같은 문서 |
| 5 | `<리포>/<하위>/.claude/skills/` · `<하위>/.agents/skills/`(깊이 4까지) | `nested:<하위>` | Claude(그 하위 파일을 읽을 때), Cursor | Claude Code Skills "Nested", Cursor Skills |
| 6 | `~/.agents/skills/` | user | Codex, Cursor, Gemini(별칭) | 같은 문서 |
| 7 | `~/.claude/skills/` | user | Claude, Cursor(호환) | 같은 문서 |
| 8 | `~/.codex/skills/` | user | Cursor(호환). Codex는 문서에 없다(§6) | Cursor Skills |
| 9 | `~/.cursor/skills/` | user | Cursor | Cursor Skills |
| 10 | `~/.kiro/skills/` | user | Kiro(§6) | — |
| 11 | `~/.gemini/skills/` | user | Gemini | Gemini CLI Skills |
| 12 | Claude 플러그인(§3.3) | `plugin:<이름>` | Claude(`플러그인:스킬` 이름으로) | Claude Code Skills "Plugin" |

- 리포 폴더 탐색(순서 5)은 `.git` · `node_modules` · `build` · `dist` · `target` · `.venv` · `.gradle` · worktree 자리를 건너뛴다.
- 사용자 위치(6~12)는 `--no-user`로 끌 수 있다. CI와 `--export`는 사용자 위치를 읽지 않는다.

### 3.2 `SKILL.md` 읽기

```text
read(path):
  lstat로 일반 파일 또는 심볼릭 링크 확인, realpath 계산(고리면 error: "symlink-loop")
  크기 > 256 KiB → error: "too-large"
  앞 64 KiB만 읽는다. UTF-8로 풀지 못하면 error: "encoding"
  첫 줄이 "---"가 아니면 error: "no-frontmatter"
  다음 "---" 줄까지를 YAML로 읽는다(core 스키마, 별칭 0개, 태그 금지, 깊이 8)
  YAML 오류 → error: "yaml"
  name = fm.name(없으면 폴더 이름, warn: "name-missing")
  description = fm.description(없으면 warn: "description-missing")
  name에 ":"이 있으면 warn: "name-colon"(Claude가 쓰지 못한다)
  name ≠ 폴더 이름이면 warn: "name-dir-mismatch"(Codex는 name으로 찾는다)
  sha256 = 파일 전체 바이트의 sha256(앞 64 KiB만이 아니라 전체. 256 KiB 한도 안)
```

남기는 머리 필드: `name` · `description`(화면 표시는 1,024자) · `model` · `effort` · `context` · `agent` · `disable-model-invocation` · `user-invocable` · `allowed-tools` · `argument-hint` · `metadata.hx-stages`. 다른 필드는 버린다. 스킬 폴더의 다른 파일(scripts·references)은 열지 않는다.

`metadata.hx-stages`는 킷이 정한 선택 필드다(`[design]` 같은 배열). Agent Skills 표준의 `metadata` 맵 안에 두므로 다른 하네스가 무시한다. 킷 스킬(`hx-*`)은 모두 이 필드를 둔다.

### 3.3 Claude 플러그인 해석

```text
installed = ~/.claude/plugins/installed_plugins.json        # version 2, plugins[id] = [항목…]
enabled   = enabledPlugins를 아래 순서로 덮어 합친다(뒤가 이긴다):
            ~/.claude/settings.json → <리포>/.claude/settings.json → <리포>/.claude/settings.local.json
for id, on in enabled where on == true:
    항목 = installed[id] 중 scope == "user" 이거나 (scope ∈ {project, local} 이고 projectPath == 리포 루트)
    고르기: project·local(이 리포) > user, 같은 scope가 여럿이면 lastUpdated가 가장 늦은 것
    항목이 없으면: ~/.claude/plugins/cache/<마켓>/<플러그인>/ 아래 버전 폴더에서
        semver로 읽히는 것 중 최대, 없으면 폴더 mtime 최신. versionSource = "cache-guess"
    installPath가 ~/.claude/plugins/cache/ 밖이거나 없으면 error: "install-path"
    skillPaths = plugin.json "skills"(문자열 또는 배열), 없으면 ["./skills/"]
    for p in skillPaths:
        base = normalize(installPath / p), installPath 밖이면 건너뜀
        base/SKILL.md가 있으면 스킬 하나, 아니면 base/*/SKILL.md 각각
    스킬 id = "<플러그인 이름>:<스킬 name>"
```

- 측정(2026-11-23): 설치 기록 41개 중 항목이 둘 이상인 플러그인 6개(`feature-dev`는 22개, 대부분 project scope). `plugin.json`이 `skills`를 배열로 적은 플러그인(예: `mattpocock-skills` 27개 경로)과 `./.claude/skills/`를 가리키는 플러그인이 있어서 `skills/*/SKILL.md`만 세면 454개, 위 규칙으로 세면 488개다.
- 꺼 둔 플러그인과 이전 버전 폴더는 읽지 않는다. 캐시 전체 1,296개를 다 읽으면 같은 스킬이 버전마다 겹친다.
- 관리 설정(managed settings)의 `enabledPlugins`는 v2.2에서 읽지 않는다(§6).

### 3.4 중복과 이름 겹침

1. 물리 동일: realpath가 같으면 한 스킬이다. `locations[]`에 닿은 위치를 모두 적는다. 측정: 사용자 위치 525파일 → 238개.
2. 내용 동일: realpath가 달라도 sha256이 같으면 `copies[]`로 묶어 한 줄에 보여 준다.
3. 이름 겹침: 같은 `name`, 다른 sha256, 같은 하네스에 `loaded` 후보로 보이면 `conflicts[]`에 넣는다. 측정: 사용자 위치끼리 5건(`ui-ux-pro-max` · `impeccable` · `service-planning-agent` · `reverse-engineer-anything` · `ui-design-brain`), 사용자 스킬과 플러그인 스킬 사이 이름이 같은 것 13건(Claude는 플러그인 이름을 붙이므로 실행 때 겹치지 않는다).

하네스별 우선 규칙:

| 하네스 | 같은 이름일 때 | 근거 |
|---|---|---|
| Claude | enterprise > personal(`~/.claude/skills`) > project. 플러그인은 `플러그인:이름`이라 겹치지 않는다. nested는 project와 같이 뜬다 | Claude Code Skills "Resolve skills that share a name" |
| Codex | 합치지 않고 둘 다 선택 목록에 뜬다(`both`) | Codex Build skills |
| Gemini | workspace > user, 같은 층에서 `.agents/skills` > `.gemini/skills` | Gemini CLI Skills |
| Cursor | 문서에 규칙이 없다. `both`로 표시하고 §6에 둔다 | Cursor Skills |
| Kiro | 에이전트 `resources`의 패턴 순서에 따른다(§6) | — |

스킬 id 규칙: 플러그인 스킬은 `<플러그인>:<이름>`, 나머지는 `<이름>`. 이름에 `:`를 쓸 수 없으므로 둘이 섞이지 않는다. 같은 이름이 여러 개면 스킬 지도는 이름으로 적고, 해석은 위 하네스 규칙을 따른다.

### 3.5 하네스별 사용 가능 여부

```text
for skill in skills:
  for h in harnesses:
     후보 = skill.locations 중 h가 읽는 위치(§3.1)
     if 후보 없음: status[h] = "no"
     elif 같은 이름의 다른 스킬이 h 규칙(§3.4)에서 이긴다: status[h] = "shadowed"(이긴 스킬 id 기록)
     elif skill.error 있음: status[h] = "no"(이유 기록)
     else: status[h] = "loaded"
```

기본 출력은 `harness-kit.json`의 `agents`에 있는 하네스만 보여 준다. `--all`이면 다섯 하네스를 모두 보여 준다.

### 3.6 스캔 결과 형식

```json
{
  "schema": "harness-kit.skills-inventory/v1",
  "scannedAt": "2026-11-23T11:02:10+09:00",
  "roots": [
    { "path": "~/.claude/skills", "scope": "user", "count": 221, "symlinks": 152, "nested": 131, "errors": 0 },
    { "path": "plugin:superpowers@claude-plugins-official", "scope": "plugin", "version": "7.0.2", "versionSource": "installed", "count": 14 }
  ],
  "skills": [
    {
      "id": "service-planning-agent",
      "name": "service-planning-agent",
      "description": "한국어 기반 플랫폼/서비스 기획 전문 스킬. …",
      "sha256": "e3b0…",
      "locations": [ { "path": "~/.agents/skills/service-planning-agent", "scope": "user" },
                     { "path": "~/.claude/skills/service-planning-agent", "scope": "user", "via": "symlink" } ],
      "copies": [ "~/.codex/skills/service-planning-agent" ],
      "harnesses": { "claude": "loaded", "codex": "both", "cursor": "both", "kiro": "loaded", "gemini": "no" },
      "stages": [ { "stage": "design", "slot": "screen-plan", "source": "map" } ],
      "fields": { "model": null, "effort": null, "context": null },
      "warnings": [], "error": null
    }
  ],
  "conflicts": [
    { "name": "impeccable", "candidates": ["~/.cursor/skills/impeccable", "~/.agents/skills/impeccable"],
      "winner": { "claude": "~/.claude/skills/impeccable", "codex": "both" } }
  ]
}
```

- 경로는 `~/…` 또는 리포 상대로 쓴다. 홈 절대경로를 넣지 않는다.
- 캐시는 `.agents/state/skills-cache.json`(0600)에 둔다. stamp는 위치별 디렉터리 목록 + 각 SKILL.md의 `(mtimeMs, size)` + `installed_plugins.json`·`settings.json` stat이다. TTL 10분, `--refresh`면 무시한다.

### 3.7 `.agents/skill-map.json`

커밋하는 파일이고 스킬 id만 담는다(장비 정보 아님). 킷 기본값(주인 kit) → 회사 팩 → 프로젝트 순으로 쌓이고(04), 개인 층 `.agents/local/skill-map.local.json`은 칸 목록 앞에 항목을 더하는 것만 한다.

```json
{
  "schema": "harness-kit.skill-map/v1",
  "stages": {
    "design": {
      "requirements": ["pm-execution:create-prd", "service-planning-agent"],
      "stories":      ["pm-execution:user-stories", "pm-execution:job-stories"],
      "screen-plan":  ["service-planning-agent", "ui-ux-pro-max"],
      "design-plan":  ["impeccable", "ui-ux-pro-max", "gstack-design-consultation"],
      "backlog":      ["pm-execution:user-stories"]
    },
    "implement": {
      "tdd": ["superpowers:test-driven-development", "mattpocock-skills:tdd"]
    },
    "verify": {
      "review":   ["code-review:code-review", "gstack-review"],
      "security": ["security-review"],
      "qa":       ["gstack-qa"]
    },
    "docs": { "release-docs": ["gstack-document-release", "claude-md-management:revise-claude-md"] },
    "ops":  { "canary": ["gstack-canary"], "retro": ["gstack-retro"] }
  },
  "commands": {
    "/hx-intent":      { "slots": ["design.requirements", "design.stories"], "fallback": "builtin" },
    "/hx-screen-plan": { "slots": ["design.screen-plan"], "fallback": "template:plans/screens" },
    "/hx-design-plan": { "slots": ["design.design-plan"], "fallback": "template:plans/design-plan.md" },
    "/hx-backlog":     { "slots": ["design.backlog"], "fallback": "template:plans/backlog.md" },
    "/hx-implement":   { "slots": ["implement.tdd"], "fallback": "builtin", "mode": "advisory" },
    "/hx-review":      { "slots": ["verify.review", "verify.security"], "fallback": "builtin", "mode": "advisory" },
    "/hx-docs":        { "slots": ["docs.release-docs"], "fallback": "builtin", "mode": "advisory" }
  },
  "exclude": []
}
```

- 단계 키는 `design` · `implement` · `verify` · `docs` · `ops`이고 화면·CLI는 설계 · 구현 · 검증 · 반영 · 운영으로 보여 준다. CLI는 둘 다 받는다.
- `fallback`: `builtin`(명령 안에 내장된 절차), `template:<_spec-templates 기준 경로>`.
- `mode: advisory`: 스킬은 참고 입력으로만 쓰고 출력 형식·게이트는 킷 명령이 정한다. 리뷰 판정(09)은 스킬 결과로 바꾸지 않는다.
- `exclude`: 추정 결과에서 뺄 스킬 id.

칸 해석:

```text
resolve(command, harness):
  for slot in map.commands[command].slots:
     for id in local.prepend[slot] + map.stages[stage][slotName]:
        s = inventory.find(id)
        if s and s.harnesses[harness] in {"loaded", "both"} and not s.error:
           return {skill: id, slot}
  return {fallback: map.commands[command].fallback}
```

명령은 결과를 산출물 머리에 남긴다: `generatedWith: skill:service-planning-agent` 또는 `generatedWith: template:plans/screens`(08 §3.8).

### 3.8 단계 추정(추정)

지도·`metadata.hx-stages` 둘 다 없는 스킬만 추정한다. 이름 일치는 3점, 설명 일치는 1점이다. 가장 높은 단계가 2점 이상이면 그 단계, 두 단계가 같은 점수면 둘 다, 2점 미만이면 `미분류`다. 결과에는 `source: "추정"`과 맞은 낱말을 남긴다.

| 단계 | 낱말(대소문자 무시, 부분 일치) |
|---|---|
| design | prd, requirement, user stor, persona, wireframe, storyboard, ux, ui design, design system, ia, journey, 기획, 요구사항, 화면, 와이어프레임, 스토리, 디자인 |
| implement | tdd, test-driven, implement, refactor, scaffold, patterns, coding standard, build error, 구현, 리팩터 |
| verify | review, security, audit, scan, vulnerab, qa, coverage, lint, regression, 리뷰, 보안, 검증, 점검, 취약 |
| docs | documentation, docs, changelog, release note, readme, codemap, 문서, 릴리스 노트 |
| ops | deploy, canary, monitor, incident, retro, rollback, observability, on-call, 배포, 장애, 운영, 회고 |

- 측정 기준: `tests/fixtures/skills/labeled.json`(이 컴퓨터 스킬 설명 60개에 사람이 단계를 붙인 표)에서 추정 정확도를 잰다.
- 생활 정보 스킬(날씨·교통·쇼핑 등)은 낱말이 맞지 않아 `미분류`가 된다. 낱말 표는 킷 원본이고 팀이 지도로 바로잡는다.

### 3.9 CLI

```text
npx harness-kit skills [--stage <단계>] [--harness <h>] [--conflicts] [--errors]
                       [--all] [--no-user] [--refresh] [--json]
```

| 인자 | 동작 |
|---|---|
| (없음) | 위치별 개수 요약, 지도 칸별 해석 결과(어떤 스킬이 쓰일지) |
| `--stage 설계` | 그 단계 스킬: 지도 출처 → `metadata.hx-stages` → 추정 순. 열: 이름 · 칸 · 출처 · 하네스 · 위치 |
| `--harness codex` | 그 하네스에서 `loaded`·`both`인 것만 |
| `--conflicts` · `--errors` | 이름 겹침 · 오류 항목만 |
| `--json` | §3.6 형식 |

종료 코드: 0 정상(경고 있어도), 2 인자 오류, 3 리포 밖에서 실행(`harness-kit.json` 없음). 3일 때도 사용자 위치 목록은 출력하고, 지도 해석만 건너뛴다.

출력 예:

```text
설계 단계 — 쓸 수 있는 스킬 7개(현재 하네스: claude)
칸            스킬                          출처   claude  codex  위치
screen-plan   service-planning-agent        지도   loaded  both   ~/.agents/skills
screen-plan   ui-ux-pro-max                 지도   loaded  both   ~/.agents/skills (이름 겹침 1)
design-plan   impeccable                    지도   loaded  both   ~/.claude/skills
requirements  pm-execution:create-prd       지도   loaded  no     plugin pm-execution 2.3.0
—             pm-product-discovery:interview 추정  loaded  no     plugin pm-product-discovery
```

### 3.10 개인 정보

- 스캔 결과·캐시는 `.agents/state/`에만 두고 커밋하지 않는다. `.agents/state/`는 킷 `.gitignore`에 있다.
- 대시보드 `--export`는 스킬 탭과 데이터를 만들지 않는다(06 §3.12).
- 스캐너는 네트워크를 쓰지 않는다. 스킬 설명을 외부 서비스·모델에 보내지 않는다.
- 사용자 위치는 읽기만 한다. 링크를 고치거나 빠진 스킬을 복사하지 않는다. 하네스에 스킬이 안 보이면 안내 문장만 출력한다.
- `skill-map.json`에는 스킬 id만 둔다. doctor가 `/`·`~`로 시작하는 값을 찾으면 경고한다(SK-R14).

### 3.11 성능과 오류

- 동시 파일 읽기 32개, SKILL.md 앞 64 KiB만. 사용자 위치 525 + 플러그인 488 기준 첫 스캔 1.5초 이하, 캐시가 맞으면 200ms 이하(SSD).
- 오류는 항목에 남기고 계속한다. 위치 자체를 못 읽으면(권한) `roots[].error`에 적는다.
- `installed_plugins.json`의 `version`이 2가 아니면 플러그인 해석을 건너뛰고 경고한다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 플러그인 캐시의 모든 버전 폴더를 읽는다 | 1,296개 중 같은 스킬이 버전마다 겹치고, 꺼 둔 플러그인까지 보인다 |
| 캐시 폴더의 가장 높은 버전만 고른다 | 버전 이름이 커밋 해시(`7d48aaa124cc`)인 플러그인이 있고, 실제로 쓰는 버전은 설치 기록이 안다. 설치 기록이 없을 때만 쓴다 |
| 하네스 CLI로 목록을 받는다(`claude` 안의 스킬 목록 등) | 비대화형 목록 명령이 문서에 없고, 세션을 띄우면 수 초가 걸리며 토큰을 쓴다 |
| 모델로 단계를 분류 | 실행마다 결과가 달라지고 비용이 든다. 낱말 점수와 지도 수정으로 충분하다 |
| 스캔 결과를 리포에 커밋해 팀이 공유 | 개인 장비 정보다. 팀이 공유할 것은 지도(스킬 id)다 |
| 한 단계보다 깊은 SKILL.md도 스킬로 센다 | Claude 문서의 위치는 `<위치>/<이름>/SKILL.md`다. 실제로 뜨지 않는 스킬을 있다고 보여 주게 된다 |
| 빠진 하네스에 스킬 링크를 만들어 준다 | 사용자 폴더에 쓴다. 원칙 7을 어긴다 |

## 5. 완료 기준

1. 이 컴퓨터에서 스킬 탭의 위치별 개수가 같은 규칙의 `find`(`find -L <위치> -mindepth 2 -maxdepth 2 -name SKILL.md`)와 6/6 같다. 플러그인 합계는 §3.3 규칙을 구현한 시험 스크립트 값(2026-11-23 기준 488)과 같다.
2. 사용자 위치 525파일이 realpath 238개로 묶인다(같은 날 기준, 시험은 fixture 폴더로 고정).
3. fixture: 심볼릭 링크 고리, 머리 없음, YAML 오류, 300 KiB 파일, 이름에 `:` 각각 1개 → 모두 `error`·`warning`으로 남고 스캔이 끝까지 돈다.
4. fixture: 같은 이름·다른 내용 스킬을 `~/.claude/skills`와 `<리포>/.claude/skills`에 두면 Claude는 user 쪽 `loaded`, project 쪽 `shadowed`로 나온다.
5. fixture: `enabledPlugins`에서 꺼 둔 플러그인의 스킬 0개, 켠 플러그인은 설치 기록의 버전 하나만 나온다.
6. `/hx-screen-plan`이 `service-planning-agent`가 깔린 장비에서는 `generatedWith: skill:service-planning-agent`, 지운 fixture 홈에서는 `template:plans/screens`를 남긴다.
7. 라벨 fixture 60개에서 추정 단계 정확도 70% 이상, `미분류` 비율 40% 이하.
8. `--export` 결과와 `git status`에 스킬 이름·사용자 위치 경로가 0건이다. 스캐너 실행 중 `~/` 아래 파일 쓰기 0건(`fs_usage`·`strace` 또는 시험용 읽기 전용 홈으로 확인).
9. `skills --stage 설계 --json` 응답 시간: 캐시가 맞을 때 200ms 이하, 첫 스캔 1.5초 이하.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| Codex가 `~/.codex/skills`를 아직 읽는지(문서는 `~/.agents/skills`만 적는다) | 두 위치에 다른 이름 스킬을 두고 Codex 선택 목록을 본다 |
| Kiro가 `~/.kiro/skills`를 에이전트 `resources` 없이도 읽는지, `skill://` 패턴 순서가 이름 겹침을 정하는지 | Kiro 문서 확인, 시험 에이전트에서 같은 이름 스킬 두 개를 패턴 순서를 바꿔 본다 |
| Cursor의 이름 겹침 규칙 | 같은 이름 스킬을 `.agents/skills`·`.cursor/skills`·`~/.claude/skills`에 두고 본다 |
| Claude의 관리 설정 `enabledPlugins` 위치와 병합 순서 | Claude Code settings 문서의 precedence 절을 읽고 시험한다 |
| `installed_plugins.json` 형식(문서화되지 않은 내부 파일, version 2) | 릴리스마다 doctor 시험에서 `version` 값을 확인하고, 바뀌면 캐시 해석으로 내려간다 |
| Claude가 `~/.agents/skills`를 읽는지(문서에 없다) | 그 위치에만 있는 스킬을 Claude 세션 `/` 목록에서 찾아본다 |
| nested 스킬(`<하위>/.claude/skills`)이 Claude에서 이름 겹침 규칙에 어떻게 걸리는지 | 리포 루트와 하위에 같은 이름 스킬을 두고 본다 |
