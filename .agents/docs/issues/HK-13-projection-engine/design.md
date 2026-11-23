---
key: HK-13
area: cli
type: feat
title: 하네스 어댑터와 복사본 배치(mirror · render · merge)로 손 유지 파일을 없앤다
status: approved
created: 2026-11-23
---

# Design — HK-13 배치 엔진

근거: [requirements.md](requirements.md) R1~R9, [설계 03](../../../../docs/design/03-projection-and-hooks.md) §1 · §2 · §3.1~§3.3 · §3.5~§3.9 · §3.12 · §4~§6, [12](../../../../docs/design/12-model-routing.md) §3.1 · §3.3~§3.5, [02](../../../../docs/design/02-cli-engine.md) §3.7~§3.13, [README](../../../../docs/design/README.md) 원칙 1 · 8 · 10 · §4 · §6, [HK-11](../HK-11-cli-update-repair-uninstall/design.md) §2.1(op 갈래), [HK-12](../HK-12-cli-add-remove-outdated-skills/design.md) §7(lock 표시 줄).

## 1. 지금 동작(2c9ec78)

| 항목 | 지금 |
|---|---|
| 하네스 폴더 | 템플릿 `copy` 뿐이다. `.claude/commands/hx-*.md` 13 · `.cursor/commands/hx-*.md` 13 · `.kiro/skills/hx-*/SKILL.md` 13 · `.kiro/steering/*.md` 33(규칙 20 + 명령 13, jvm 기준) · `.claude/rules/code-maintenance.md` 1은 "원본을 읽어라" 포인터 · 요약이다(모듈 jira-workflow 포함) |
| 역할 | `.claude/agents/*.md` 5 · `.codex/agents/*.toml` 5 · `.kiro/agents/<역할>.json` 5를 손으로 맞춘다. 본문은 원본을 읽으라는 지시 + 출력 요약이다 |
| 규칙 자동 로드 | 없다. Kiro steering 20개가 `inclusion: always`로 요약을 매 세션 싣는다 |
| `CLAUDE.md` | 스택마다 템플릿(1,855~2,621바이트). `AGENTS.md`를 먼저 읽으라고 적는다(가져오기 `@AGENTS.md` 없음) |
| 포인터 생성 | 킷 개발용 `scripts/sync-commands.sh`가 스킬 원본 description으로 포인터 44개를 만든다 |
| CLI | lock에 `mirror` · `render` · `merge`가 있으면 update · repair · uninstall이 exit 3(HK-11 §2.1) |
| 검사 | `check_harness.py pointer_errors`가 포인터 안의 원본 경로 문자열을 본다. lock 기준 배치 검사는 없다 |

## 2. 하네스별 작업(R1)

원본(설치 뒤 리포 안): 규칙 `.agents/rules/<이름>.md`, 스킬 `.agents/skills/<이름>/`(`SKILL.md`가 있는 폴더), 역할 `.agents/roles/<이름>.md`, 정책 `.agents/model-policy.json`. 원본 목록은 "copy를 적용한 뒤의 리포"에서 읽는다(§6.1). 사람이 더한 원본도 같이 배치한다.

| 하네스 | 경로 | op | 원본 · 내용 |
|---|---|---|---|
| claude | `.claude/skills/<스킬>/` | mirror(폴더) | 스킬 폴더 통째 |
| claude | `.claude/rules/<규칙>.md` | mirror(파일) | 규칙 파일 그대로(머리 `paths` 포함) |
| claude | `.claude/agents/<역할>.md` | render | 역할 원본(§4.4) |
| claude | `CLAUDE.md` | merge | `line:@AGENTS.md` · `block:claude`(§5.1) |
| claude | `.claude/settings.json` | merge | `permissions.deny:<값>` · `hooks.<이벤트>:<id>`(§5.2) |
| codex | `.codex/agents/<역할>.toml` | render | 역할 원본(§4.5) |
| codex | `.codex/config.toml` | merge | `toml:agents.<역할>` · `toml:features.multi_agent` · `toml:agents.max_threads` · `toml:shell_environment_policy`(§5.3) |
| cursor | `.cursor/commands/<스킬>.md` | render | `SKILL.md` 본문 전체(§4.3) |
| cursor | `.cursor/rules/<규칙>.mdc` | render | 규칙 본문 + `globs`(§4.1) |
| kiro | `.kiro/skills/<스킬>/` | mirror(폴더) | 스킬 폴더 통째 |
| kiro | `.kiro/steering/<규칙>.md` | render | 규칙 본문 + `fileMatch`(§4.2) |
| kiro | `.kiro/steering/<스킬>.md` | render | `inclusion: manual` + `SKILL.md` 본문(§4.3) |
| kiro | `.kiro/agents/<역할>.json` | render | 역할 원본(§4.6) |
| (공통) | `.gitattributes` | merge | `block:generated` — 깐 하네스의 생성 경로(§5.4) |

- Codex는 `.agents/skills/`와 `AGENTS.md`를 그대로 읽는다(작업 없음).
- 그대로 두는 copy 템플릿: `.codex/hooks.json` · `.codex/README.md` · `.kiro/hooks/*.json` · `.kiro/README.md` · `.kiro/agents/<slug>.json`(조율 에이전트, 훅 3개가 들어 있다). 훅 생성은 HK-24다.
- 템플릿에서 지우는 손 유지 파일: `common/claude/**` · `common/cursor/**` · `common/kiro-skills/**` · `**/kiro-steering/**` · `common/codex/agents/**` · `common/codex/config.toml` · `common/kiro-agents/<역할>.json` 5 · `stacks/*/root/CLAUDE.md` 5 · `optional/jira-workflow/{claude,cursor,kiro-skills}/**`. 설정 조각(Claude 블록 · `settings.json` 조각 · Codex 기본 설정 · `.gitattributes` 줄)은 `common/scripts/harness/projection.json`(§3.4) 하나에 둔다.
- 같은 배치 경로를 두 작업이 내면(예: 규칙 `hx-x.md`와 스킬 `hx-x`가 모두 `.kiro/steering/hx-x.md`) 계획 단계에서 exit 3. copy 경로와 배치 경로가 겹쳐도 exit 3.

어댑터(`packages/cli/src/adapters/<id>.ts`)는 `HarnessAdapter`(§8.1)를 구현하고 작업 목록만 낸다. 파일 쓰기 · lock은 엔진이 한다. 어댑터 사이에 의존이 없다. 하네스 하나를 빼면 그 어댑터 작업만 사라지고 엔진이 지운다(§6.5).

## 3. 원본 형식

### 3.1 규칙 머리 `paths`(R2)

```markdown
---
paths:
  - "**/*.kt"
  - "**/*.java"
---
<!-- HARNESS STARTER KIT … -->
# …
```

- 값은 glob 목록 하나만 쓴다(블록 목록 또는 `[…]` 흐름 목록). 없으면 늘 싣는 규칙이다.
- 킷 규칙 95개 모두에 `paths`를 단다. 스택 소스 · 설정 · 문서 경로로 나눈다(표는 tasks.md T3). 늘 싣는 킷 규칙은 0개다. 늘 지킬 가드레일은 지금처럼 `AGENTS.md` "핵심 가드레일" 절이 진입 파일로 매 세션 실린다(§11). `guardrails.md` 전문(5.8~7.0KB)을 `paths` 없이 두면 Claude 상시 양이 v1.0.8보다 늘기 때문이다.
- 공통 규칙(`common/agents-rules/`)은 스택을 모르므로 소스 glob은 다섯 스택 확장자를 모두 적는다(`**/*.kt` `**/*.kts` `**/*.java` `**/*.py` `**/*.go` `**/*.ts` `**/*.tsx` `**/*.js` `**/*.jsx` `**/*.mjs` `**/*.cjs`). 그 리포에 없는 확장자는 맞는 파일이 없을 뿐이다.

### 3.2 역할 머리(R3)

```yaml
---
name: reviewer
description: 변경을 마친 뒤 커밋 전에 …
mode: read-only          # read-only | write
tools: [read, search, shell]   # read | search | shell | write | web
class: review            # 12 §3.2 분류. 등급은 정책에서 찾는다
# tier: standard         # 분류 대신 등급(선택)
# model: { claude: sonnet }   effort: { claude: medium, codex: medium }   # 하네스별 직접 지정(선택)
---
```

- 본문은 지금 역할 원본 그대로다. `../rules/x.md` 링크 15개는 리포 기준 경로 코드(`` `.agents/rules/x.md` ``)로 바꾼다(§10 `relative-ref`).
- 킷 역할 5개: explorer `explore` · docs-researcher `docs-research` · planner `plan-draft` · worker `implement` · reviewer `review`. description · tools는 v1 생성 파일 값을 옮긴다.

### 3.3 정책 `.agents/model-policy.json`

12 §3.3의 `schema` · `locked` · `classes` · `tiers`(+ `escalation` · `limits`)를 copy 템플릿(`common/agents-root/model-policy.json`)으로 깐다. 해석(12 §3.4 · §3.5):

1. 잠금: `class`가 `locked`(최소 `implement` · `design` · `review`)에 있거나 이름이 `worker` · `reviewer` · `designer`. 잠긴 역할에 `tier` · `model` · `effort`가 있으면 그 역할의 생성 파일 셋을 모두 만들지 않고 `role-model-locked` 오류(exit 4).
2. 잠긴 역할: Claude `model: inherit`만. Codex · Kiro는 모델 줄 0개.
3. 그 밖: 직접 지정(`model`·`effort`의 그 하네스 값) > `tier` > `classes[class]` > `inherit`. 등급 값의 하네스 필드 중 `null`은 쓰지 않는다. Kiro에는 effort를 쓰지 않는다. `inherit`면 잠긴 역할과 같다.
4. 정책 파일이 없거나 해석할 수 없으면 모든 역할을 `inherit`로 본다.

사람이 연 세션의 모델 키(12 §3.1 금지 키)는 어떤 병합도 쓰지 않는다. `projection.json`의 설정 조각에 금지 키가 있으면 조각을 읽을 때 거부한다(exit 5, 시험으로 묶는다).

### 3.4 `common/scripts/harness/projection.json`

TS 어댑터와 Python 모듈이 같이 읽는 상수 파일이다(copy로 `scripts/harness/projection.json`에 깔린다. TS는 템플릿 판, Python은 자기 옆 판을 읽는다).

| 키 | 내용 |
|---|---|
| `schema` | `harness-kit.projection/v1` |
| `claudeBlock` | §5.1 킷 블록 줄 목록(시작 · 끝 표지 포함) |
| `claudeSettings` | `deny`(문자열 목록, `{{PROTECTED_PATH}}` 토큰) · `hooks`(`{id, event, matcher?, hook}` 목록 — v1 템플릿의 네 훅 그대로) · `kitScripts`(v1 킷 항목 판정 꼬리 4개) |
| `codexConfig` | `header`(주석 줄) · `defaults`(`{key, line}` — `features.multi_agent` · `agents.max_threads`) · `tables`(`{table, lines}` — `shell_environment_policy`) |
| `gitattributes` | 하네스별 패턴 목록 |
| `kiroWriteHooks` | write 역할 Kiro JSON에 넣는 `hooks`(v1 worker의 보호 훅 그대로) |
| `readOnlyLine` | read-only 역할 Codex 지시문 첫 줄 |

## 4. 생성 형식

`<GEN>` = `<!-- harness-kit 생성 · 원본 <from> · 고칠 때는 원본을 고친다 -->`(TOML은 `# harness-kit 생성 · 원본 <from> · 고칠 때는 원본을 고친다`). 원본 본문 = 머리(`---` … `---`)를 뺀 나머지 바이트. 생성 파일은 정렬 · 시각 없이 같은 원본에서 같은 바이트다(12 §3.8 캐시 순서).

### 4.1 Cursor 규칙 `.cursor/rules/<규칙>.mdc`

```text
---
description:
globs: **/*.kt,**/*.java          # paths 를 쉼표로. paths 가 없으면 빈 값
alwaysApply: false                # paths 가 없으면 true
---
<GEN>
<원본 본문>
```

`description`은 비운다. 값이 있으면 Cursor가 세션마다 설명을 싣는다.

### 4.2 Kiro 규칙 steering `.kiro/steering/<규칙>.md`

```text
---
inclusion: fileMatch                      # paths 가 없으면 always 이고 다음 줄이 없다
fileMatchPattern: "**/*.kt"               # 하나면 문자열, 둘 이상이면 ["…", "…"]
---
<GEN>
<원본 본문>
```

규칙 안 링크는 같은 폴더의 다른 규칙(`./x.md`)뿐이라 `.kiro/steering/` · `.claude/rules/`에서도 그대로 맞는다(모든 규칙을 같이 배치한다). 고치지 않는다.

### 4.3 스킬 → Cursor 명령 · Kiro 명령 steering

```text
.cursor/commands/<스킬>.md          .kiro/steering/<스킬>.md
---                                 ---
description: <description>          inclusion: manual
---                                 description: <description>
<GEN>                               ---
<SKILL.md 본문>                     <GEN>
                                    <SKILL.md 본문>
```

### 4.4 Claude 역할 `.claude/agents/<역할>.md`

```text
---
name: <name>
description: <description>
tools: Read, Glob, Grep, Bash, Edit, Write, WebFetch, WebSearch   # read · search · shell · write · web 순서, 있는 것만
model: haiku          # §3.3 결과가 있을 때만(잠긴 역할은 inherit)
effort: low
---
<GEN>
<역할 본문 전체>
```

### 4.5 Codex 역할 `.codex/agents/<역할>.toml`

```text
# harness-kit 생성 · 원본 .agents/roles/<역할>.md · 고칠 때는 원본을 고친다
name = "<name>"
description = "<description>"
sandbox_mode = "read-only"            # write 면 "workspace-write"
model = "…"                           # 값이 있을 때만
model_reasoning_effort = "low"        # 값이 있을 때만

developer_instructions = """
<read-only 면 readOnlyLine 한 줄>
<역할 본문 전체>"""
```

문자열은 TOML 기본 문자열로 이스케이프한다(`\` · `"` · 제어 문자). 여러 줄 문자열은 `\` → `\\`, `"""` → `""\"`, 탭 · 줄바꿈 밖 제어 문자 → `\uXXXX`.

### 4.6 Kiro 역할 `.kiro/agents/<역할>.json`

`{name, description, prompt, tools, allowedTools, resources, hooks?, model?}`를 들여쓰기 2칸으로 쓴다(v1 파일과 같은 모양).

- `prompt` = 역할 본문 전체(도구가 여는 `file://` 자원이 아니라 내용 그대로).
- `tools`: read → `read`, shell → `shell`, write → `write`, web → `web`(v1 값). search는 read에 든다.
- `allowedTools`: read-only → `["read"]`, write → `["read", "write"]`(03 §3.6).
- `resources`: `file://AGENTS.md` · `file://.agents/rules/guardrails.md` · `skill://.agents/skills/**/SKILL.md`. 역할 원본은 `prompt`에 들어가므로 자원에서 뺀다(두 번 싣지 않는다).
- write 역할은 `kiroWriteHooks`(v1 worker 보호 훅)를 `hooks`로 넣는다.

## 5. 병합 규칙(merge)

공통: 파일을 해석할 수 없으면 쓰지 않고 conflict(exit 4). 결과 키를 lock `keys`에 적는다. 파일을 킷이 처음 만들었으면 `createdByKit: true`. 킷 키를 뺀 결과가 비고(§5 각 형식의 "빈 것") `createdByKit`이면 파일을 지운다.

### 5.1 `CLAUDE.md` 블록

새 파일: `@AGENTS.md\n\n<블록>\n`. 블록은 `<!-- harness-kit:begin claude …-->` 줄부터 `<!-- harness-kit:end claude -->` 줄까지다(1.5KB 이하, 시험).

| 지금 파일 | 결과 |
|---|---|
| 없음 | 새 파일, keys `line:@AGENTS.md` · `block:claude`, `createdByKit` |
| 블록 있음 | 블록 안만 바꾼다 |
| 블록 없음 | 끝에 (`@AGENTS.md` 줄이 없으면 그 줄 +) 빈 줄 + 블록. 넣은 줄만 key |
| 시작 표지만 있고 끝 표지 없음 | conflict |
| lock에 v1 copy 항목이 있고 sha(C) = B(v1 킷 판 그대로) | 새 파일로 통째 바꾼다(03 §3.8) |
| lock에 v1 copy 항목, sha(C) ≠ B, 블록 없음 | `CLAUDE.md.new` = 새 파일, conflict, lock은 v1 항목 그대로 |

빼기: 블록을 지우고, `line:@AGENTS.md`가 key면 그 줄도 지운다. 빈 것 = 공백뿐.

### 5.2 `.claude/settings.json`

조각: `permissions.deny`(토큰 치환 뒤) · 훅 4개(SessionStart session-start · PreToolUse(`Write|Edit|MultiEdit|NotebookEdit`) protect-sources · PreToolUse(`Bash`) block-full-verify · Stop verify-gate). v1의 `permissions.defaultMode` · `enabledPlugins`는 킷이 관리하지 않는다(03 §3.2). 이미 있으면 사람 값으로 둔다.

- 훅(03 §3.5 알고리즘): 이벤트마다 그룹의 `hooks[]`에서 킷 항목(명령에 ` harness-<id> ` 토큰이 있거나 `kitScripts` 꼬리로 끝남)을 뺀다. 킷 항목만 있던 그룹은 첫 자리를 기억하고 지운다. 원하는 그룹을 그 자리(없으면 끝)에 넣는다. 다른 도구 항목 · 순서는 그대로다. 키 `hooks.<이벤트>:<id>`.
- 권한: 값이 없으면 `permissions.deny` 끝에 넣는다. lock key에 있는데 이번에 원하지 않으면 뺀다. 키 `permissions.deny:<값>`.
- 새 객체 키는 끝에 붙는다(`permissions` → `hooks` 순서). 쓰기는 `JSON.stringify(v, null, 2)` + 줄바꿈(Python `json.dumps(indent=2, ensure_ascii=False)`와 같은 바이트).
- 빼기: 킷 항목 · deny 값을 빼고, 그래서 빈 배열 · 객체가 된 `hooks.<이벤트>` · `hooks` · `permissions.deny` · `permissions`를 지운다. 빈 것 = `{}`.

### 5.3 `.codex/config.toml`

줄 단위로 해석한다: 머리(첫 표 머리 앞) + 표(`[이름]` 머리 줄부터 다음 머리 앞까지, 끝의 빈 줄 · 주석 줄은 다음 표 몫).

- 소유 표 `[agents.<역할>]`: `description = "<…>"` · `config_file = "agents/<역할>.toml"`. 있으면 그 표를 통째로 바꾸고, 없으면 끝에 빈 줄 + 표. lock key에 있는데 원하지 않으면 표를 지운다.
- 기본값(없을 때만 넣는다): `features.multi_agent` · `agents.max_threads` — 표가 있으면 표 끝에 줄을, 없으면 표를 만든다. `shell_environment_policy` — 표가 없을 때만 표 전체. 넣은 것만 key.
- 새 파일 = `header` + 기본 표 + 소유 표(v1 템플릿과 같은 순서 · 모양).
- 빼기: 소유 표와 key에 든 기본값을 지운다. 비게 된 기본 표도 지운다. 빈 것 = 주석 · 빈 줄뿐.

### 5.4 `.gitattributes`

`# harness-kit:begin generated …` 줄부터 `# harness-kit:end generated`까지 블록 하나. 깐 하네스마다 `projection.json`의 패턴(`.claude/skills/**` `.claude/rules/**` `.claude/agents/**` · `.codex/agents/**` · `.cursor/commands/**` `.cursor/rules/**` · `.kiro/skills/**` `.kiro/steering/**` `.kiro/agents/**`)에 ` linguist-generated=true`. 블록 밖은 사람 몫. 하네스 목록이 바뀌면 블록만 다시 쓴다. 빈 것 = 공백뿐.

## 6. 판정

D = 원하는 내용(render: 파일, mirror: 파일 묶음 · tree-sha256), C = 지금, B = lock `sha256`.

### 6.1 원본 보기(view)

배치는 copy를 적용한 뒤의 리포를 원본으로 읽는다. CLI는 쓰기 전에 계산하므로 "지금 파일 + 이번 copy 쓰기(create · replace · new · restore · update) − 지우기"를 겹친 보기(OverlayView)를 만든다. Python은 copy가 끝난 실제 폴더를 읽는다. 둘은 같은 파일을 본다(copy 동일성은 HK-8 · HK-11 시험이 묶는다). 원본 목록에서 `.DS_Store` · `*.new` · `*.bak` · `.<이름>.hk-*`는 뺀다. mirror 대상 폴더를 읽을 때도 같은 이름을 뺀다(그래서 `.new` · `.bak`이 폴더 안에 있어도 tree가 같다).

### 6.2 init · add · setup.sh(설치 판정)

| 대상 | 판정 |
|---|---|
| mirror · render, C 없음 | create |
| 바이트(tree) 같음 | same |
| 다름, lock에 킷 항목 있음(덧설치 · add) | keep(파일 · B 그대로) |
| 다름, 항목 없음 | `--force`면 replace, 아니면 skip-user(owner user) |
| 링크 · 폴더 · 상위가 파일 | skip-user(이유) |
| merge | §5대로 병합. 해석 실패는 conflict(exit 4) |

`add`는 새 선택값의 작업 전부에 이 표를 쓴다. 새 하네스 몫은 create가 되고 이미 있는 몫은 same · keep이다(add-agent.sh = setup.sh 재실행과 같다).

### 6.3 update

| 조건(위에서부터) | 판정 | 쓰기 | lock |
|---|---|---|---|
| owner user · external · pack | skip-* | — | 그대로 |
| C가 링크 | replace(이유 `symlink-found`) | 링크를 지우고 D | kit |
| C가 그 밖의 다른 것 | skip-user | — | 그대로 / owner user |
| 항목 없음 · C 없음 | new | D | kit |
| 항목 없음 · 같음 | same | — | kit |
| 항목 없음 · 다름 | skip-user | — | owner user |
| C 없음 | restore | D | kit |
| 같음 | same | — | kit(from · fromSha256 갱신) |
| B ≠ null, sha(C) = B | update | D | kit |
| `--accept-all` | replace | 다른 파일 → `.bak`, D | kit |
| 그 밖 | conflict | render: `<경로>.new` · mirror: 다른 파일마다 `<파일>.new` | B 그대로 |

- v1 포인터(lock copy 항목)가 배치 경로와 같거나(render · 파일 mirror) 그 폴더 안이면(폴더 mirror) 그 항목을 B로 쓴다. 폴더 mirror는 지금 파일이 모두 항목에 있고 sha가 맞을 때만 "고치지 않음"이다. 그 copy 항목은 lock에서 빠지고 배치 항목이 대신한다(R8).
- 배치하지 않는 하네스 폴더(`.claude/` `.codex/` `.cursor/` `.kiro/`)의 킷 copy 항목이 킷에서 빠지면(`.claude/commands/hx-*.md`) retire: C 없음 → 항목만 뺀다, sha(C) = B → 지운다, 고쳤으면 keep-modified(owner user, exit 4). `--prune` 없이 한다(생성 체계로 옮기는 일이라서다).
- lock 배치 항목인데 이번에 원하지 않으면(원본이 사라짐 · 하네스를 뺌) 같은 규칙으로 지운다. merge는 킷 키를 빼고 빈 것 · `createdByKit`이면 파일을 지운다.
- merge는 3방향 비교 없이 §5. v1 copy 항목의 `settings.json` · `config.toml`은 지금 파일에 그대로 병합한다(`createdByKit` = sha(C) = B).
- 종료 코드: conflict · keep-modified가 하나라도 있으면 4(copy와 합친다).

### 6.4 repair(02 §3.12)

| lock 배치 항목(owner kit) | 하는 일 | `--only` |
|---|---|---|
| C 없음 | 원본에서 다시 만든다 | missing |
| C가 링크 | 링크를 지우고 실제 복사본(symlink-found) | drifted |
| sha(C) = B, D와 다름(stale) | 다시 만든다 | stale |
| sha(C) ≠ B(drifted) | 다른 파일을 `.bak`으로 옮기고 다시 만든다 | drifted |
| merge 키 빠짐 | 다시 병합 | merge |
| 원하는데 lock에 없고 C 없음(새 원본) | 만든다 | missing |
| 원본이 없다(원하지 않음) | unrestorable(`update`를 안내) | — |

render · mirror · merge는 킷 판 번호와 무관하게 지금 원본에서 만든다. 쓰기가 하나라도 있으면 lock을 다시 쓴다.

### 6.5 remove · uninstall

- remove: 이전 선택값의 배치 − 새 선택값의 배치 = 빠지는 작업. mirror · render는 sha(C) = B면 지움(폴더 mirror는 파일과 빈 폴더), 고쳤으면 keep-modified(owner user, exit 4). merge는 새 선택값의 키로 다시 병합(빠지는 키를 뺀다). merge 파일을 원하는 하네스가 없으면 킷 키를 모두 빼고, 빈 것 · `createdByKit`이면 지운다.
- uninstall: 배치 항목 mirror · render는 copy와 같은 규칙(지움 · keep-modified). merge는 킷 키를 빼서 쓰고, 빈 것 · `createdByKit`이면 지운다. 키가 없는 v1 항목(§7.2)은 지금 원하는 키로 뺀다.

### 6.6 doctor 상태(02 §3.11)

| 종류 | 판정 | 등급 |
|---|---|---|
| `missing` | mirror · render 대상 없음 | 오류 |
| `drifted` | sha(C) ≠ B | 오류(생성 파일을 직접 고쳤다. 원본을 고친다) |
| `stale` | sha(원본) ≠ `fromSha256` 또는 원본 없음 | 오류 |
| `symlink-found` | 배치 경로 · mirror 폴더 안에 링크 | 오류 |
| `merge-missing` | `keys`가 파일에 없음 · 파일을 해석할 수 없음 | 오류 |
| `relative-ref` | 킷 규칙 · 스킬 · 역할 원본의 Markdown 링크가 `../`로 시작 | 오류 |
| `skill-model-field` | `context: fork`가 아닌 스킬 머리에 `model` · `effort`(킷 `hx-*`은 오류, 그 밖은 경고) | 오류 · 경고 |
| `role-model-locked` | 잠긴 역할에 `tier` · `model` · `effort` | 오류 |
| `pending-new` | lock 경로 옆 `.new` · `.bak` | 경고 |
| `steering-size` | `inclusion: always` steering 합계 > 24,576 | 경고 |

v1 lock의 배치 항목(§7.2)은 `from` · `keys`가 없어 `stale` · `merge-missing`을 보지 않는다.

## 7. lock

### 7.1 v2 항목

| op | 필드 |
|---|---|
| mirror | `path`(폴더면 끝 `/` 없이) · `op` · `owner` · `sha256`(폴더면 tree-sha256) · `from` · `fromSha256` |
| render | `path` · `op` · `owner` · `sha256` · `from` · `fromSha256` |
| merge | `path` · `op` · `owner` · `keys` · `createdByKit`(참일 때만) |

tree-sha256 = 상대 경로 사전순 `"<경로>\0<sha256>\n"` 이어 붙인 문자열의 sha256(02 §3.9). render의 `from`이 여럿이면(Kiro 역할 = 역할 원본 하나) 하나만 적는다. skip-user는 `{path, op, owner: "user", sha256: null}`.

### 7.2 v1(TSV) 줄 — setup.sh · update.sh

`<sha|->\t<op 라벨>\t<하네스>\t<경로>`. 라벨: `mirror` · `render` · `merge` · `merge+`(`createdByKit`). merge의 sha 칸은 `-`. CLI `parseV1`은 라벨이 이 넷이면 `{op, owner: kit, sha256}`(merge는 `keys` 없음 · `createdByKit`)로 읽고 layer를 두지 않는다. update.sh의 orphan 줄은 이 라벨을 건너뛴다. 표시 줄(`# pre-existing: -`) 규칙은 HK-12 그대로다.

## 8. CLI 구조

### 8.1 어댑터

```ts
// packages/cli/src/adapters/types.ts
export interface HarnessAdapter {
  id: HarnessId; label: string; checkedVersion: string;
  plan(ctx: ProjectionContext): Want[];      // mirror · render · merge 원하는 작업
}
export interface ProjectionContext { view: RepoView; sources: Sources; spec: ProjectionSpec; tokens: Record<string, string>; agents: string[]; }
```

`adapters/index.ts`의 목록에 `claude` · `codex` · `cursor` · `kiro`를 한 줄씩 둔다. 03 §3.1의 `hooks?` · `roles?` · `check?`는 HK-24 몫으로 두고 이번에는 `plan`만 쓴다(역할 생성은 어댑터 `plan` 안에서 공용 함수를 부른다).

### 8.2 모듈

| 파일 | 책임 |
|---|---|
| `projection/frontmatter.ts` | 머리 나누기 · YAML 부분 해석(스칼라 · 따옴표 · 흐름 목록 · 흐름 표 · 블록 목록) |
| `projection/view.ts` | `FsView` · `OverlayView`(§6.1) |
| `projection/sources.ts` | 규칙 · 스킬 · 역할 · 정책 읽기, tree-sha256 |
| `projection/render.ts` | §4 · §3.3 |
| `projection/merge.ts` | §5 넷(병합 · 빼기 · 키 확인) |
| `projection/spec.ts` | `projection.json` 읽기 · 금지 키 검사 |
| `projection/engine.ts` | 원하는 작업 모으기(어댑터 + `.gitattributes`) · 겹침 검사 · 판정(§6) · 적용 · lock 항목 |
| `projection/check.ts` | doctor 발견(§6.6) |
| `adapters/{types,index,claude,codex,cursor,kiro}.ts` | §8.1 |
| `core/plan.ts` · `core/apply.ts` · `commands/init.ts` | init 계획 · 적용에 배치를 더한다 |
| `core/update-plan.ts` · `commands/update.ts` | update 판정에 배치를 더한다(§6.3) |
| `commands/{add,remove,change,repair,uninstall,doctor}.ts` | §6.2 · §6.4~§6.6 |
| `core/installed.ts` · `core/lock.ts` | op 갈래에 mirror · render · merge를 받는다 · v1 라벨(§7.2) |

`--json` 출력: 배치 작업은 `projection: {counts, ops}`로 copy의 `counts` · `ops`와 따로 낸다(copy 개수 시험을 바꾸지 않는다). conflict는 `conflicts`에 함께 넣는다.

## 9. Python 모듈 · v1 스크립트(setup.sh ↔ CLI 동일성)

- `scripts/harness/projection.py`(CLI · 판정 · 적용) · `projection_render.py`(§4 · §3.3) · `projection_merge.py`(§5). 표준 라이브러리만, Python 3.11. 첫 줄에서 `sys.dont_write_bytecode = True`(킷 템플릿 폴더에 `__pycache__`를 남기지 않는다).
- 명령:
  - `projection.py apply --root R --mode setup|update --lock L [--prev-lock P] [--agents a,b] [--token K=V] [--force] [--accept-all] [--dry-run]` — v1 스크립트용. 판정(§6.2 · §6.3)대로 쓰고 L에 v1 줄(§7.2)을 덧붙인다. 출력은 판정 줄(사람용, same 제외)과 개수 한 줄. conflict · keep-modified가 있으면 exit 4가 아니라 0(update.sh는 늘 0, 개수로 알린다).
  - `projection.py plan --root R [--agents …] [--json]` — 원하는 작업과 내용 해시(쓰지 않음). TS ↔ Python 동일성 시험이 쓴다.
  - `projection.py sync [--root R] [--changed P]…` — v2 lock 기준으로 다시 만든다(Node 없는 repair, HK-24 동기화 훅이 부른다). 고치지 않은 대상만 다시 쓰고 lock 해시를 고친다. 성공 출력 0바이트.
- setup.sh: 파일 복사 · 메타를 쓴 뒤 `python3 -B "$TEMPLATES/common/scripts/harness/projection.py" apply --mode setup …`(킷 판을 부른다. 대상 리포의 코드는 실행하지 않는다 — HK-8 D17). python3가 없으면 경고하고 배치를 건너뛴다. `--dry-run`이면 "배치는 원본을 쓴 뒤 만든다" 한 줄.
- update.sh: copy 판정 뒤, 새 lock을 옮기기 전에 `apply --mode update --prev-lock "$LOCK" --lock "$NEW_LOCK"`.
- add-agent.sh: setup.sh를 다시 부르므로 따로 할 일이 없다(§6.2 keep).

## 10. `scripts/harness/check_layout.py`(R6)

03 §3.9 그대로. 판정은 §6.6과 같고 `projection.py`의 함수를 쓴다(tree-sha256 · 머리 · 병합 키). 출력 한 줄 = 한 항목(`✖ <종류> <경로> — … → npx harness-kit repair`), 끝에 `배치 검사: 항목 N개, 오류 E, 경고 W`. 오류가 있으면 exit 1. v1 lock이면 `lock v1 — 배치 검사는 v2부터` 한 줄, exit 0. `--context`는 §11 상시 양을 하네스별로 낸다.

연결: 스택 5개 `verify.sh` fast의 `check_harness.py` 다음 줄 · `.agents/verify-checks.json` `harness-layout`(경로 `.agents/*` `.claude/*` `.codex/*` `.cursor/*` `.kiro/*` `AGENTS.md` `CLAUDE.md`).

`check_harness.py pointer_errors`는 포인터 안 문자열 대신 배치가 있는지를 본다(Kiro steering · `.claude/skills` · `.kiro/skills`가 원본마다 있다, 생성 머리에 원본 경로). lock이 없어도 돈다.

## 11. 세션 적재량(R9)

하네스 h마다 매 세션 실리는 바이트 = 진입 파일(`AGENTS.md` + `CLAUDE.md`, 03 §3.8 · 12 §3.8 정의) + 늘 싣는 규칙(Claude: `.claude/rules/*.md` 중 머리에 `paths`가 없는 파일 전체 · Cursor: `.mdc` 중 `alwaysApply: true` 파일 전체와 나머지의 `description` · Kiro: `.kiro/steering/*.md` 중 `inclusion: always` 파일 전체 · Codex: 0) + 설명(Claude: `.claude/skills/*/SKILL.md` · `.claude/commands/**/*.md` · `.claude/agents/*.md` · Codex: `.agents/skills/*/SKILL.md` · `.codex/agents/*.toml` · Cursor: `.cursor/commands/*.md` · Kiro: `.kiro/skills/*/SKILL.md` · `.kiro/agents/*.json`의 `description` 값).

v1.0.8(e181b6f) 설치본 실측(토큰 `Acme Notes` · `acme-notes` · `com.acme.notes` · `notes-api`, `--agents=all`):

| 스택 | claude | codex | cursor | kiro |
|---|---|---|---|---|
| jvm | 10,311 | 9,894 | 9,075 | 26,579 |
| python | 10,567 | 10,150 | 9,331 | 26,830 |
| go | 10,991 | 10,574 | 9,755 | 27,258 |
| web | 12,025 | 11,608 | 10,789 | 33,191 |
| electron | 12,431 | 12,014 | 11,195 | 33,924 |

- 측정 함수는 `check_layout.py --context`(같은 코드로 v1.0.8 설치본과 새 설치본을 잰다). 시험은 e181b6f 플러그인을 `git archive`로 풀어 설치한 값과 새 setup.sh · CLI 설치 값을 스택 · 하네스마다 비교한다(새 값 ≤ 옛 값). 커밋을 못 찾으면 위 표를 기준으로 쓴다.
- Claude는 v1.0.8에서 `CLAUDE.md`가 `AGENTS.md`를 먼저 읽으라고 지시했다(모델이 도구로 읽는다). v2는 `@AGENTS.md`로 가져와 같은 내용을 도구 호출 없이 싣는다. 이 정의는 두 판 모두 `AGENTS.md`를 진입 파일로 센다.
- `AGENTS.md`는 "에이전트 로딩 규칙" 절을 v2 사실로 고치며 줄인다(늘지 않는다, HK-12 시험 그대로).

## 12. 문서 · 템플릿 변경

- `stacks/*/root/AGENTS.md` 5: 로딩 표 · 규칙 변경 절차를 복사본 · `paths` 자동 로드로 고친다(바이트 줄임).
- 설치 문서의 포인터 문장: `agent-harness.md` · `guardrails.md`(5) · `code-comments.md`(5) · `harness-engineering.md` · `doc-standards.md` · `agents-docs/README.md` · `hx-harness/SKILL.md` · `kiro-root/README.md` · `optional/*/ABOUT` · 플러그인 `manifest.md` · `SKILL.md`(hx-bootstrap · hx-agent-add) · `README.md` · setup.sh 머리 · add-agent.sh 안내.
- `scripts/sync-commands.sh`를 지운다(생성기가 대신한다). `test_install.test_command_pointers_match_skill_sources`는 배치 시험으로 바꾼다.
- manifest 「에이전트 선택」 표는 템플릿 파일 수(시험이 센다) 옆에 배치 파일 수를 적는다.

## 13. 시험 계획

### 13.1 vitest(`packages/cli/test/`)

| 파일 | 본다 |
|---|---|
| `adapters/{claude,codex,cursor,kiro}.test.ts` | fixture 리포 `plan` 작업 목록 스냅숏(경로 · op · from), `remove <id>` 뒤 그 하네스 폴더 파일 0개(03 §3.3) |
| `projection-render.test.ts` | §4 형식 · `paths` 1개 · 여럿 · 없음 · TOML 이스케이프(`"""` · `\`) · 모델 해석(light · locked · 직접 지정 · null · Kiro effort 없음) · 잠긴 역할 오류 |
| `projection-merge.test.ts` | §5 넷: 새 파일 · 다른 도구 훅 3개 순서 보존(03 §5 #6) · v1 킷 항목 교체 · deny 넣기/빼기 · 해석 실패 conflict · 빼기 → 빈 것 지움 · TOML 소유 표 · 기본값 · 블록 |
| `projection-init.test.ts` | init: 하네스 폴더 파일 = lock mirror · render · merge 항목, 링크 0, 포인터 0(03 §5 #1) · 규칙 `paths` → mdc `globs` · Kiro fileMatch(#10) · `skill-model-field`(#9) · 미리 있는 대상 skip-user · `--dry-run` 쓰기 0 |
| `projection-update.test.ts` | §6.3 표 줄마다 · v1 포인터 → 복사본(R8) · 고친 포인터 `.new` · retire · 원본 삭제 → 생성물 삭제 · 링크 → 실제 파일 |
| `projection-repair.test.ts` | stale · drifted(`.bak`) · missing · symlink · merge-missing · `--only` · 새 원본 |
| `projection-uninstall.test.ts` | 생성물 지움 · 고친 생성물 남김 · merge 빼기 · `createdByKit` |
| `projection-doctor.test.ts` | §6.6 종류마다 1건 |
| `projection-parity.test.ts` | 같은 fixture에서 TS 작업 목록 = `python3 projection.py plan --json`(경로 · op · sha256 · fromSha256 · keys), merge 결과 바이트 같음 |
| `layout-check-parity.test.ts` | 망가뜨린 fixture에서 doctor 발견 = `check_layout.py --json` 발견(종류 · 경로) |
| `projection-budget.test.ts` | Claude 블록 ≤ 1,536바이트 · `projection.json` 금지 키 거부 |

### 13.2 Python

| 파일 | 본다 |
|---|---|
| `tests/test_cli_parity.py` | 26조합 트리가 바이트까지 같다(배치 포함). lock 의미 비교를 op별로 고친다(merge는 해시 없음, owner로 사람 파일). #12의 미리 있는 `settings.json`은 병합된다(사람 파일은 `AGENTS.md`만) |
| `tests/test_cli_update_parity.py` · `test_cli_addremove_parity.py` · `test_kit_wrapper.py` | 그대로 통과(기대가 바뀌는 곳만 고친다: 사람 커맨드 파일 경로) |
| `tests/test_projection_upgrade.py` (새) | v1.0.8 설치본 → 새 update.sh · CLI update: 두 트리가 같다, 포인터 0개, 고친 포인터 `.new`, retire, `check_layout.py` 통과(CLI 쪽) |
| `tests/test_context_budget.py` (새) | §11 스택 5 × 하네스 4: 새 값 ≤ v1.0.8 값, 늘 싣는 킷 규칙 0개 |
| `tests/test_check_layout.py` (새) | 03 §5 #2(규칙 한 줄 → fast exit 1 `stale` → repair → 0), `relative-ref`, v1 lock 한 줄, 500항목 1초 |
| `tests/test_install.py` | 포인터 경로 → 배치 경로, `sync-commands.sh` 시험 → 배치 시험 |
| `tests/harness_scripts/*` | pointer 시험 문구 · 경로를 배치 기준으로 |
| `tests/test_template_wording.py` | 진입 파일 크기는 설치본 `CLAUDE.md`(생성물)로 잰다 · manifest 수 |

## 14. 설계와 다른 점

| # | 설계 | 이 구현 | 이유 |
|---|---|---|---|
| D1 | 03 §3.6 역할 생성물 = 원본을 읽으라는 짧은 지시 + `summary` | 역할 본문 전체를 넣는다(Claude md 본문 · Codex `developer_instructions` · Kiro `prompt`). `summary` · `harness.*` 머리는 두지 않는다 | 사용자 결정: 하네스 폴더에 "원본을 읽어라" 파일을 두지 않는다. 본문은 그 역할을 부를 때만 실려 상시 양이 늘지 않는다 |
| D2 | 03 §3.2 "늘 싣는 규칙은 꼭 지킬 가드레일만" | 킷 규칙 95개 모두 `paths`, 늘 싣는 킷 규칙 0개 | §3.1 · §11. 가드레일 요약은 `AGENTS.md`가 싣는다 |
| D3 | 03 §3.1 `hooks?` · `roles?` · `check?` | `plan`만 | 훅은 HK-24, 역할은 공용 함수, 검사는 엔진 한 곳(§6.6) |
| D4 | 03 §3.12 `.gitattributes` "킷 몫 줄만" | 표지로 감싼 블록 하나(`block:generated`) | 줄마다 key를 두면 사람 줄과 구별할 표지가 없다 |
| D5 | 02 §3.12 drifted mirror → `.agents/state/repair-backup/<시각>/` | 다른 파일 옆 `.bak` | update `--accept-all`과 같은 규칙. 폴더 안 `.bak`은 tree에서 뺀다 |
| D6 | 02 §3.11 render drifted 경고 | 오류 | 03 §3.9 check_layout 표(✖)와 맞춘다. 생성 파일을 고치면 fast가 막는다(R4.3) |
| D7 | 03 §3.12 `sync_projection.py` | `projection.py sync` | 판정 · 쓰기 코드를 한 파일에 둔다. HK-24 훅이 이 명령을 부른다 |
| D8 | 03 §3.6 Kiro `resources`에 역할 원본 | 뺀다 | `prompt`에 본문이 있다(두 번 싣지 않는다) |
| D9 | 03 §3.8 블록에 worktree · 훅 `cwd` 줄 | 넣지 않는다 | HK-15 · HK-24 전에는 사실이 아니다 |
| D10 | 03 §3.2 `.claude/settings.json`의 훅은 hooks.json에서 | v1 템플릿의 훅 4개를 `projection.json` 조각으로 병합(id는 스크립트 이름) | 훅 생성은 HK-24. 병합 엔진은 그대로 쓴다 |

## 15. 확인 필요

- Kiro `fileMatchPattern` 여러 glob 형식(배열). 03 §6 항목 그대로 남는다. 배열을 받지 못하면 규칙마다 첫 glob만 실린다.
- Cursor `.mdc` `globs` 쉼표 목록과 빈 `description`의 동작.
- Claude Code에서 `.claude/rules/*.md`의 `paths`가 Read한 파일에도 적용되는지(03 §5 #10 수동 점검).
- 사람 세션이 `.agents/` 원본을 고친 뒤 동기화 훅(HK-24) 전까지는 `repair`로 맞춘다. fast 검증이 `stale`로 알린다.
