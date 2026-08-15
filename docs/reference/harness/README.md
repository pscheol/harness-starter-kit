# base-agent-harness

스택에 종속되지 않는 **에이전트 하네스 베이스**다. 어느 저장소에나 복사해 쓸 수 있다.

## 하네스란

에이전트가 일관되게 동작하도록 **저장소 안에 심어두는 규칙·문서·검증 장치의 묶음**이다.

에이전트는 세션마다 기억을 잃는다. 그래서 "지난번에 말했잖아"가 통하지 않는다. 유일한 해법은 **반복해야 할 것을 저장소에 인코딩**하는 것이다. 하네스는 그 인코딩의 구조다.

## 무엇이 들어 있나

```text
docs/harness/
├── README.md            # 이 문서 — 개요와 빠른 시작
├── ARCHITECTURE.md      # 5개 계층의 설계 원리와 근거
├── CUSTOMIZE.md         # 설치 후 프로젝트 적응 체크리스트
├── manifest.json        # 모듈·플레이스홀더·프리셋 정의
├── install.sh           # 복사 + 치환 설치 스크립트
└── template/
    ├── core/            # 어떤 저장소에나 설치하는 최소 골격
    └── optional/
        ├── jira-workflow/     # 이슈 트래커를 작업 큐로
        ├── design-system/     # 디자인 소스 단일 진실
        └── platform-guards/   # 불변 조건 기계 검사
```

## 빠른 시작

```bash
# 1. 무엇이 설치될지 먼저 확인
bash docs/harness/install.sh --target ../other-repo --dry-run

# 2. 실제 설치
bash docs/harness/install.sh \
  --target ../other-repo \
  --name "Acme Client" \
  --key ACME \
  --preset node-npm \
  --modules core,platform-guards

# 3. 대상 저장소에서
cd ../other-repo
node scripts/bootstrap-harness.cjs   # 심볼릭 생성
node scripts/verify-harness.cjs      # 계약 검사
```

설치는 **기존 파일을 덮어쓰기 전에 `.bak-<timestamp>`로 백업**한다. 내용이 같으면 건너뛴다.

### 프리셋

| 프리셋      | 스택                        |
| ----------- | --------------------------- |
| `node-npm`  | Node + npm (기본)           |
| `node-pnpm` | Node + pnpm                 |
| `python-uv` | Python + uv + ruff + pytest |
| `go`        | Go 표준 툴체인              |

프리셋에 없는 값은 `--set KEY=VALUE`로 개별 지정한다.

```bash
bash docs/harness/install.sh --target ../repo --preset go \
  --set SOURCE_DIR=internal --set DEFAULT_BRANCH=trunk
```

> 하네스 스크립트 자체는 Node로 동작한다. Python/Go 프로젝트에도 Node가 필요하다. 이 의존이 곤란하면 `scripts/*.cjs`를 해당 언어로 포팅하고 어댑터의 `command`만 바꾸면 된다 — 계약은 스크립트 인터페이스이지 언어가 아니다.

## 설계 요약

| 계층   | 역할                                         | 실체              |
| ------ | -------------------------------------------- | ----------------- |
| 진입점 | 목차. 도구별 심볼릭으로 하나의 원본을 비춘다 | `AGENTS.md`       |
| 정책   | 항상 적용되는 규칙                           | `.agents/rules/`  |
| 절차   | 도메인 진입 시에만 로드                      | `.agents/skills/` |
| 기록   | 작업 명세와 지식 베이스                      | `.agents/docs/`   |
| 실행   | **모든 절차의 실제 구현**                    | `scripts/`        |

핵심 불변 조건: **`scripts/`가 진실이고, 훅·슬래시 커맨드·도구 설정은 그 호출에 불과하다.** 새 도구를 붙일 때 어댑터에서 같은 스크립트를 부르게만 하면 정책이 자동으로 따라온다.

자세한 근거는 [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## 모듈 선택

| 모듈              | 설치 기준                                                            |
| ----------------- | -------------------------------------------------------------------- |
| `core`            | 항상                                                                 |
| `jira-workflow`   | 이슈 트래커를 실제 작업 큐로 쓰고, 에이전트가 티켓 상태를 읽고 쓸 때 |
| `design-system`   | 디자인 도구에 기준 문서가 있고 UI 작업 비중이 있을 때                |
| `platform-guards` | 회귀가 반복되는 불변 조건이 있고 기계로 검사 가능할 때               |

**필요 없는 모듈은 설치하지 않는다.** 안 쓰는 규칙 파일은 컨텍스트만 먹고, 지켜지지 않는 규칙은 나머지 규칙의 신뢰도를 깎는다.

## 설치가 끝이 아니다

코어를 설치하면 **골격만** 생긴다. 하네스가 실제로 값을 하려면 프로젝트 고유 지식을 채워야 한다.

특히 다음 둘은 비워두면 하네스가 절반만 동작한다.

- **`golden-rules.md` §6 불변 조건 표** — 이 프로젝트에서 항상 참이어야 하는 것
- **`pr-review-policy.md` negative knowledge 표** — 알지만 지금은 안 고치기로 한 것

전체 체크리스트는 [`CUSTOMIZE.md`](./CUSTOMIZE.md).

## 종속성이 모이는 곳

스택이 바뀌어도 스크립트를 고치지 않도록, 프로젝트마다 달라지는 값은 전부 한 파일에 모았다.

| 달라지는 것                  | 위치                            |
| ---------------------------- | ------------------------------- |
| 명령어(lint·test·build 등)   | `.agents/harness.json#commands` |
| 런타임 버전 요구             | `.agents/harness.json#runtime`  |
| 포맷·린트 대상 확장자와 경로 | `.agents/harness.json#format`   |
| 프로젝트 고유 검사           | `.agents/harness.json#guards`   |
| 파일 크기·진입점 예산        | `.agents/harness.json#budget`   |
| 사용하는 도구                | `.agents/harness.json#adapters` |
| 문서 언어                    | 설치 시 `DOC_LANGUAGE`          |

## 관련 문서

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — 왜 이렇게 설계했나
- [`CUSTOMIZE.md`](./CUSTOMIZE.md) — 설치 후 무엇을 채우나
- [`manifest.json`](./manifest.json) — 모듈·플레이스홀더 정의
