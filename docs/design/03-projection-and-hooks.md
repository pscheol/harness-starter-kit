# 03. 배치 — 하네스 어댑터, 훅, 역할, 배치 검사

- 단계: P18(v2.0.0). 계획: [harness-next 03장 P18](../harness-next/03-plan.html#p18).
- 근거: [02장 하네스별 배치](../harness-next/02-direction.html#engine) · [02장 경로가 달라서 생기는 문제](../harness-next/02-direction.html#worktree) · [05장 확장 지점](../harness-next/05-principles.html#extend).
- 엔진(작업 목록·lock·update)은 [02](02-cli-engine.md), 층 해석은 [04](04-extension-layers.md), worktree 명령은 [05](05-worktree.md).

## 1. 목적·범위

손으로 유지하는 하네스 파일 78개(포인터·요약 62 + 역할 16)를 0개로 만든다. 하네스 폴더의 파일은 모두 `.agents/` 원본에서 복사하거나(`mirror`) 생성하거나(`render`) 병합한(`merge`) 실제 파일이고 lock에 기록된다. 심볼릭 링크와 "원본을 읽어라"만 적은 포인터 파일은 두지 않는다. 모델이 다른 파일을 따라가지 않아도 내용이 그 자리에 있어야 하기 때문이다(v1에서 포인터를 건너뛰는 일이 있었다). 킷 훅은 worktree 안에서도 그 worktree를 대상으로 돈다.

| v1.0.8 손 유지 파일 | 개수 | v2 |
|---|---|---|
| `.claude/commands/kns-*.md` | 11 | 삭제(스킬 복사본으로 대신) |
| `.cursor/commands/kns-*.md` | 11 | 생성(`render`) |
| `.kiro/skills/kns-*/SKILL.md` | 11 | 복사(`mirror`) |
| `.kiro/steering/*.md`(규칙 17 + 명령 11) | 28 | 생성 |
| `.claude/rules/code-maintenance.md` | 1 | 복사(`mirror`). 규칙 17개 모두 `.claude/rules/`에 두고 `paths`로 자동 로드(3.2) |
| `.claude/agents/*.md` · `.codex/agents/*.toml` · `.kiro/agents/*.json` | 5 + 5 + 6 | 생성 |

## 2. 요구사항

- R1.1 4개 하네스(Claude Code · Codex · Cursor · Kiro)를 깐 뒤, 하네스 폴더(`.claude/` `.codex/` `.cursor/` `.kiro/`)의 킷 몫 파일은 모두 lock의 `mirror`·`render`·`merge` 항목이다. 그중 심볼릭 링크는 0개이고, 본문 없이 다른 파일을 읽으라고만 하는 파일도 0개다.
- R1.2 새 하네스는 어댑터 파일 하나와 등록 한 줄로 붙는다(3.3).
- R2.1 훅은 `.agents/hooks.json`에 한 번 적고, 하네스별 설정은 거기서 만든다.
- R2.2 설정 파일 병합은 `harness-` id로 킷 항목을 찾아 그 항목만 넣고·바꾸고·뺀다. 다른 도구의 항목과 순서는 그대로 둔다.
- R2.3 모듈 훅은 그 모듈을 켤 때만 넣는다.
- R3.1 역할 원본 `.agents/roles/<이름>.md` 하나에서 Claude md · Codex toml · Kiro json을 만든다.
- R4.1 규칙·스킬 원본 한 줄을 고치면 동기화 훅이 복사본을 다시 만든다(3.12). 훅 없이 고쳤으면 fast 검증이 `stale`로 실패하고, `repair` 뒤 통과한다.
- R4.3 에이전트가 생성 파일(`mirror`·`render` 대상)을 직접 고치려 하면 훅이 막고 원본 경로를 알려 준다.
- R4.4 규칙 원본의 `paths`가 있으면, 그 경로의 파일을 다룰 때 하네스가 규칙을 자동으로 싣는다(Claude `.claude/rules` · Cursor `.mdc` `globs` · Kiro `fileMatch`). 모델이 규칙 파일을 열기로 기억하는 데 기대지 않는다.
- R4.2 `AGENTS.md` + `CLAUDE.md`가 24KB를 넘으면 fast 검증이 경고한다.
- R5.1 킷 훅은 입력 JSON의 `cwd`에서 위로 올라가 하네스 루트를 정한다. `${CLAUDE_PROJECT_DIR}`나 스크립트 위치로 정하지 않는다.
- R5.2 worktree에서 연 Claude 세션의 Stop 훅은 그 worktree의 변경을 검증한다.
- R6.1 `update`가 공지를 만들면 다음 세션 시작 때 세 하네스(Claude·Codex·Kiro)에 붙는다. 만료일이 지나면 붙지 않는다.
- R7.1 Windows 기본 git, `core.symlinks=false`, zip 내려받기에서도 설치 결과가 macOS · Linux와 바이트 단위로 같다(링크를 쓰지 않으므로).

## 3. 설계

### 3.1 어댑터 인터페이스

```ts
// packages/cli/src/adapters/types.ts
export type HarnessId = "claude" | "codex" | "cursor" | "kiro" | (string & {});
export type HookEvent = "session-start" | "pre-tool" | "post-tool" | "stop" | "user-prompt"
                      | "worktree-create" | "worktree-remove";
export type ToolClass = "write" | "shell" | "any";

export interface HarnessAdapter {
  id: HarnessId;
  label: string;
  checkedVersion: string;                       // 릴리스 점검표에서 확인한 하네스 버전
  detect(repo: RepoView, env: NodeJS.ProcessEnv): boolean;   // .claude/ 존재, CLAUDECODE 환경변수 등
  plan(ctx: ProjectionContext): PlannedOp[];   // PlannedOp 는 02 §3.7
  hooks?: HookRenderer;
  roles?: RoleRenderer;
  check?(ctx: ProjectionContext): Finding[];   // doctor 추가 검사
}

export interface ProjectionContext {
  repo: RepoView;                               // 읽기 전용
  meta: MetaV2; lock: LockV2;
  sources: {                                    // 층 해석(04) 뒤의 원본. owner 를 가진다
    rules: SourceFile[];                        // .agents/rules/*.md
    skills: SkillDir[];                         // .agents/skills/<이름>/SKILL.md
    roles: RoleFile[];                          // .agents/roles/<이름>.md (frontmatter 해석 결과 포함)
    hooks: HookSpec[];                          // .agents/hooks.json
  };
  personal: PersonalSources | null;             // .agents/local/ (04 §3.6)
}

export interface HookRenderer {
  events: Partial<Record<HookEvent, string>>;   // 추상 이벤트 → 하네스 이벤트 이름
  tools: Partial<Record<ToolClass, string>>;    // 추상 도구 → matcher
  render(hooks: HookSpec[], ctx: ProjectionContext): PlannedOp[];   // merge 또는 render
}
export interface RoleRenderer { render(role: RoleFile, ctx: ProjectionContext): PlannedOp[]; }
```

- 어댑터는 파일을 쓰지 않는다. 작업 목록만 내고, 쓰기·lock은 엔진이 한다.
- 어댑터 사이에 의존이 없다. 하네스 하나를 빼면(`remove kiro`) 그 어댑터의 작업만 사라지고 엔진이 orphan으로 정리한다.

### 3.2 하네스별 작업

| 대상 | Claude Code | Codex | Cursor | Kiro |
|---|---|---|---|---|
| 진입 | `CLAUDE.md` merge(킷 블록, 3.8) | `AGENTS.md`를 그대로 읽는다 | `AGENTS.md`를 그대로 읽는다 | 규칙 steering(아래) |
| 스킬 | `.claude/skills/<이름>/` mirror × 11(폴더 통째) | `.agents/skills/`를 그대로 읽는다(작업 없음) | `.cursor/commands/<이름>.md` render × 11(SKILL.md 본문 전체. 원본 포인터만 두지 않는다). `.agents/skills/`를 읽는 버전이 확인되면 작업 없음으로 바꾼다 | `.kiro/skills/<이름>/` mirror × 11 |
| 옛 명령 포인터 | `.claude/commands/kns-*.md` 삭제(v1 판과 같으면 update가 지운다) | — | — | — |
| 규칙 | `.claude/rules/<규칙>.md` mirror × 17. `paths`가 있으면 그 경로 파일을 다룰 때, 없으면 세션 시작에 Claude Code가 싣는다 | 경로별 자동 로드 기능이 없다. `AGENTS.md` 목차 + 꼭 지킬 것은 훅으로 강제 | `.cursor/rules/<규칙>.mdc` render × 17(`globs` = `paths`, 없으면 `alwaysApply: true`) | `.kiro/steering/<규칙>.md` render × 17(3.7) |
| 명령 steering | — | — | — | `.kiro/steering/kns-*.md` render × 11(`inclusion: manual`, Kiro IDE용) |
| 역할 | `.claude/agents/<역할>.md` render | `.codex/agents/<역할>.toml` render + `.codex/config.toml` merge(`[agents.<역할>]`) | 없음 | `.kiro/agents/<역할>.json` render + `.kiro/agents/<slug>.json`(조율 에이전트) render |
| 훅 | `.claude/settings.json` merge | `.codex/hooks.json` merge | 없음(6장 확인 뒤) | IDE: `.kiro/hooks/<id>.json` render(훅마다 파일 하나). CLI: 조율 에이전트 `.kiro/agents/<slug>.json`의 `hooks` 절(`agentSpawn` · `preToolUse` · `stop`, `timeout_ms`)을 같은 render로 만든다 |
| 기타 설정 | `.claude/settings.json`의 `permissions.deny` 항목 merge | `.codex/config.toml`의 `[features] multi_agent`, `[shell_environment_policy]` merge | — | — |

- 복사본은 원본과 같은 바이트다. 그래서 킷 스킬 · 규칙 안에서 다른 파일을 가리킬 때는 상대 경로(`../rules/x.md`) 대신 리포 기준 경로(`.agents/rules/x.md`)를 쓴다. 스킬 폴더 안 참조(`references/x.md`)는 폴더를 통째로 복사하므로 그대로 된다. `check_layout.py`가 킷 원본의 `../` 참조를 오류로 낸다.
- 규칙 원본 frontmatter는 `paths`(glob 목록) 하나만 쓴다. 없으면 늘 싣는 규칙이다. 늘 싣는 규칙은 꼭 지킬 가드레일만 두고, 그 합계는 12 §3.8 상시 컨텍스트에 들어간다.
- v1 `claude/settings.json`의 `permissions.defaultMode: acceptEdits`와 `enabledPlugins`는 v2에서 킷이 관리하지 않는다. 이미 있는 값은 그대로 두고 `user` 몫으로 본다.

### 3.3 새 하네스 붙이기

1. `packages/cli/src/adapters/<id>.ts`에 `HarnessAdapter`를 구현한다. 그대로 읽기·복사·생성·병합 중 무엇을 쓸지 3.2 표의 한 열로 정한다. 링크는 쓰지 않는다.
2. `packages/cli/src/adapters/index.ts`의 목록에 한 줄을 더한다. `layout.json`의 `harnesses`에 id를 더한다.
3. `packages/cli/test/adapters/<id>.test.ts`: fixture 리포에 `plan`을 돌린 작업 목록 스냅숏, `remove <id>` 뒤 그 하네스 폴더 파일 0개.
4. 릴리스 점검표(5장 4번)에 그 하네스의 스킬 목록 확인 한 줄을 더한다.

예: Gemini CLI — 진입 `GEMINI.md` merge(킷 블록에 `@AGENTS.md`), 스킬 `.gemini/skills/<이름>/` mirror. 확인 전에는 어댑터를 내지 않는다.

### 3.4 hooks.json

```jsonc
{
  "schema": "knots-sync.hooks/v1",
  "hooks": [
    { "id": "harness-session-start", "event": "session-start",
      "script": "scripts/hooks/session-start.sh", "timeoutSec": 15, "owner": "kit",
      "description": "하네스 컨텍스트와 업그레이드 공지를 세션에 붙인다" },
    { "id": "harness-protect-sources", "event": "pre-tool", "tools": ["write"],
      "script": "scripts/hooks/protect-sources.sh", "timeoutSec": 15, "owner": "kit", "floor": true,
      "description": "보호 경로 쓰기를 막는다" },
    { "id": "harness-block-full-verify", "event": "pre-tool", "tools": ["shell"],
      "script": "scripts/hooks/block-full-verify.sh", "timeoutSec": 15, "owner": "kit", "floor": true,
      "description": "에이전트 세션의 full 검증을 막는다(01 §3.2)" },
    { "id": "harness-verify-gate", "event": "stop",
      "script": "scripts/hooks/verify-gate.sh", "timeoutSec": 180, "owner": "kit", "floor": true,
      "env": { "HARNESS_VERIFY_FAIL_EXIT": { "kiro": "1" } },
      "description": "턴이 끝날 때 그 세션의 변경을 검증한다" },
    { "id": "harness-role-readonly", "event": "pre-tool", "tools": ["write", "shell"],
      "script": "scripts/hooks/role-readonly.sh", "timeoutSec": 15, "owner": "kit",
      "description": "read-only 역할의 하위 에이전트가 파일을 쓰지 못하게 한다(3.6)" },
    { "id": "harness-protect-generated", "event": "pre-tool", "tools": ["write"],
      "script": "scripts/hooks/protect-generated.sh", "timeoutSec": 10, "owner": "kit",
      "description": "생성 파일(mirror·render 대상)을 직접 고치지 못하게 하고 원본 경로를 알린다(3.12)" },
    { "id": "harness-sync-projection", "event": "post-tool", "tools": ["write"],
      "script": "scripts/hooks/sync-projection.sh", "timeoutSec": 20, "owner": "kit",
      "description": ".agents/skills·rules·roles 원본을 고치면 복사본을 다시 만든다. 출력 0바이트(3.12)" },
    { "id": "harness-worktree-create", "event": "worktree-create", "harnesses": ["claude"],
      "script": "scripts/hooks/worktree-create.sh", "timeoutSec": 120, "owner": "kit" },
    { "id": "harness-worktree-remove", "event": "worktree-remove", "harnesses": ["claude"],
      "script": "scripts/hooks/worktree-remove.sh", "timeoutSec": 60, "owner": "kit" }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `id` | `^harness-[a-z0-9-]+$`, 파일 안에서 하나. 팩 훅은 `harness-<팩>-<이름>` |
| `event` | 3.4 아래 표의 추상 이벤트 |
| `tools` | `pre-tool`·`post-tool`만. 없으면 `any` |
| `script` | 리포 상대 경로, `scripts/` 아래. 존재·실행 권한은 doctor가 본다 |
| `harnesses` | 없으면 깔린 하네스 중 그 이벤트를 지원하는 전부 |
| `module` | 값이 있으면 그 모듈을 켤 때만 만든다(R2.3) |
| `floor` | `true`면 팩·개인 층이 빼거나 덮을 수 없다([04](04-extension-layers.md#38-게이트-하한)) |
| `env` | 하네스별 환경변수. 명령 앞에 `KEY=VALUE`로 붙인다 |
| `owner` | `kit` · `pack:<이름>` · `user`(프로젝트가 더한 훅) |

| 추상 이벤트 | Claude Code | Codex | Kiro IDE(`.kiro/hooks/`) | Kiro CLI(에이전트 `hooks`) |
|---|---|---|---|---|
| `session-start` | `SessionStart` | `SessionStart` | `SessionStart` | `agentSpawn` |
| `pre-tool` · `post-tool` | `PreToolUse` · `PostToolUse` | `PreToolUse` · `PostToolUse` | `PreToolUse` · `PostToolUse` | `preToolUse` · `postToolUse` |
| `stop` | `Stop` | `Stop` | `Stop` | `stop` |
| `user-prompt` | `UserPromptSubmit` | 6장 확인 | 6장 확인 | `userPromptSubmit`(6장 확인) |
| `worktree-create` · `worktree-remove` | `WorktreeCreate` · `WorktreeRemove` | 없음 | 없음 | 없음 |

| 추상 도구 | Claude Code | Codex | Kiro IDE | Kiro CLI |
|---|---|---|---|---|
| `write` | `Write\|Edit\|MultiEdit\|NotebookEdit` | `apply_patch` | `fs_write\|fs_append\|str_replace\|delete_file\|edit_code\|semantic_rename\|smart_relocate` | `write` |
| `shell` | `Bash` | `Bash`(6장 확인) | 6장 확인 | `shell` |

v1 템플릿의 Kiro 조율 에이전트(`kiro-agents/__PROJECT_SLUG__.json`)에 이미 CLI 훅 세 개(`agentSpawn` · `preToolUse` matcher `write` · `stop`)가 손으로 들어 있다. v2는 이 절을 hooks.json에서 만든다.

명령 문자열(모든 하네스가 같은 디스패처를 부르고, 명령 안에 id가 들어간다):

```text
Claude  bash "$CLAUDE_PROJECT_DIR"/scripts/hooks/dispatch.sh harness-verify-gate scripts/hooks/verify-gate.sh
Codex   bash -c 'r="$PWD"; while [ "$r" != / ] && [ ! -f "$r/.agents/knots-sync.json" ] && [ ! -f "$r/.agents/harness.json" ]; do r="$(dirname "$r")"; done;
        [ -f "$r/scripts/hooks/dispatch.sh" ] || exit 0; exec bash "$r/scripts/hooks/dispatch.sh" "$1" "$2"'
        _ harness-verify-gate scripts/hooks/verify-gate.sh
Kiro    HARNESS_VERIFY_FAIL_EXIT=1 bash -c '…Codex 와 같다…' _ harness-verify-gate scripts/hooks/verify-gate.sh
```

### 3.5 병합 규칙

Claude `.claude/settings.json`과 Codex `.codex/hooks.json`은 구조가 같다(`hooks.<이벤트>[] = {matcher?, hooks: [{type, command, timeout}]}`). 같은 알고리즘을 쓴다.

킷 항목 판정: `hooks[].command`에 ` harness-<id> ` 토큰이 있으면 킷(또는 팩) 항목이다. v1 항목은 id가 없으므로 명령이 `scripts/hooks/session-start.sh`·`protect-sources.sh`·`verify-gate.sh`로 끝나면 v1 킷 항목으로 보고 이번에 바꾼다.

이벤트 E마다:

1. `arr = settings.hooks[E] ?? []`.
2. 각 그룹 g의 `hooks[]`에서 킷 항목을 뺀다. 킷 항목만 있던 그룹은 자리(첫 번째 위치)를 기억하고 지운다. 다른 도구 항목과 섞인 그룹은 킷 항목만 빠지고 남는다.
3. 원하는 킷 항목을 matcher별 그룹으로 묶는다(hooks.json 순서).
4. 기억한 첫 위치에 새 그룹들을 넣는다. 위치가 없으면 배열 끝에 넣는다.
5. 배열이 비고 lock에 `createdByKit: true`면 키 E를 지운다.

| 설정 키 | lock `keys` 표기 | 규칙 |
|---|---|---|
| 훅 | `hooks.Stop:harness-verify-gate` | 위 알고리즘 |
| 권한 거부 | `permissions.deny:Edit(//**/docs/references/**)` | 문자열이 없으면 넣는다. lock에 있는데 이번에 원하지 않으면 뺀다. 다른 항목은 두지 않는다 |
| Codex 역할 | `toml:agents.reviewer` | `.codex/config.toml`의 `[agents.reviewer]` 표 전체를 킷이 소유한다. 표 머리 줄부터 다음 표 머리 줄 전까지를 바꾼다 |
| Codex 기능 | `toml:features.multi_agent` · `toml:agents.max_threads` | 키가 없을 때만 넣는다. 값이 있으면 사람 값으로 본다 |
| VS Code(P19) | `jsonc:git.detectWorktrees` | 주석을 보존하는 JSONC 편집(번들한 `jsonc-parser`) |

- JSON은 들여쓰기 2칸, 키 순서 보존, 끝 줄바꿈으로 쓴다. 파일을 해석할 수 없으면 쓰지 않고 conflict로 보고한다(exit 4).
- Kiro IDE 훅은 파일 하나가 훅 하나라 병합이 없다. `.kiro/hooks/harness-*.json`은 render, 그 밖의 파일은 건드리지 않는다. Kiro CLI 훅은 킷이 만드는 조율 에이전트 파일 안에 있으므로 그 파일의 render에 포함된다.
- 병합 엔진은 사람이 연 세션의 모델·effort를 정하는 키를 쓰지 않는다. 금지 키 목록은 [12](12-model-routing.md)가 정하고, 킷·팩·모듈 병합이 그 키를 넣으려 하면 거부한다.

### 3.6 역할 파일

`.agents/roles/<이름>.md`에 frontmatter를 더한다. 본문은 지금 역할 원본 그대로다.

```yaml
---
name: reviewer
description: 변경을 마친 뒤 커밋 전에 정확성·보안·회귀·누락 테스트·문서 사실을 심각도별로 검토할 때 쓴다. 테스트는 돌리고 파일은 고치지 않는다.
mode: read-only                     # read-only | write
tools: [read, search, shell]        # read | search | shell | write | web
tier: standard                      # 선택. light | standard | deep 또는 model·effort 직접 지정(12 문서). 잠긴 역할은 두지 않는다
summary: |
  출력: 심각도(CRITICAL · HIGH · MEDIUM · LOW)별로 "파일:줄 — 문제 — 실패 시나리오(입력 → 결과) — 제안". 지적은 7개까지.
  끝에 실행한 검증과 결과, 판정(승인 / 수정 필요)을 쓴다.
harness:                            # 하네스별 덮어쓰기(선택)
  codex: { note: "read-only 샌드박스에서는 파일을 쓰는 검증을 돌리지 않고 호출자가 돌린 결과로 판정한다." }
  kiro:  { resources: ["file://.agents/rules/pr-review-policy.md"] }
---
```

| 추상 도구 | Claude `tools` | Codex | Kiro `tools` |
|---|---|---|---|
| `read` | `Read` | (항상) | `read` |
| `search` | `Glob, Grep` | (항상) | (`read`에 포함) |
| `shell` | `Bash` | (항상) | `shell` |
| `write` | `Edit, Write` | `sandbox_mode = "workspace-write"` | `write` |
| `web` | `WebFetch, WebSearch` | 6장 확인 | 6장 확인 |

`mode: read-only` → Codex `sandbox_mode = "read-only"`, Kiro `allowedTools: ["read"]`. `mode: write` → Codex `"workspace-write"`, Kiro `allowedTools: ["read", "write"]`.

읽기 전용을 하네스마다 어떻게 지키나:

| 하네스 | 역할 파일이 막는 것 | 모자라는 곳 → 보완 |
|---|---|---|
| Claude Code | `tools`에 `Edit`·`Write`가 없으면 쓰기 도구를 못 쓴다 | `Bash`로 쓰는 것(`>`·`sed -i`)은 막지 않는다 → 아래 훅 |
| Codex | Codex 문서상 역할 `.toml`의 `sandbox_mode`는 부모 세션의 샌드박스를 덮지 않는다. 부모가 `workspace-write`면 역할도 쓸 수 있다(6장 확인) | `developer_instructions` 첫 줄에 "파일을 고치지 않는다. `apply_patch`·쓰기 셸 명령을 쓰지 않는다"를 넣고, 아래 훅으로 막는다 |
| Kiro | `allowedTools`는 묻지 않고 허용할 도구만 정한다. `tools`에 `write`가 없으면 쓰기 도구가 없다 | `shell`을 주면 셸로 쓸 수 있다 → 아래 훅 |

보완 훅 `harness-role-readonly`(event `pre-tool`, tools `write`·`shell`, 킷 훅): 입력 JSON에 하위 에이전트 표지(`agent_type` 등)가 있고 그 역할 원본이 `mode: read-only`면, `write` 도구는 막고(exit 2) `shell`은 01 §3.2와 같은 방식으로 명령 문자열에서 쓰기 연산(`>`·`>>`·`tee`·`sed -i`·`git commit`·`git push`·`rm`·`mv`)을 찾아 막는다. 입력에 역할 표지가 없는 하네스에서는 이 훅이 아무것도 하지 않으므로, 그 하네스의 읽기 전용은 지시문에만 기댄다(6장 확인 항목).

모델·effort: 역할 원본의 `tier`(또는 `model`·`effort`)는 [12](12-model-routing.md)의 정책표로 하네스별 필드가 된다(Claude 에이전트 md의 `model`·`effort`, Codex 역할 toml의 `model`·`model_reasoning_effort`, Kiro는 모델만 — effort 필드가 없다). 잠긴 역할(기본 `implement`·`design`·`review`)은 필드를 쓰지 않고 상속한다. 생성기는 12가 돌려준 필드만 붙이고 그 밖의 모델 관련 키를 쓰지 않는다.

스킬: 킷 스킬(`.agents/skills/kns-*/SKILL.md`)의 frontmatter에는 `context: fork`가 아닌 한 `model`·`effort`를 두지 않는다. Claude Code에서 스킬의 모델·effort는 그 턴이 끝날 때까지 주 세션에 적용되기 때문이다. 어댑터는 링크하기 전에 스킬 frontmatter를 읽어, 킷 스킬이 이를 어기면 오류(`skill-model-field`), 팩·프로젝트 스킬이면 경고를 낸다.

생성 결과(HK-13: 원본을 읽으라는 지시만 두지 않고 역할 본문 전체를 그 자리에 넣는다 — 아래 예시의 지시문 · `<summary>` 자리가 본문이다. Kiro는 `prompt`에 본문을 넣고 `resources`에서 역할 원본을 뺀다):

```text
.claude/agents/reviewer.md
---
name: reviewer
description: <description>
tools: Read, Glob, Grep, Bash
---
<!-- knots-sync 생성 · 원본 .agents/roles/reviewer.md · 원본을 고친 뒤 npx knots-sync repair -->
이 하네스의 `AGENTS.md`를 먼저 읽는다. 그다음 역할 원본 `.agents/roles/reviewer.md`를 읽고 그대로 따른다.
<summary>

.codex/agents/reviewer.toml
# knots-sync 생성 · 원본 .agents/roles/reviewer.md
name = "reviewer"
description = "<description>"
sandbox_mode = "read-only"
developer_instructions = """
파일을 고치지 않는다. apply_patch 와 파일을 쓰는 셸 명령을 쓰지 않는다(이 역할은 read-only 다).
이 하네스의 AGENTS.md 를 먼저 읽는다. 그다음 역할 원본 .agents/roles/reviewer.md 를 읽고 그대로 따른다.
<summary>
<harness.codex.note>
"""

.kiro/agents/reviewer.json
{ "name": "reviewer", "description": "<description>",
  "prompt": "AGENTS.md와 .agents/roles/reviewer.md를 읽고 역할 지침을 따른다.",
  "tools": ["read", "shell"], "allowedTools": ["read"],
  "resources": ["file://AGENTS.md", "file://.agents/roles/reviewer.md", "file://.agents/rules/guardrails.md",
                "file://.agents/rules/pr-review-policy.md", "skill://.agents/skills/**/SKILL.md"] }
```

`.codex/config.toml`의 `[agents.reviewer]`에는 `description`과 `config_file = "agents/reviewer.toml"`을 쓴다. 역할 배정(`roles.*.harness`)은 이 생성과 별개다. 역할 파일은 깐 하네스 모두에 만들고, 세션 시작 훅이 배정을 안내한다(P21).

### 3.7 Kiro steering

규칙 원본의 `paths`로 만든다. 요약만 싣고 원본 경로를 적는 방식(v1 포인터와 같은 문제)은 쓰지 않는다.

| 원본 | `.kiro/steering/<규칙>.md` |
|---|---|
| `paths` 있음 | `inclusion: fileMatch`, `fileMatchPattern`(`paths`가 여럿이면 Kiro가 받는 형식으로, §6) + 원본 본문 전체 |
| `paths` 없음 | `inclusion: always` + 원본 본문 전체 |

```markdown
---
inclusion: fileMatch
fileMatchPattern: "src/**/*.kt"
---
<!-- knots-sync 생성 · 원본 .agents/rules/code-maintenance.md · 고칠 때는 원본을 고친다 -->
<원본 본문>
```

- Kiro가 `#[[file:.agents/rules/<규칙>.md]]` 참조를 IDE와 CLI 모두에서 펼친다고 확인되면(§6), 본문 복사 대신 그 한 줄을 쓴다. 펼치는 것은 도구이고 모델이 아니므로 포인터 문제가 없다.
- 상대 링크는 `.kiro/steering/` 기준으로 고친다.
- `inclusion: always` steering 합계가 24KB를 넘으면 doctor · check_layout이 경고한다. 모든 생성 결과는 `render` 항목(`from` · `fromSha256`)이라 원본이 바뀌면 `stale`이 된다.

### 3.8 CLAUDE.md

```markdown
@AGENTS.md

<!-- knots-sync:begin claude — 이 블록은 npx knots-sync 이 관리한다. 블록 밖은 프로젝트 몫이다 -->
## Claude Code 전용

- 스킬 `.claude/skills/`, 규칙 `.claude/rules/`, 역할 `.claude/agents/`는 `.agents/`에서 만든 복사본 · 생성물이다. 고칠 때는 `.agents/`의 원본을 고친다(훅이 복사본을 다시 만든다).
- 규칙은 `.claude/rules/`에서 자동으로 실린다. `paths`가 있는 규칙은 그 경로의 파일을 다룰 때 실린다.
- `claude -w <이슈키>`는 WorktreeCreate 훅이 `../<리포>.worktrees/<이슈키>-<이름>/`에 만든다.
- 킷 훅은 입력의 `cwd`로 리포를 정한다. worktree 안에서도 `${CLAUDE_PROJECT_DIR}`는 메인 폴더다.
<!-- knots-sync:end claude -->
```

- lock: `{path: "CLAUDE.md", op: "merge", owner: "kit", keys: ["block:claude"]}`. 블록 밖 내용은 프로젝트 소유다.
- v1에서 넘어올 때: 지금 `CLAUDE.md`가 v1 판(sha = B)이면 위 모양으로 통째로 바꾼다. 사람이 고쳤으면 `CLAUDE.md.new`에 새 모양을 두고 conflict로 보고한다.
- 첫 줄 `@AGENTS.md`가 없으면 블록 앞에 넣는다(키 `line:@AGENTS.md`).
- 킷 블록 크기 1.5KB 이하. 진입 파일 예산 24KB는 `AGENTS.md`와 `CLAUDE.md` 바이트 합이다.

### 3.9 check_layout.py

`scripts/harness/check_layout.py [--root <경로>] [--json] [--verbose]`. Python 3.11 표준 라이브러리(`tomllib`)만 쓴다. Node 없이 fast 검증에서 돈다.

1. `.agents/knots-sync.lock`을 읽는다. v1(TSV)이면 `lock v1 — 배치 검사는 v2부터` 한 줄, exit 0.
2. 항목마다 판정한다(02 §3.11 표와 같은 규칙):

| op | 검사 | 오류 |
|---|---|---|
| `mirror` | 존재, tree-sha256(복사본) = `sha256`, tree-sha256(`from`) = `fromSha256` | `missing` · `drifted` · `stale` |
| `render` | 파일 존재, sha(파일) = `sha256`, sha(`from`) = `fromSha256` | `missing` · `drifted` · `stale` |
| 하네스 폴더(`.claude/` `.codex/` `.cursor/` `.kiro/`)의 킷 경로 | 심볼릭 링크가 없다 | `symlink-found` |
| 킷 스킬 · 규칙 원본 | `../`로 시작하는 상대 참조가 없다(3.2) | `relative-ref` |
| `merge` | JSON·TOML·md 블록을 해석해 `keys`가 모두 있다 | `merge-missing` |
| `copy`(kit) | 존재 | `missing`(사람 수정 `drifted`는 `--verbose`에서만 정보로 출력) |
| `none` · `external:*` | 보지 않는다 | — |

3. lock 경로 옆의 `<경로>.new`·`.bak`을 경고로 낸다.
4. `AGENTS.md` + `CLAUDE.md` 바이트 > 24,576이면 경고. `inclusion: always` Kiro steering 합계 > 24,576이면 경고.
5. 출력(오류 한 줄 = 한 항목):

```text
✖ stale        .kiro/steering/git-workflow.md — 원본 .agents/rules/git-workflow.md 가 바뀌었다 → npx knots-sync repair
✖ drifted      .claude/skills/kns-plan — 복사본을 직접 고쳤다. 원본 .agents/skills/kns-plan 을 고친다 → npx knots-sync repair
⚠ entry-size   AGENTS.md + CLAUDE.md = 61,234 bytes (기준 24,576)
배치 검사: 항목 312개, 오류 2, 경고 1
```

6. 오류가 있으면 exit 1, 아니면 0. 항목 500개에서 1초 이내(파일 해시 500회).

연결: 스택 `verify.sh` fast 블록의 구조 점검 다음 줄에 `python3 scripts/harness/check_layout.py`. changed·affected에서는 `.agents/verify-checks.json`의 항목 `harness-layout`(경로 `.agents/**` `.claude/**` `.codex/**` `.cursor/**` `.kiro/**` `AGENTS.md` `CLAUDE.md`)으로 돈다.

### 3.10 훅의 worktree 대응

지금 동작(근거: Claude Code 문서 "Hook paths don't follow the worktree"):

| 스크립트 | 리포를 정하는 방법 | worktree 세션에서 생기는 일 |
|---|---|---|
| `verify-gate.sh` | `cd "$(dirname "$0")/../.."` | 메인 폴더에서 `verify-changed.py --session`을 돈다. worktree 변경은 검증하지 않는다 |
| `session-start.sh` | 스크립트 위치 | 메인 폴더의 공지·세션 정보를 붙인다 |
| `protect-sources.sh` | 경로 정규식은 위치와 무관, `session-context.py --root`는 스크립트 위치 | 보호 경로 차단은 되지만 세션 협업 판정이 메인 폴더 기준이다 |

v1의 Codex·Kiro 래퍼는 이미 `$PWD`에서 위로 올라가 `.agents/harness.json`을 찾는다. v2는 README §10대로 `.agents/knots-sync.json`도 찾게 바꾼다(위 명령 문자열). Claude 설정만 `$CLAUDE_PROJECT_DIR`로 스크립트를 부른다.

바꾼 뒤: 모든 킷 훅은 `scripts/hooks/dispatch.sh <id> <script>`를 거친다.

```bash
#!/usr/bin/env bash
# dispatch.sh — 입력의 cwd 로 하네스 루트를 정하고 그 루트의 스크립트를 부른다.
set -uo pipefail
payload=""; [ -t 0 ] || payload="$(cat)"
self_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
root="$(python3 "$self_root/scripts/hooks/hook_root.py" --fallback "$self_root" <<<"$payload")" || root="$self_root"
script="$root/$2"; [ -f "$script" ] || script="$self_root/$2"     # 옛 브랜치 worktree 에 스크립트가 없을 때
HARNESS_ROOT="$root" HARNESS_HOOK_ID="$1" exec bash "$script" <<<"$payload"
```

`hook_root.py` 판정:

1. 입력 JSON의 `cwd`가 절대경로이고 폴더면 시작점, 아니면 `--fallback`.
2. 시작점부터 위로 올라가며 `.agents/harness.json`이나 `.agents/knots-sync.json`이 있는 첫 폴더를 루트로 쓴다. 다층 리포에서 단위·도메인 폴더에는 `harness.json`만 있으므로 가장 가까운 단위가 루트가 된다(knots 도메인·단위 폴더에 `knots-sync.json`은 없다).
3. 파일 시스템 루트까지 못 찾으면 `--fallback`을 출력하고 stderr에 `하네스 루트를 못 찾아 메인 폴더를 쓴다: <cwd>`.
4. 찾은 루트에서 `git rev-parse --git-dir`과 `--git-common-dir`이 다르면 `HARNESS_WORKTREE=1`, `HARNESS_MAIN_ROOT=<common dir의 상위>`를 stdout 둘째·셋째 줄로 낸다. 디스패처가 환경변수로 넘긴다.

스크립트 쪽 변경: 세 스크립트의 루트 계산을 `HARNESS_ROOT="${HARNESS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"`로 바꾼다. 디스패처 없이 사람이 직접 불러도 지금처럼 돈다.

세션 협업 저장소(`.agents/coordination/`)는 checkout마다 따로 둔다. 다른 worktree의 세션은 다른 폴더·다른 브랜치를 쓰므로 파일 소유 충돌이 생기지 않는다. 세션 목록은 메인 폴더의 `.agents/state/sessions/`에 모은다([05 §3.10](05-worktree.md)).

### 3.11 업그레이드 공지

1. 킷 저장소에 `UPGRADE.md`(버전별 `## 2.0.0` 절, 절마다 800자 이하)를 둔다.
2. `update`가 버전을 올리면 `from` 초과 `to` 이하 절을 모아 `.agents/harness-upgrade-notice.md`를 쓴다(주인 kit, render, 커밋한다 — 동료가 pull하면 받는다).

```markdown
---
kitFrom: 1.0.8
kitTo: 2.0.0
date: 2026-12-01
expires: 2026-12-31          # date + 30일
---
# 하네스 업데이트 1.0.8 → 2.0.0
- MR 전 검증은 `bash scripts/verify.sh --affected`. full은 CI가 돈다.
- 새 SDD 경로: `.agents/docs/issues/<이슈키>-<이름>/`.
- 사람이 병합할 `.new` 2개: `.agents/rules/tech.md.new`, `CLAUDE.md.new`.
```

3. `session-context.py`(지금 이미 이 파일을 읽는다)가 `expires`가 오늘 이후일 때만 붙인다. 붙이는 것은 제목 한 줄과 경로(`하네스 업데이트 1.0.8 → 2.0.0 · 읽을 것: .agents/harness-upgrade-notice.md`, 약 120바이트)이고, 본문 줄은 바뀌는 상태 예산 512바이트(README 원칙 10, 12 §3.8)에 자리가 남을 때만 앞에서부터 붙인다. 예산 안 순서는 대기함 → 세션 · 점유 → 공지다. 지금 상한은 12,000자다.
4. Claude SessionStart는 stdout을 컨텍스트로 붙인다. Codex는 첫 글자가 `[`·`{`면 JSON으로 읽으므로 공지 앞에 일반 문장 한 줄을 둔다(지금 규칙). Kiro는 stdout.
5. `doctor`는 만료된 공지를 정보로 알리고, 다음 `update`가 킷이 만든 만료 공지를 지운다.

### 3.12 복사본 동기화

원본은 `.agents/` 하나이고 하네스 폴더에는 실제 파일 복사본이 있다. 둘이 어긋나지 않게 네 겹으로 막는다. 모두 스크립트이고 모델을 부르지 않는다(README 원칙 10).

| 겹 | 언제 | 하는 일 |
|---|---|---|
| 동기화 훅 `harness-sync-projection` | 에이전트가 `.agents/skills/**` · `.agents/rules/**` · `.agents/roles/**`를 Write · Edit한 뒤(PostToolUse) | `python3 scripts/harness/projection.py sync --changed <경로>`가 그 원본의 `mirror` · `render` 대상을 다시 만들고 lock의 해시를 고친다. 성공하면 출력 0바이트, 실패하면 한 줄(200바이트 이하) |
| 보호 훅 `harness-protect-generated` | 에이전트가 `mirror` · `render` 대상을 Write · Edit하려 할 때(PreToolUse) | exit 2와 "생성 파일이다. 원본 `<from>`을 고친다" |
| 배치 검사 | `verify.sh --fast` · changed · affected(`harness-layout`) | `stale` · `drifted` · `symlink-found`를 오류로 낸다(3.9) |
| 되돌리기 | 사람이 | `npx knots-sync repair`, Node가 없으면 `python3 scripts/harness/projection.py sync` |

- `projection.py`(HK-13, `projection_wants.py` · `projection_engine.py` · `projection_render.py` · `projection_merge.py`)는 Python 표준 라이브러리만 쓴다. `mirror`는 그대로 복사하고, `render`(Cursor `.mdc` · Kiro steering · 역할)는 frontmatter만 바꾸는 규칙이라 TS 어댑터와 같은 결과를 내도록 둘을 같은 fixture로 시험한다(02 §3.15와 같은 방식).
- 사람이 편집기로 원본을 고치면 훅이 돌지 않는다. 그때는 커밋 전 fast 검증이 `stale`로 알려 주고, 출력에 고칠 명령을 적는다.
- `.gitattributes`에 생성 경로(`.claude/skills/kns-*/**` · `.claude/rules/**` · `.claude/agents/**` · `.cursor/commands/kns-*` · `.cursor/rules/**` · `.kiro/skills/kns-*/**` · `.kiro/steering/**`)를 `linguist-generated=true`로 적어 MR diff에서 접히게 한다. 킷 몫 줄만 `merge`로 넣는다.
- 복사본이 생겨도 세션 토큰은 늘지 않는다. 하네스는 원본이 아니라 복사본 하나만 읽는다.

## 4. 버린 대안과 이유

| 대안 | 버린 이유 |
|---|---|
| 하네스 폴더 전체를 생성하고 커밋하지 않는다(`.gitignore`) | clone 직후 `npx` 한 번이 없으면 하네스가 아무것도 못 읽는다. Node 없는 동료가 막힌다 |
| 심볼릭 링크로 배치 | Claude Code가 링크된 스킬을 목록 · 자동완성 · 실행에서 놓치는 이슈가 있다(anthropics/claude-code #14836 · #36659 · #38051, 문서는 `.claude/rules`만 링크 지원을 적는다). Windows 기본 git · `core.symlinks=false` · zip에서 깨진다 |
| "원본을 읽어라" 포인터 파일(v1 방식) | 모델이 그 파일을 열지 않고 넘어가면 규칙 · 스킬이 빠진다. 복사본 + 동기화 훅 + 검사로 둔다 |
| 복사본을 손으로 맞춤 | v1의 78개 문제가 그대로다. 생성 · 훅 · 검사로 맞춘다(3.12) |
| 설정 파일을 킷이 통째로 소유 | 다른 도구(AI-DLC 훅 17개 등)와 사람의 항목을 지운다(README 원칙 3) |
| 훅마다 하네스별 스크립트 | 판정 로직이 세 벌이 된다. 디스패처 하나 + 스크립트 하나로 둔다 |
| `${CLAUDE_PROJECT_DIR}` 대신 `git rev-parse --show-toplevel`(훅 실행 폴더 기준) | 훅 실행 폴더는 메인 폴더다. worktree를 아는 값은 입력의 `cwd`뿐이다 |
| 루트 표지를 `.agents/knots-sync.json` 하나로 | 다층 리포의 도메인·단위 폴더에는 그 파일이 없다. 가장 가까운 단위를 못 찾는다 |
| Kiro steering에 원본 전체를 항상 포함 | 규칙 17개를 매 세션 싣는다. `paths`가 있는 규칙은 `fileMatch`로 그 경로 작업 때만 싣는다 |
| 요약만 싣고 원본 경로를 적는 steering | 요약에 없는 규칙은 모델이 원본을 열어야 지켜진다. 포인터와 같은 문제다 |
| 역할 파일을 하네스별로 손으로 | 지금 16개를 손으로 맞춘다. 원본 하나 + 생성으로 바꾼다 |

## 5. 완료 기준

[03장 P18 완료 기준](../harness-next/03-plan.html#p18)에 측정 방법을 붙인다.

1. 임시 리포에 `init --agents all` 뒤, `find .claude .codex .cursor .kiro -type f`의 모든 경로(사람·외부 파일 제외)가 lock의 `mirror`·`render`·`merge` 항목이고(시험이 두 집합을 비교한다), `find … -type l`은 0건이다.
2. `.agents/rules/git-workflow.md` 한 줄 수정 → `bash scripts/verify.sh --fast` exit 1(`stale` 1건) → `npx knots-sync repair` → exit 0.
3. 메인 폴더 + worktree fixture에서 `CLAUDE_PROJECT_DIR=<메인>`, 입력 `cwd=<worktree>`로 디스패처를 부르면: 보호 경로 쓰기 exit 2, Stop 훅의 가짜 `verify.sh`가 기록한 작업 폴더가 worktree다(시험 2건).
4. 릴리스 점검표 4건: Claude `/kns-plan`, Codex `$kns-plan`, Cursor `/kns-plan`, Kiro CLI 스킬 목록에 `kns-plan`이 보인다(수동, 하네스 버전과 날짜를 적는다).
5. 동기화: `.agents/skills/kns-plan/SKILL.md`를 Edit한 훅 입력 fixture → `harness-sync-projection` 뒤 `.claude/skills/kns-plan/SKILL.md` · `.kiro/skills/kns-plan/SKILL.md`가 원본과 같은 바이트이고 lock 해시가 바뀌며 훅 출력은 0바이트. `.claude/skills/kns-plan/SKILL.md`를 Edit하는 입력은 exit 2. `core.symlinks=false` fixture에서도 `init` 결과가 같다.
10. 규칙 자동 로드: `paths: ["src/**/*.kt"]` 규칙 fixture → `.claude/rules/x.md`에 `paths`가 그대로, `.cursor/rules/x.mdc`에 `globs: src/**/*.kt`, `.kiro/steering/x.md`에 `inclusion: fileMatch`. 수동 점검: Claude 세션에서 `.kt` 파일을 Read한 뒤 그 규칙에만 있는 문장을 물으면 답한다.
6. Claude 설정에 다른 도구 훅 3개가 있는 fixture에서 `init` → `update` → `uninstall`을 거친 뒤 그 3개의 내용·순서가 처음과 같다.
7. `update`로 공지를 만든 뒤 세션 시작 훅 출력에 공지 첫 줄이 있다. `expires`를 어제로 바꾸면 없다.
8. 역할 표지가 든 입력 fixture에서 read-only 역할의 `Write` 호출과 `echo x > a.txt` 셸 호출을 `harness-role-readonly`가 막는다(2건). 표지가 없으면 통과한다.
9. `model:`이 있고 `context: fork`가 없는 킷 스킬 fixture에서 `init`이 `skill-model-field` 오류로 그 스킬을 복사하지 않는다.

## 6. 확인 필요

| 항목 | 확인 방법 |
|---|---|
| Cursor · Copilot · Gemini CLI가 `.agents/skills/`를 읽는 최소 버전(P18 착수 전 확인) | 각 도구 최신판에서 빈 리포에 `.agents/skills/x/SKILL.md`만 두고 명령 목록을 본다. 공식 문서 URL·버전·날짜를 `docs/analysis/`에 남긴다 |
| Kiro steering의 `#[[file:…]]` 참조를 IDE와 CLI가 모두 읽는지, `fileMatchPattern`이 여러 glob을 받는 형식(P18 착수 전 확인) | 참조만 든 steering으로 세션을 열고 원본에만 있는 문장을 물어본다. glob 둘을 둔 steering이 두 경로 모두에서 실리는지 본다 |
| Cursor `.cursor/rules/*.mdc`의 `globs` · `alwaysApply` 형식과 Codex의 경로별 규칙 기능 유무 | 각 도구 최신 문서와 시험 리포. Codex에 생기면 3.2 표의 Codex 칸을 바꾼다 |
| Claude Code에서 같은 이름의 skill과 command가 함께 있을 때 어느 쪽이 뜨는지(P18 착수 전 확인) | `.claude/commands/kns-x.md`와 `.claude/skills/kns-x/`를 둘 다 두고 `/kns-x`를 실행한다 |
| Codex PreToolUse의 셸 도구 matcher와 입력에 `cwd`가 있는지 | 입력을 덤프하는 훅으로 본다 |
| Kiro 훅의 셸 도구 matcher, 입력 JSON 형식(`cwd` 포함 여부) | 같은 방법. `cwd`가 없으면 hook_root.py는 `$PWD`를 쓴다 |
| Codex 역할 `.toml`의 `sandbox_mode`가 부모 세션 샌드박스를 덮지 않는지(문서 기준 덮지 않는다) | 부모를 `workspace-write`로 연 세션에서 read-only 역할에 파일 쓰기를 시킨다. 써지면 3.6의 지시문 + `harness-role-readonly` 훅에 기댄다 |
| 하위 에이전트 호출 때 훅 입력에 역할 표지(`agent_type` 등)가 오는지(Claude·Codex·Kiro) | 입력 덤프 훅으로 하위 에이전트의 도구 호출을 본다. 오지 않는 하네스는 `harness-role-readonly`를 그 하네스에 만들지 않는다 |
| Kiro 에이전트 JSON이 모르는 키를 거부하는지 | 생성 표지 키(`_generated`)를 넣은 파일로 에이전트를 연다. 거부하면 lock만으로 생성 여부를 판단한다(지금 설계) |
| Cursor 훅(`.cursor/hooks.json`) 지원 버전과 이벤트 이름 | Cursor 문서와 실제 동작. 확인되면 3.2 표의 Cursor 훅 칸을 채운다 |
| `@AGENTS.md` 가져오기가 `AGENTS.md` 안의 상대 링크를 그대로 두는지 | 링크가 든 `AGENTS.md`로 Claude 세션을 열어 링크 대상 파일을 읽게 한다 |
| Kiro IDE가 `.kiro/skills/`를 읽어 `kns-*` 명령 steering이 필요 없는지 | IDE에서 스킬 목록을 본다. 읽으면 명령 steering 11개를 뺀다 |
