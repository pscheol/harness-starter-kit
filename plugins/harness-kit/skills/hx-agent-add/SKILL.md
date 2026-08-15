---
name: hx-agent-add
description: 이미 하네스가 깔린 리포에 에이전트(하네스 플랫폼) 배선을 나중에 덧붙인다. claude(.claude/ + CLAUDE.md) · codex(.codex/ + .agents/skills/) · cursor(.cursor/commands/) · kiro(.kiro/steering/ + .kiro/skills/) 중에서 고른다. 도메인·스택·아키텍처 변형·선택 모듈·치환값은 .agents/harness-kit.json 에서 읽으므로 다시 묻지 않는다. "Cursor도 쓰게 해줘", "Kiro 붙여줘", "Codex 설정 추가", "다른 에이전트 추가", "에이전트 배선 깔아줘" 요청 시 사용.
---

# hx-agent-add — 하네스에 에이전트 추가

부트스트랩은 **그 리포에서 실제로 쓰는 에이전트만** 깐다. 나중에 다른 에이전트로도
같은 리포를 만지게 되면 이 스킬로 그 배선만 덧붙인다.

## 왜 나눠 두었나

규칙 원본(`.agents/rules/`)·SDD 기록(`.agents/docs/`)·검증 게이트(`scripts/verify.sh`)는
에이전트를 가리지 않는 **core** 다. 이미 깔려 있으므로 다시 건드리지 않는다.
이 스킬이 더하는 것은 각 에이전트의 **배선**(트리거·권한·슬래시 커맨드)뿐이다.

## 에이전트별로 깔리는 것

| 에이전트 | 설치 경로 | 파일 수 | 내용 |
|---|---|---|---|
| `claude` | `.claude/` + `CLAUDE.md` | 14 | settings.json(권한·hook 배선) · hooks 3종 · `/hx-*` 커맨드 9종 · AGENTS.md 리다이렉트 |
| `codex` | `.codex/` + `.agents/skills/` | 14 | config.toml · hooks.json · hooks 3종 · `$hx-*` 스킬 9종 |
| `cursor` | `.cursor/commands/` | 9 | `/hx-*` 커맨드 9종 |
| `kiro` | `.kiro/steering/` + `.kiro/skills/` | 34 (프론트엔드 38) | 규칙 얇은 포인터 16종(도메인·스택·변형별 포함) · IDE 슬래시 9종 · CLI 스킬 9종 |

> `web`·`electron` 리포에서 `kiro` 가 4개 많은 건 `frontend` 도메인 규칙 포인터 4종 때문이다.
> 선택 모듈이 켜져 있으면 그 모듈의 해당 에이전트 파일도 함께 깔린다(`jira-workflow` 는 claude·codex·cursor 각 2 · kiro 6 — `/hx-issue` 와 `/hx-ticket` 두 커맨드).
>
> 슬래시 커맨드 9종의 본문 원본은 `.agents/rules/sdd-workflow.md` 한 곳이다.
> 각 에이전트 파일은 그것을 가리키는 얇은 트리거라, 여러 개를 깔아도 규칙이 중복되지 않는다.

## 사용 절차

1. **스킬 위치 확인** — 이 스킬이 로드된 폴더의 절대경로를 `SKILL_DIR` 로 잡는다.
   대상 리포의 `pwd` 로 유추하지 않는다(플러그인 스킬은 대상 리포 바깥에 있다).
2. **현재 상태 확인** — 무엇이 이미 깔렸는지 본다. 설치 안 된 리포면 `hx-bootstrap` 으로 보낸다.
   ```bash
   cat <대상>/.agents/harness-kit.json          # domain · stack · arch · agents · modules
   ```
3. **추가할 에이전트 확정** — 사용자에게 묻는다. 임의로 전부 깔지 않는다.
   이미 있는 것을 다시 지정해도 안전하다(빠진 파일만 채워진다).
4. **`--dry-run` 선실행** — 무엇이 새로 생기는지 보여준다.
   ```bash
   bash "$SKILL_DIR/add-agent.sh" --agents=cursor,kiro --dry-run <대상_프로젝트_경로>
   ```
5. **승인 후 실제 설치** — `--dry-run` 없이 재실행.
6. **다음 단계 안내** — 스크립트가 출력하는 에이전트별 확인 사항을 그대로 전달한다.

## 인자

| 인자 | 의미 | 없을 때 |
|---|---|---|
| `--agents=` | `claude` · `codex` · `cursor` · `kiro` 쉼표 구분(`all` 은 전체) | **필수** — 없으면 현재 설치 목록을 출력하고 `exit 2` |
| 첫 위치 인자 | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--dry-run` | 쓰지 않고 계획만 | 실제 설치 |
| `--force` | 이미 있는 파일도 덮어쓴다 | 존재하면 skip |

## 주의

- **기존 파일은 덮지 않는다.** `--force` 는 사용자가 명시적으로 요구할 때만 붙인다.
  사용자가 채운 `product.md`·`ARCHITECTURE.md` 가 날아간다.
- 메타의 `agents` 는 **기존 ∪ 추가** 로 갱신된다. 빼는 기능은 없다 — 안 쓰는 에이전트
  디렉터리는 사용자가 직접 지운다(지운 뒤 메타에서도 이름을 빼야 업데이트가 되살리지 않는다).
- 하네스가 없는 리포에서는 `exit 1` 로 멈추고 `hx-bootstrap` 을 안내한다.

## 관련

- 초기 설치: `hx-bootstrap` 스킬
- 킷 새 버전 반영: `hx-update` 스킬
- 파일→경로 맵: `../hx-bootstrap/manifest.md`
