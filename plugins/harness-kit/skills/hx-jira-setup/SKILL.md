---
name: hx-jira-setup
description: 이슈 트래커(Jira 등) 연동을 실제로 동작하게 설정한다. jira-workflow 모듈이 깔렸는지 확인하고, 트래커 접근 수단(MCP·CLI·REST)을 정한 뒤, 트래커에서 상태 ID·전이 ID를 조회해 .agents/issue-tracker.yml 의 TBD 를 채우고 읽기 전용 스모크로 검증한다. "Jira 연동 설정", "티켓 연동 붙여줘", "issue-tracker.yml 채워줘", "상태 전이 ID 찾아줘", "이슈 트래커 세팅" 요청 시 사용.
---

# hx-jira-setup — 이슈 트래커 연동 설정 (진입 스킬)

`jira-workflow` 모듈은 **규약과 설정 스키마**를 깔아 준다. 실제로 동작하게 만드는 것이 이 스킬이다.
설치 직후 `.agents/issue-tracker.yml` 은 전부 `TBD` 이고, 그 상태에서 `/hx-issue`·`/hx-ticket` 은
**읽기만** 한다. 이 스킬이 그 값을 채운다.

> **트래커를 안 쓰는 프로젝트에는 이 설정이 필요 없다.** 모듈을 켜지 않았으면 이 스킬도 할 일이 없다 —
> 그때는 `/hx-specify` 부터 시작하는 평소 SDD 흐름을 그대로 쓴다.

## 이 스킬이 하는 일

1. 모듈이 깔렸는지 확인한다(안 깔렸으면 설치 명령을 안내한다).
2. **접근 수단**을 정한다 — 이게 가장 중요하다. 킷은 호출 수단을 제공하지 않는다.
3. 트래커에서 **상태 ID·전이 ID를 조회**해 채운다. 표시 이름을 옮겨 적지 않는다.
4. **락 모드**와 **에이전트 경계**를 정한다.
5. 읽기 전용 스모크로 검증한 뒤에야 전이를 켠다.

## 절차

### 0. 전제 확인

```bash
cat .agents/harness-kit.json | grep -A2 '"modules"'   # jira-workflow 가 있는가
ls .agents/issue-tracker.yml                          # 설정 파일이 있는가
```

없으면 모듈부터 깐다(설치 로직은 `hx-bootstrap` 의 `setup.sh` 한 곳이다):

```bash
bash "<BOOTSTRAP_DIR>/setup.sh" --modules=jira-workflow <대상_경로>
```

기존 파일은 덮지 않으므로(`↷ skip`) 이미 깔린 리포에서 다시 돌려도 안전하다.

### 1. 접근 수단 결정 (`access`)

**킷은 트래커 호출 수단을 제공하지 않는다.** 그 리포·그 하네스에서 무엇으로 Jira에 닿을 수 있는지
사용자에게 확인한다. 짐작해서 고르지 않는다 — 없는 MCP 도구를 부르면 실패가 아니라 혼란이 남는다.

| `method` | 언제 | 채울 것 |
|---|---|---|
| `mcp` | 그 하네스에 트래커 MCP 서버가 붙어 있다 | `mcpServer`(서버 이름). 도구 이름은 서버가 알려 준다 |
| `cli` | `jira`·`gh` 같은 CLI 가 설치·인증돼 있다 | `cliCommand`(인자 형식까지) |
| `rest` | 직접 호출한다 | `restAuth`(bearer/basic) · `restTokenEnv` · `restUserEnv` |
| `none` | 당분간 수동으로 한다 | 나머지는 `TBD` 로 둔다. 커맨드는 읽기도 시도하지 않는다 |

- **토큰 값을 `issue-tracker.yml` 에 적지 않는다.** 커밋되는 파일이다. **환경변수 이름만** 적는다.
- 사용자가 아직 토큰을 안 만들었으면 여기서 멈추고 만들어 오게 한다. 임시로 평문을 넣지 않는다.
- MCP 를 쓰기로 했는데 서버가 안 붙어 있으면, 붙이는 것은 하네스 설정(사용자 몫)이다. 그 사실을 알린다.

### 2. 기본 정보

`tracker` · `baseUrl` · `projectKey` · `issueKeyPattern` 을 사용자에게 확인해 채운다.
`issueKeyPattern` 은 브랜치·커밋에서 키를 찾는 데 쓰이므로 실제 프로젝트 키에 맞춘다(예: `ABC-[0-9]+`).

### 3. 상태 ID 조회 (`statusIds`)

**표시 이름을 옮겨 적지 않는다.** 트래커에서 조회한 ID 를 넣는다. Jira REST 기준 예시:

```text
GET {baseUrl}/rest/api/3/project/{projectKey}/statuses
```

- 응답에서 이 프로젝트의 워크플로에 실제로 존재하는 상태를 찾아 `todo`·`inProgress`·`inReview`·`done` 에 맞춘다.
- **이름이 다를 수 있다.** "진행 중"·"In Development"·"작업중" — 어느 것이 `inProgress` 인지 사용자에게 확인받는다.
- 대응하는 상태가 없으면(예: 리뷰 단계가 없는 워크플로) 그 사실을 적고 사용자와 결정한다.
  없는 상태를 억지로 매핑하면 전이가 조용히 엉뚱한 곳으로 간다.

### 4. 전이 ID 조회 (`transitionIds`) — 상태 ID와 다른 값이다

전이 ID 는 **그 이슈의 현재 상태에 따라 달라진다.** 대표 티켓 하나를 골라 각 상태에서 조회한다.

```text
GET {baseUrl}/rest/api/3/issue/{issueKey}/transitions
```

- `todoToInProgress` — To Do 상태의 티켓에서 조회
- `inProgressToInReview` — In Progress 상태의 티켓에서 조회
- `inProgressToTodo` — 같은 티켓에서 되돌리기 전이

**같은 워크플로를 쓰는 티켓이어야 한다.** 이슈 타입마다 워크플로가 다르면 타입별로 값이 갈린다 —
그 경우 사용자와 상의해 주 사용 타입 기준으로 채우고, 그 사실을 파일 주석에 남긴다.

### 5. 락 (`lock`)

| `mode` | 어떻게 | 고르는 기준 |
|---|---|---|
| `field` | 커스텀 필드에 소유자 문자열 | 필드를 만들 권한이 있다. 가장 깔끔하다 |
| `label` | 라벨 접두사 + 소유자 | 필드를 못 만든다. 라벨 목록이 지저분해진다 |
| `comment` | 코멘트로 표시 | 위 둘 다 안 될 때. 티켓이 시끄러워진다 |

- `ttlMinutes` 는 90~240 을 권한다. 짧으면 긴 작업 중에 남이 가져가고, 길면 죽은 락이 오래 남는다.
- `ownerFormat` 은 **사람이 읽고 연락할 수 있게** 만든다(예: `agent:<session-id>@<host>`).
  불투명한 값만 남기면 아무도 그 락을 풀지 못한다.

### 6. 에이전트 경계 (`agentBoundary`)

기본값을 그대로 쓰기를 권한다 — `maxStatus: inReview` · `mayAssign/mayClose/mayEditDescription/mayCreate: false`.

- 넓히려면 **왜 필요한지 `.agents/docs/decisions/` 에 ADR 을 남긴다.**
- `mayCreate: true` 로 켜도 에이전트는 **사용자가 명시적으로 요청할 때만** 티켓을 만든다.

### 7. 검증 — 읽기부터, 전이는 마지막

1. **미치환 확인**: `grep -n TBD .agents/issue-tracker.yml` → 의도적으로 남긴 것 외 0건.
2. **읽기 스모크**: `/hx-issue <실제_티켓_키>` 로 조회만 해 본다. 제목·상태가 제대로 나오는지 본다.
3. **전이 스모크**: **테스트용 티켓**에서 `start` → `drop` 을 돌려 본다. 실제 작업 티켓으로 하지 않는다.
4. 락이 걸리고 풀리는지 트래커 화면에서 눈으로 확인한다.
5. 성공하면 `.agents/issue-tracker.yml` 을 커밋한다(토큰이 없는지 다시 확인한다).

**전이 스모크가 통과하기 전에는 실제 작업에 쓰지 않는다.** 잘못된 ID 로 옮기면 실패가 아니라
조용히 엉뚱한 상태가 되고, 그 사실을 며칠 뒤에 안다.

## 원칙

- **표시 이름이 아니라 ID.** 이름은 번역·워크플로 수정으로 바뀐다.
- **토큰은 설정 파일에 넣지 않는다.** 환경변수 이름만.
- **`TBD` 가 남아 있으면 전이하지 않는다.** 안 옮기는 게 잘못 옮기는 것보다 낫다.
- **접근 수단을 짐작하지 않는다.** 없으면 없다고 보고한다.
- 설치 로직을 복제하지 않는다. 모듈 설치는 `hx-bootstrap` 의 `setup.sh` 한 곳이다.

## 설정이 끝난 뒤

| 하고 싶은 것 | 명령 |
|---|---|
| 티켓 조회·착수·리뷰 요청 등 **트래커만** | `/hx-issue` |
| 티켓 가져오기 → SDD 스펙 → 구현 → 리뷰까지 **전 여정** | `/hx-ticket` |

## 관련

- 규약 원본(설치 후): `.agents/rules/issue-tracker-workflow.md` · `.agents/rules/issue-agent-lock.md`
- 모듈 설치·경로 맵: `../hx-bootstrap/manifest.md`
- 킷 업데이트: `hx-update` · 에이전트 추가: `hx-agent-add`
