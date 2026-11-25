---
name: agent-add
description: 이미 하네스가 깔린 리포에 에이전트(하네스 플랫폼) 배선을 나중에 덧붙인다. claude(.claude/ + CLAUDE.md) · codex(.codex/ + .agents/skills/) · cursor(.cursor/commands/) · kiro(.kiro/steering/ + .kiro/skills/) 중에서 고른다. 도메인·스택·아키텍처 변형·선택 모듈·치환값은 .agents/knots-sync.json 에서 읽으므로 다시 묻지 않는다. "Cursor도 쓰게 해줘", "Kiro 붙여줘", "Codex 설정 추가", "다른 에이전트 추가", "에이전트 배선 깔아줘" 요청 시 사용.
---

# kns:agent-add — 하네스 · 모듈 추가와 빼기

부트스트랩은 **그 리포에서 실제로 쓰는 에이전트만** 깐다. 나중에 다른 에이전트로도
같은 리포를 만지게 되면 이 스킬로 그 배선만 덧붙인다. 선택 모듈(`jira-workflow` ·
`multi-harness` · `ci`)도 같은 방법으로 켠다. 안 쓰게 된 것은 뺀다.
`ci`(CI 진입 파일)를 켜면 다음 push 부터 원격 파이프라인이 돈다 — 사람이 원격 CI 를 쓰겠다고 할 때만 켠다.

## 왜 나눠 두었나

규칙 원본(`.agents/rules/`)·SDD 기록(`.agents/docs/`)·검증 게이트(`scripts/verify.sh`)는
에이전트를 가리지 않는 **core** 다. 이미 깔려 있으므로 다시 건드리지 않는다.
이 스킬이 더하는 것은 각 에이전트의 **배선**(트리거·권한·슬래시 커맨드)과 고른 모듈의 몫뿐이다.

## 에이전트별로 깔리는 것

| 에이전트 | 설치 경로 | 파일 수 | 내용 |
|---|---|---|---|
| `claude` | `.claude/` + `CLAUDE.md` | 14 | settings.json(권한·hook 배선) · hooks 3종 · `/kns-*` 커맨드 9종 · AGENTS.md 리다이렉트 |
| `codex` | `.codex/` + `.agents/skills/` | 14 | config.toml · hooks.json · hooks 3종 · `$kns-*` 스킬 9종 |
| `cursor` | `.cursor/commands/` | 9 | `/kns-*` 커맨드 9종 |
| `kiro` | `.kiro/steering/` + `.kiro/skills/` | 배치(원본에서 생성) | 규칙 steering(`paths` → `fileMatch`) · IDE 명령 steering · CLI 스킬 복사본 |

> 하네스 폴더 파일은 `.agents/` 원본에서 만든다. 정확한 수는 `knots-sync plan --json`.
> 선택 모듈이 켜져 있으면 그 모듈의 해당 에이전트 파일도 함께 깔린다(`jira-workflow` 는 claude·codex·cursor 각 2 · kiro 6 — `/kns-issue` 와 `/kns-ticket` 두 커맨드).
> 정확한 수는 `--dry-run --json` 의 `counts` 가 낸다.

## 사용 절차

1. **스킬 위치 확인** — 이 스킬이 로드된 폴더의 절대경로를 `SKILL_DIR` 로 잡는다.
   대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 대상 리포 바깥에 있다).
2. **현재 상태 확인** — 무엇이 이미 깔렸는지 본다. 설치 안 된 리포면 `kns:bootstrap` 으로 보낸다.
   ```bash
   cat <대상>/.agents/knots-sync.json          # domain · stack · arch · agents · modules
   ```
3. **추가할 이름 확정** — 사용자에게 묻는다. 임의로 전부 깔지 않는다.
   이미 있는 것을 다시 지정해도 안전하다(그 몫에서 빠진 파일만 채워진다).
4. **`--dry-run` 선실행** — 무엇이 새로 생기는지 보여준다.
   ```bash
   bash "$SKILL_DIR/../bootstrap/kit.sh" add cursor kiro jira-workflow --cwd <대상_프로젝트_경로> --dry-run --json
   ```
   `kit.sh` 는 Node 18.3 이상이면 `bin/knots-sync.js`(CLI)를, 없거나 낮으면 같은 이름을
   `add-agent.sh --agents= --modules=` 로 옮겨 부른다(v2.0 동안만, 출력 첫 줄에 안내).
5. **승인 후 실제 설치** — `--dry-run` 없이 재실행. `--json` 의 `counts` · `ops`(create · skip-user)를 보인다.
   exit 4 면 `conflicts`(사람이 고친 `.agents/harness.json` 의 `.new`)를 그대로 보인다.
6. **다음 단계 안내** — 에이전트별 확인 사항(Claude 는 세션 재시작, Codex 는 `$kns-*` 멘션 등)을 전달한다.

빼기(CLI 에만 있다 — Node 가 없으면 `kit.sh` 가 exit 5):

```bash
bash "$SKILL_DIR/../bootstrap/kit.sh" remove cursor --cwd <대상> --dry-run --json
```

고치지 않은 그 몫의 파일만 지우고 메타에서 뺀다. 사람이 고친 파일은 남기고 exit 4 와 `keep` 목록을 낸다
(lock 에는 사람 파일로 적힌다). 하네스를 모두 빼지는 않는다 — 킷을 통째로 지우는 것은 `uninstall` 이다.

## 인자

| 인자 | 의미 | 없을 때 |
|---|---|---|
| 이름…(위치 인자) | 하네스 `claude` · `codex` · `cursor` · `kiro`, 모듈 `jira-workflow` · `multi-harness` · `ci`(공백 · 쉼표) | **필수** — 없으면 exit 2 |
| `--cwd <경로>` | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--dry-run` | 쓰지 않고 계획만 | 실제 설치 |

`aidlc` · `entire` · `notion` 모듈은 P22 에서 제공한다(지금은 exit 2).

## 주의

- **기존 파일은 덮지 않는다.** 그 자리에 사람이 둔 파일은 사람 파일로 적고 그대로 둔다.
  사용자가 채운 `product.md`·`ARCHITECTURE.md` 는 이 스킬이 건드리지 않는다.
- 메타의 `agents` · `modules` 는 **기존 ∪ 추가**(빼기면 기존 − 뺀 것)로 갱신된다. 킷 판(`kit.version`)은 그대로다 —
  킷을 올리는 것은 `kns:update` 다.
- 하네스가 없는 리포에서는 멈추고(CLI exit 3 · `add-agent.sh` exit 1) `kns:bootstrap` 을 안내한다.

## 관련

- 초기 설치: `kns:bootstrap` 스킬
- 킷 새 버전 반영: `kns:update` 스킬
- 파일→경로 맵: `../bootstrap/manifest.md`
