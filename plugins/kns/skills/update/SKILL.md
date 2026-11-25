---
name: update
description: 설치된 하네스를 knots-sync 플러그인의 현재 버전으로 올린다. 규칙·스크립트·슬래시 커맨드 변경분을 반영하되, 사용자가 고친 파일은 덮지 않고 새 버전을 .new 로 옆에 둔다(설치 시점 해시를 .agents/knots-sync.lock 에서 대조). 도메인·스택·변형·에이전트·선택 모듈은 .agents/knots-sync.json 에서 읽는다. "하네스 업데이트", "킷 새 버전 반영", "규칙 최신화", "harness update/upgrade", "플러그인 업데이트 적용" 요청 시 사용.
---

# kns:update — 킷 새 버전 반영

플러그인이 올라가도 **이미 스캐폴딩된 리포는 그대로다**. 이 스킬이 그 격차를 메운다.

## 무엇을 지키나

핵심 계약 하나다 — **사용자가 고친 파일을 덮지 않는다.**

설치할 때 각 파일의 해시를 `.agents/knots-sync.lock` 에 적어 둔다. 업데이트는 지금
리포에 있는 파일의 해시를 그것과 대조해, 같으면 손대지 않은 것으로 보고 조용히 교체하고,
다르면 사람이 고친 것으로 보고 새 버전을 `<경로>.new` 로 옆에 둔다.
설치 전부터 있던 파일(예: 손으로 쓴 `AGENTS.md`)은 사람 파일로 적혀 덮이지 않는다.
v1.0.8 이하 lock 은 둘을 가리지 못해, 첫 업데이트에서 킷이 바꾼 파일도 `.new` 로 받는다.

## 판정

| 판정 | 뜻 | 처리 |
|---|---|---|
| `new` · `restore` | 킷에는 있고 리포에 없다 | 설치한다 |
| `same` | 내용이 이미 같다 | 건너뛴다 |
| `update` | 리포 파일이 설치 당시 그대로다 | 새 버전으로 교체한다 |
| `conflict` | 리포 파일이 수정됐다 | **덮지 않고** `.new` 로 저장한다 |
| `skip-user` | 사람 파일(lock `owner: user`) | 쓰지 않는다 |
| `orphan` | lock 에는 있는데 킷에서 사라졌다 | 보고만 한다(`--prune` 이면 미수정분만 지운다) |

`ARCHITECTURE.md`·`product.md`·`structure.md` 처럼 **채우라고 준 파일**은 거의 항상
`conflict` 로 잡힌다. 정상이다 — 그 파일들은 사용자 소유다.

## 사용 절차

1. **스킬 위치 확인** — 이 스킬이 로드된 폴더의 절대경로를 `SKILL_DIR` 로 잡는다.
   플러그인이 방금 업데이트됐다면 그 새 버전의 경로여야 한다.
2. **`--dry-run` 먼저** — 무엇이 바뀌는지 보고 사용자에게 요약한다. 이 단계를 건너뛰지 않는다.
   ```bash
   bash "$SKILL_DIR/../bootstrap/kit.sh" update --cwd <대상_프로젝트_경로> --dry-run --json
   ```
   `kit.sh` 는 Node 18.3 이상이면 `bin/knots-sync.js`(CLI)를, 없거나 낮으면 같은 플래그로 `update.sh` 를 부른다
   (v2.0 동안만, 출력 첫 줄에 안내). `update.sh` 는 JSON 을 내지 않는다 — 사람용 출력을 그대로 보인다.
3. **요약 보고** — `--json` 의 `kit`(from → to) · `counts` 와 `ops`(same 이 아닌 판정)를 보인다.
   exit 4 면 `conflicts`(`.new` 경로와 `diff -u` 줄)를 **빠짐없이 그대로** 보인다.
4. **승인 후 실행** — `--dry-run` 없이 재실행(`… update --cwd <대상> --json`).
5. **충돌 처리** — 각 `.new` 를 원본과 diff 해 무엇이 달라졌는지 설명하고 병합안을 제안한다.
   사용자 확인 없이 `.new` 를 원본에 덮어쓰지 않는다. 병합을 고르는 것은 사람이다.
6. **검증** — `bash scripts/verify.sh` 통과를 확인하고 보고한다.
   미치환 토큰도 함께 본다: `grep -rn '{{' . --include='*.md' | grep -vE '_spec-templates/|\{\{\.\.\.\}\}|PRODUCT_SLUG'`

## 인자

| 인자 | 의미 | 없을 때 |
|---|---|---|
| `--cwd <경로>` | 대상 프로젝트 경로 | 현재 작업 디렉터리 |
| `--dry-run` | 판정만 출력 | 실제 반영 |
| `--accept-all` | 수정본도 새 버전으로 덮는다(원본은 `.bak`) | 수정본은 `.new` 로 병기 |
| `--prune` · `--forget <경로>` | 킷에서 빠진 미수정 파일 지우기 · 그 경로를 다음부터 받지 않기(CLI 에만 있다) | 둘 다 하지 않는다 |

## 주의

- `--accept-all` 은 **사용자가 명시적으로 요구할 때만** 쓴다. 하네스 규칙을 팀 사정에 맞게
  고쳐 둔 리포에서 이걸 돌리면 그 커스터마이징이 `.bak` 으로 밀려난다.
- 업데이트는 **에이전트 구성을 바꾸지 않는다**. 메타의 `agents` · `modules` 에 있는 것만 대상이다.
  하네스 · 모듈을 켜고 끄는 것은 `kns:agent-add`(`kit.sh add` · `remove`)가 맡는다.
  메타에 적힌 모듈이 킷에서 사라졌으면 경고하고 그 모듈만 건너뛴다.
- **킷에서 빠진 파일이 모듈로 옮겨 갔으면 그 모듈 이름을 알린다**(`movedToModules`, `update.sh` 는 orphan 줄 끝).
  CI 진입 파일(`.gitlab-ci.yml` · `.github/workflows/harness-verify.yml` · `.github/actions/harness-setup/action.yml`)은
  `ci` 모듈로 옮겼다 — 옛 설치에서는 '킷에서 빠짐'으로 보이고 지워지지 않는다. 계속 쓸지 사람에게 묻는다:
  쓰면 `kit.sh add ci`, 안 쓰면 `--prune`(고치지 않은 것만 지운다). 묻지 않고 `--prune` 을 붙이지 않는다.
- **도메인은 메타에서 읽고, 없으면 스택에서 유도한다.** 구버전 메타에는 `domain`·`modules` 가 없다 —
  `web`·`electron` 이면 `frontend` 로 채워 넣고, 그 도메인 규칙이 `new` 로 잡혀 처음 설치된다.
- 상태 파일이 없는 리포(구버전 킷으로 설치)는 멈춘다(CLI exit 3 · `update.sh` exit 1). `kns:bootstrap` 으로 한 번
  설치해 상태 파일을 만든 뒤 다시 실행한다. 이미 있는 파일은 사람 파일로 남는다.
- 보드 형식이 바뀐 킷이면 업데이트 끝에 SDD 보드(`specs-index.md`)를 한 번 다시 만든다(보드 코드가 사람 판이면 건너뛴다).

## 관련

- 초기 설치: `kns:bootstrap` 스킬
- 하네스 · 모듈 추가 · 빼기: `kns:agent-add` 스킬
- 파일→경로 맵: `../bootstrap/manifest.md`
